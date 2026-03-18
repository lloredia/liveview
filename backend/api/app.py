"""
FastAPI application factory for the Live View API service.

Creates the app with:
- REST routes (leagues, matches)
- WebSocket endpoint
- Middleware stack
- Health check endpoints
- Lifespan management (startup/shutdown)
- Background phase-sync task (auto-updates match phases)
- Background live-score refresh (fetches scores from ESPN every 30s)
"""
from __future__ import annotations

import asyncio
import json
import signal
import uuid as uuid_mod
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from typing import Any, AsyncGenerator, Dict, List, Optional, Union

import httpx
from fastapi import Depends, FastAPI, Query, WebSocket
from sqlalchemy import bindparam, func, or_, select, text

from shared.config import get_settings
from shared.match_phase import resolve_espn_phase
from shared.match_resolution import resolve_match_by_team_names, team_names_match
from shared.models.enums import MatchPhase
from shared.models.orm import (
    LeagueORM,
    MatchORM,
    MatchStateORM,
    MatchStatsORM,
    ProviderMappingORM,
    SportORM,
    TeamORM,
)
from shared.utils.database import DatabaseManager
from shared.utils.logging import get_logger, setup_logging
from shared.utils.metrics import (
    start_metrics_server,
    LIVE_REFRESH_ERRORS,
    LIVE_REFRESH_FALLBACKS,
    LIVE_REFRESH_UPDATES,
    LIVE_GAMES_DETECTED,
    PROVIDER_MAPPING_UNRESOLVED,
)
from shared.provider_mapping import ensure_provider_mapping_consistency
from shared.utils.redis_manager import RedisManager
from shared.tracing import init_tracing, shutdown_tracing
from shared.query_monitoring import init_query_monitoring

from api.dependencies import get_db, get_redis, init_dependencies
from api.middleware import setup_middleware
from api.routes.leagues import router as leagues_router
from api.routes.matches import router as matches_router
from api.routes.news import router as news_router
from api.routes.today import router as today_router
from ingest.news_fetcher import fetch_and_store_news
from shared.utils.circuit_breaker import CircuitBreaker, CircuitBreakerOpen
from api.ws.manager import WebSocketManager
from api.live_fallback import espn_retry, tsdb_fallback_for_league
from api.routes.notifications import router as notifications_router
from api.routes.admin import router as admin_router
from api.routes.auth_routes import router as auth_router
from api.routes.user_routes import router as user_router
from auth.deps import ensure_jwt_secret, _get_jwt_secret

logger = get_logger(__name__)

ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports"
LIVE_REFRESH_INTERVAL_S = 15

ESPN_STATUS_TO_PHASE: dict[str, MatchPhase] = {
    "STATUS_SCHEDULED": MatchPhase.SCHEDULED,
    "STATUS_IN_PROGRESS": MatchPhase.LIVE_FIRST_HALF,
    "STATUS_HALFTIME": MatchPhase.LIVE_HALFTIME,
    "STATUS_END_PERIOD": MatchPhase.BREAK,
    "STATUS_FINAL": MatchPhase.FINISHED,
    "STATUS_FULL_TIME": MatchPhase.FINISHED,
    "STATUS_POSTPONED": MatchPhase.POSTPONED,
    "STATUS_CANCELED": MatchPhase.CANCELLED,
    "STATUS_DELAYED": MatchPhase.SUSPENDED,
    "STATUS_RAIN_DELAY": MatchPhase.SUSPENDED,
}

ESPN_LEAGUE_SPORT: dict[str, str] = {
    "eng.1": "soccer", "eng.2": "soccer", "eng.fa": "soccer",
    "eng.league_cup": "soccer", "usa.1": "soccer", "esp.1": "soccer",
    "ger.1": "soccer", "ita.1": "soccer", "fra.1": "soccer",
    "ned.1": "soccer", "por.1": "soccer", "tur.1": "soccer",
    "sco.1": "soccer", "sau.1": "soccer",
    "uefa.champions": "soccer", "uefa.europa": "soccer",
    "uefa.europa.conf": "soccer",
    "nba": "basketball", "wnba": "basketball",
    "mens-college-basketball": "basketball",
    "womens-college-basketball": "basketball",
    "nhl": "hockey", "mlb": "baseball", "nfl": "football",
}

ESPN_STAT_NAME_MAP: dict[str, str] = {
    "rebounds": "rebounds", "assists": "assists",
    "fieldGoalPct": "field_goal_pct", "threePointFieldGoalPct": "three_point_pct",
    "freeThrowPct": "free_throw_pct",
    "fieldGoalsMade": "field_goals_made", "fieldGoalsAttempted": "field_goals_attempted",
    "threePointFieldGoalsMade": "three_point_made",
    "threePointFieldGoalsAttempted": "three_point_attempted",
    "freeThrowsMade": "free_throws_made", "freeThrowsAttempted": "free_throws_attempted",
    "turnovers": "turnovers", "steals": "steals", "blocks": "blocks",
}


async def _invalidate_today_cache(
    redis: RedisManager,
    dates: list[date] | None = None,
) -> None:
    """Invalidate cached /today payloads for the provided UTC dates across all tz offsets."""
    target_dates = dates or [datetime.now(timezone.utc).date()]
    for target_date in target_dates:
        pattern = f"today:{target_date.isoformat()}:*"
        keys = [key async for key in redis.client.scan_iter(match=pattern)]
        if keys:
            await redis.client.delete(*keys)


async def _invalidate_scoreboard_cache(
    redis: RedisManager,
    league_ids: set[str] | None = None,
) -> None:
    """Invalidate cached league scoreboards for changed leagues."""
    if not league_ids:
        return
    keys = [f"api:scoreboard:{league_id}" for league_id in league_ids]
    await redis.client.delete(*keys)


async def _invalidate_match_detail_cache(
    redis: RedisManager,
    match_ids: set[str] | None = None,
) -> None:
    """Invalidate cached match-center detail payloads for changed matches."""
    if not match_ids:
        return
    keys = [f"snap:match:{match_id}:details" for match_id in match_ids]
    await redis.client.delete(*keys)


async def _invalidate_match_stats_cache(
    redis: RedisManager,
    match_ids: set[str] | None = None,
) -> None:
    """Invalidate cached match stats payloads for changed matches."""
    if not match_ids:
        return
    keys = [f"snap:match:{match_id}:stats" for match_id in match_ids]
    await redis.client.delete(*keys)

SPORT_LEAGUE_ESPN_PATHS: dict[str, str] = {
    "eng.1": "soccer/eng.1",
    "eng.2": "soccer/eng.2",
    "eng.fa": "soccer/eng.fa",
    "eng.league_cup": "soccer/eng.league_cup",
    "usa.1": "soccer/usa.1",
    "esp.1": "soccer/esp.1",
    "ger.1": "soccer/ger.1",
    "ita.1": "soccer/ita.1",
    "fra.1": "soccer/fra.1",
    "ned.1": "soccer/ned.1",
    "por.1": "soccer/por.1",
    "tur.1": "soccer/tur.1",
    "sco.1": "soccer/sco.1",
    "sau.1": "soccer/sau.1",
    "uefa.champions": "soccer/uefa.champions",
    "uefa.europa": "soccer/uefa.europa",
    "uefa.europa.conf": "soccer/uefa.europa.conf",
    "nba": "basketball/nba",
    "wnba": "basketball/wnba",
    "mens-college-basketball": "basketball/mens-college-basketball",
    "womens-college-basketball": "basketball/womens-college-basketball",
    "nhl": "hockey/nhl",
    "mlb": "baseball/mlb",
    "nfl": "football/nfl",
}

# Module-level reference for the WS manager (accessed by the ws endpoint)
_ws_manager: WebSocketManager | None = None

espn_circuit_breaker = CircuitBreaker(
    name="espn_api",
    failure_threshold=5,
    recovery_timeout_s=120.0,
    half_open_max=1,
)


async def live_score_refresh_loop(
    db: DatabaseManager, redis: RedisManager, app: FastAPI
) -> None:
    """
    Background task that fetches live scores via provider router (SportRadar primary, ESPN fallback).
    Discovers which leagues have live/scheduled/recently-finished matches and updates DB.
    """
    await asyncio.sleep(5)  # let startup settle
    settings = get_settings()
    if not settings.espn_live_refresh_enabled:
        logger.info("live_score_refresh_disabled_by_flag")
        return
    logger.info("live_score_refresh_started")

    try:
        await _refresh_live_scores_via_router(db, redis, app)
    except Exception as exc:
        logger.warning("live_score_refresh_startup_error", error=str(exc))

    while True:
        try:
            await asyncio.sleep(LIVE_REFRESH_INTERVAL_S)
            await _refresh_live_scores_via_router(db, redis, app)
        except asyncio.CancelledError:
            logger.info("live_score_refresh_stopped")
            break
        except Exception as exc:
            logger.error("live_score_refresh_error", error=str(exc), exc_info=True)
            await asyncio.sleep(10)


async def _refresh_live_scores_via_router(
    db: DatabaseManager, redis: RedisManager, app: FastAPI
) -> int:
    """One cycle of live score refresh via provider router (SportRadar primary, ESPN fallback)."""
    settings = get_settings()
    postgame_recheck_delta = timedelta(minutes=max(15, settings.postgame_recheck_minutes))
    async with db.read_session() as session:
        live_phases = [p.value for p in MatchPhase if p.is_live]
        live_phases.append(MatchPhase.BREAK.value)
        live_phases.append(MatchPhase.PRE_MATCH.value)
        live_phases.append(MatchPhase.SCHEDULED.value)
        finished_cutoff = datetime.now(timezone.utc) - postgame_recheck_delta
        stmt = (
            select(ProviderMappingORM.provider_id.label("espn_league_id"))
            .select_from(MatchORM)
            .join(LeagueORM, MatchORM.league_id == LeagueORM.id)
            .join(
                ProviderMappingORM,
                (ProviderMappingORM.entity_type == "league")
                & (ProviderMappingORM.canonical_id == LeagueORM.id)
                & (ProviderMappingORM.provider == "espn"),
            )
            .where(
                or_(
                    MatchORM.phase.in_(live_phases),
                    (MatchORM.phase == MatchPhase.FINISHED.value) & (MatchORM.start_time >= finished_cutoff),
                )
            )
            .distinct()
        )
        result = await session.execute(stmt)
        league_ids = [row.espn_league_id for row in result.all()]

    if not league_ids:
        LIVE_GAMES_DETECTED.set(0)
        return 0

    LIVE_GAMES_DETECTED.set(len(league_ids))
    provider_router = getattr(app.state, "provider_router", None)
    if not provider_router:
        logger.warning("live_refresh_no_provider_router")
        return 0

    fetch_date = datetime.now(timezone.utc).date()
    updated = 0
    changed_league_ids: set[str] = set()
    changed_match_ids: set[str] = set()
    for league_slug in league_ids:
        sport = ESPN_LEAGUE_SPORT.get(league_slug, "soccer")
        try:
            result = await provider_router.fetch_daily_schedule(league_slug, fetch_date)
            matches = result.matches
            if result.from_fallback:
                logger.warning(
                    "serving_from_espn_fallback",
                    extra={"league_slug": league_slug, "date": str(fetch_date)},
                )
            league_updated, league_ids_changed, match_ids_changed = await _apply_provider_matches(db, matches, league_slug, sport)
            updated += league_updated
            changed_league_ids.update(league_ids_changed)
            changed_match_ids.update(match_ids_changed)
            if league_updated and matches:
                LIVE_REFRESH_UPDATES.labels(provider=matches[0].provider_name).inc(league_updated)
        except Exception as exc:
            LIVE_REFRESH_ERRORS.labels(provider="sportradar", league=league_slug).inc()
            logger.warning("live_refresh_provider_failed", league_slug=league_slug, error=str(exc))

    if updated > 0:
        logger.info("live_scores_refreshed", matches_updated=updated)
    try:
        await _invalidate_today_cache(redis)
        await _invalidate_scoreboard_cache(redis, changed_league_ids)
        await _invalidate_match_detail_cache(redis, changed_match_ids)
        await _invalidate_match_stats_cache(redis, changed_match_ids)
    except Exception:
        logger.warning("today_cache_invalidation_failed", exc_info=True)
    return updated


# LEGACY ESPN — remove after provider_router validation in staging.
# async def _refresh_live_scores(
#     db: DatabaseManager, redis: RedisManager, client: httpx.AsyncClient,
# ) -> int:
#     """One cycle of live score refresh. Returns number of matches updated."""
#     async with db.read_session() as session:
#         live_phases = [p.value for p in MatchPhase if p.is_live]
#         live_phases.append(MatchPhase.BREAK.value)
#         live_phases.append(MatchPhase.PRE_MATCH.value)
#         live_phases.append(MatchPhase.SCHEDULED.value)
#         finished_cutoff = datetime.now(timezone.utc) - timedelta(hours=48)
#         stmt = (
#             select(ProviderMappingORM.provider_id.label("espn_league_id"))
#             .select_from(MatchORM)
#             .join(LeagueORM, MatchORM.league_id == LeagueORM.id)
#             .join(...)
#         )
#         league_ids = [...]
#     for espn_league_id in league_ids:
#         url = f"{ESPN_BASE}/{path}/scoreboard"
#         resp = await client.get(url, timeout=10.0)
#         data = resp.json()
#         events = data.get("events", [])
#         updated += await _apply_espn_events(db, events, sport, espn_league_id)
#     ...


def _resolve_phase(espn_status: str, period_num: int, sport: str, espn_league_id: str = "") -> MatchPhase:
    """Backward-compatible wrapper around the shared ESPN phase resolver."""
    return resolve_espn_phase(espn_status, period_num, sport, espn_league_id)


def _competitor_score(competitor: dict[str, Any], sport: str) -> int:
    """Get total score for a competitor. Fall back to summing linescores if score is 0 (baseball, hockey, basketball)."""
    try:
        sc = int(competitor.get("score", "0"))
    except (ValueError, TypeError):
        sc = 0
    if sc > 0:
        return sc
    linescores = competitor.get("linescores", [])
    if isinstance(linescores, list) and linescores:
        for ls in linescores:
            if isinstance(ls, dict):
                val = ls.get("displayValue", ls.get("value"))
                if val is not None:
                    try:
                        sc += int(val)
                    except (ValueError, TypeError):
                        pass
    return sc


def _extract_team_stats(competitor: dict[str, Any]) -> dict[str, Any]:
    """Extract team stats from an ESPN competitor object into a flat dict."""
    raw_stats = competitor.get("statistics", [])
    stats: dict[str, Any] = {}
    for stat in raw_stats:
        name = stat.get("name", "")
        mapped = ESPN_STAT_NAME_MAP.get(name)
        if mapped:
            val = stat.get("displayValue", stat.get("value"))
            try:
                stats[mapped] = float(val) if val is not None else None
            except (ValueError, TypeError):
                stats[mapped] = val

    linescores = competitor.get("linescores", [])
    if linescores:
        stats["period_scores"] = [
            {"period": ls.get("period"), "score": ls.get("displayValue")}
            for ls in linescores
        ]

    return stats


async def _resolve_match_from_espn_event(
    session: Any,
    espn_league_id: str,
    event: dict[str, Any],
    competitors: list[dict[str, Any]],
) -> Optional[uuid_mod.UUID]:
    """
    Fallback: resolve our match_id from league + home/away team provider ids + event start time
    when provider_mappings has no match for this ESPN event id.
    """
    if not competitors or len(competitors) < 2:
        return None
    # League canonical id (raw SQL — no ORM in this path)
    league_row = (
        await session.execute(
            text("SELECT canonical_id FROM provider_mappings WHERE entity_type = 'league' AND provider = 'espn' AND provider_id = :pid"),
            {"pid": espn_league_id},
        )
    ).fetchone()
    if not league_row:
        return None
    league_id = league_row[0]

    # Event start time
    start_str = event.get("date") or (event.get("competitions") or [{}])[0].get("date", "")
    try:
        event_dt = datetime.fromisoformat(start_str.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
    # 15 min window to allow for timezone or start-time skew between our DB and ESPN
    window_start = event_dt - timedelta(minutes=15)
    window_end = event_dt + timedelta(minutes=15)

    # Resolve our home/away team ids from ESPN competitor team ids (try scoped then raw)
    home_id: Optional[uuid_mod.UUID] = None
    away_id: Optional[uuid_mod.UUID] = None
    for c in competitors:
        team_obj = c.get("team") or c
        raw_id = str(team_obj.get("id", ""))
        if not raw_id:
            continue
        scoped = f"{espn_league_id}:{raw_id}" if espn_league_id else raw_id
        row = None
        for pid in (scoped, raw_id):
            r = (
                await session.execute(
                    text("SELECT canonical_id FROM provider_mappings WHERE entity_type = 'team' AND provider = 'espn' AND provider_id = :pid"),
                    {"pid": pid},
                )
            ).fetchone()
            if r:
                row = r[0]
                break
        if row is not None:
            if c.get("homeAway") == "home":
                home_id = row
            else:
                away_id = row
    if not home_id or not away_id:
        return None

    # Find match in this league with these teams and start_time in window (raw SQL)
    match_row = (
        await session.execute(
            text(
                "SELECT id FROM matches WHERE league_id = :lid AND home_team_id = :hid AND away_team_id = :aid "
                "AND start_time >= :t0 AND start_time <= :t1"
            ),
            {"lid": league_id, "hid": home_id, "aid": away_id, "t0": window_start, "t1": window_end},
        )
    ).fetchone()
    return match_row[0] if match_row else None


async def _resolve_match_from_provider_match(
    session: Any,
    league_slug: str,
    provider_match: Any,
) -> Optional[tuple[uuid_mod.UUID, uuid_mod.UUID]]:
    """
    Resolve a canonical match for provider schedule rows when no direct mapping exists.

    Returns (match_id, league_id) when a single league/time/team match is found.
    """
    league_row = (
        await session.execute(
            text(
                "SELECT canonical_id FROM provider_mappings "
                "WHERE entity_type = 'league' AND provider = 'espn' AND provider_id = :pid"
            ),
            {"pid": league_slug},
        )
    ).fetchone()
    if not league_row:
        return None

    league_id = league_row[0]
    match_id = await resolve_match_by_team_names(
        session,
        provider=getattr(provider_match, "provider_name", "unknown"),
        provider_match_id=getattr(provider_match, "provider_id", ""),
        league_id=league_id,
        scheduled_at=provider_match.scheduled_at,
        home_name=provider_match.home_team.name,
        home_short=provider_match.home_team.short_name,
        away_name=provider_match.away_team.name,
        away_short=provider_match.away_team.short_name,
        window_minutes=90,
    )
    if not match_id:
        return None
    return match_id, league_id


def _provider_status_to_phase(status_value: str) -> str:
    """Map infra MatchStatus value to matches.phase / match_state.phase string."""
    m = {
        "scheduled": "scheduled",
        "pre_match": "pre_match",
        "live": "live_first_half",
        "break": "break",
        "live_halftime": "live_halftime",
        "finished": "finished",
        "postponed": "postponed",
        "cancelled": "cancelled",
        "suspended": "suspended",
    }
    return m.get((status_value or "").lower(), "scheduled")


async def _apply_provider_matches(
    db: DatabaseManager,
    matches: list[Any],
    league_slug: str,
    sport: str,
) -> tuple[int, set[str], set[str]]:
    """Apply ProviderMatch list to DB and return changed counts and IDs."""
    from infra.providers.base import ProviderMatch

    if not matches:
        return 0, set(), set()
    _notif_queue: list[tuple[str, Any]] = []
    count = 0
    changed_league_ids: set[str] = set()
    changed_match_ids: set[str] = set()
    async with db.write_session() as session:
        for pm in matches:
            if not isinstance(pm, ProviderMatch):
                continue
            try:
                mapping_row = (
                    await session.execute(
                        text(
                            "SELECT canonical_id FROM provider_mappings "
                            "WHERE entity_type = 'match' AND provider = :provider AND provider_id = :pid"
                        ),
                        {"provider": pm.provider_name, "pid": pm.provider_id},
                    )
                ).fetchone()
                match_id = mapping_row[0] if mapping_row else None
                if not match_id and pm.provider_name == "sportradar":
                    resolved = await _resolve_match_from_provider_match(session, league_slug, pm)
                    if resolved:
                        match_id, canonical_league_id = resolved
                        changed_league_ids.add(str(canonical_league_id))
                        mapping_persisted = await ensure_provider_mapping_consistency(
                            session,
                            entity_type="match",
                            conflict_event="provider_mapping_conflict",
                            provider="sportradar",
                            provider_id=pm.provider_id,
                            canonical_id=match_id,
                        )
                        if not mapping_persisted:
                            match_id = None
                if not match_id:
                    PROVIDER_MAPPING_UNRESOLVED.labels(
                        provider=getattr(pm, "provider_name", "unknown"),
                        reason="match_not_resolved",
                    ).inc()
                    logger.warning(
                        "provider_match_unresolved",
                        provider=getattr(pm, "provider_name", "unknown"),
                        provider_match_id=getattr(pm, "provider_id", ""),
                        league_slug=league_slug,
                    )
                    continue

                league_row = (
                    await session.execute(
                        text("SELECT league_id FROM matches WHERE id = :id"),
                        {"id": match_id},
                    )
                ).fetchone()
                if league_row and league_row[0]:
                    changed_league_ids.add(str(league_row[0]))

                phase_str = _provider_status_to_phase(pm.status.value)
                await session.execute(
                    text("UPDATE matches SET phase = :phase WHERE id = :id"),
                    {"phase": phase_str, "id": match_id},
                )
                state_row = (
                    await session.execute(
                        text(
                            "SELECT score_home, score_away, clock, phase, period, extra_data, version "
                            "FROM match_state WHERE match_id = :match_id"
                        ),
                        {"match_id": match_id},
                    )
                ).fetchone()
                clock_val = pm.clock or ""
                period_val = pm.period or ""
                extra_json = "{}"
                if state_row:
                    db_home = int(state_row[0]) if state_row[0] is not None else 0
                    db_away = int(state_row[1]) if state_row[1] is not None else 0
                    changed = (
                        db_home != pm.score.home
                        or db_away != pm.score.away
                        or state_row[2] != clock_val
                        or state_row[3] != phase_str
                    )
                    if changed:
                        new_version = (state_row[6] or 0) + 1
                        await session.execute(
                            text("""
                                UPDATE match_state SET
                                    score_home = :score_home, score_away = :score_away,
                                    clock = :clock, phase = :phase, period = :period,
                                    extra_data = :extra_data::jsonb, version = :version
                                WHERE match_id = :match_id
                            """),
                            {
                                "score_home": pm.score.home,
                                "score_away": pm.score.away,
                                "clock": clock_val,
                                "phase": phase_str,
                                "period": period_val,
                                "extra_data": extra_json,
                                "version": new_version,
                                "match_id": match_id,
                            },
                        )
                        count += 1
                        changed_match_ids.add(str(match_id))
                        name_row = (
                            await session.execute(
                                text(
                                    "SELECT ht.name, ht.short_name, at.name, at.short_name, l.name "
                                    "FROM matches m "
                                    "JOIN teams ht ON m.home_team_id = ht.id "
                                    "JOIN teams at ON m.away_team_id = at.id "
                                    "JOIN leagues l ON m.league_id = l.id "
                                    "WHERE m.id = :match_id"
                                ),
                                {"match_id": match_id},
                            )
                        ).fetchone()
                        home_name = name_row[0] if name_row else pm.home_team.name
                        home_short = name_row[1] if name_row else (pm.home_team.short_name or "HOM")
                        away_name = name_row[2] if name_row else pm.away_team.name
                        away_short = name_row[3] if name_row else (pm.away_team.short_name or "AWY")
                        league_name = name_row[4] if name_row else league_slug
                        _notif_queue.append((str(match_id), {
                            "score_home": pm.score.home,
                            "score_away": pm.score.away,
                            "phase": phase_str,
                            "clock": pm.clock,
                            "period": pm.period,
                            "sport": sport,
                            "league": league_name,
                            "home_name": home_name,
                            "away_name": away_name,
                            "home_short": home_short,
                            "away_short": away_short,
                        }))
                else:
                    await session.execute(
                        text("""
                            INSERT INTO match_state (match_id, score_home, score_away, score_breakdown, clock, phase, period, extra_data, version, seq)
                            VALUES (:match_id, :score_home, :score_away, '[]', :clock, :phase, :period, '{}'::jsonb, 1, 0)
                        """),
                        {
                            "match_id": match_id,
                            "score_home": pm.score.home,
                            "score_away": pm.score.away,
                            "clock": clock_val,
                            "phase": phase_str,
                            "period": period_val,
                        },
                    )
                    count += 1
                    changed_match_ids.add(str(match_id))
            except Exception as evt_exc:
                await session.rollback()
                logger.warning(
                    "provider_match_apply_error",
                    provider_id=pm.provider_id,
                    provider_name=pm.provider_name,
                    error=str(evt_exc),
                )

    if _notif_queue:
        try:
            from notifications.dispatcher import process_game_update
            from notifications.engine import GameState
            for game_id, info in _notif_queue:
                state = GameState(
                    game_id=game_id,
                    score_home=info["score_home"],
                    score_away=info["score_away"],
                    phase=info["phase"],
                    clock=info.get("clock"),
                    period=info.get("period"),
                    sport=info["sport"],
                    league=info["league"],
                    home_name=info["home_name"],
                    away_name=info["away_name"],
                    home_short=info["home_short"],
                    away_short=info["away_short"],
                )
                await process_game_update(db, game_id, state)
        except Exception as notif_exc:
            logger.warning("notification_processing_error", error=str(notif_exc))

    return count, changed_league_ids, changed_match_ids


async def _apply_espn_events(db: DatabaseManager, events: list[dict[str, Any]], sport: str = "soccer", espn_league_id: str = "") -> int:
    """Apply ESPN scoreboard events to our database. Returns count of updated matches."""
    if not events:
        return 0

    _notif_queue: list[tuple[str, Any]] = []

    count = 0
    async with db.write_session() as session:
        for idx, event in enumerate(events):
            try:
                espn_id = str(event.get("id", ""))
                if not espn_id:
                    continue

                competitions = event.get("competitions")
                if not competitions or not isinstance(competitions, list):
                    logger.debug("espn_event_no_competitions", espn_id=espn_id)
                    continue
                comp = competitions[0]
                competitors = comp.get("competitors", [])

                mapping_row = (
                    await session.execute(
                        text(
                            "SELECT canonical_id FROM provider_mappings "
                            "WHERE entity_type = 'match' AND provider = 'espn' AND provider_id = :pid"
                        ),
                        {"pid": espn_id},
                    )
                ).fetchone()
                match_id = mapping_row[0] if mapping_row else None
                match_source = "mapping" if match_id else None
                if not match_id:
                    match_id = await _resolve_match_from_espn_event(
                        session, espn_league_id, event, competitors
                    )
                    match_source = "fallback" if match_id else None
                    if match_id:
                        persisted = await ensure_provider_mapping_consistency(
                            session,
                            entity_type="match",
                            conflict_event="provider_mapping_conflict",
                            provider="espn",
                            provider_id=espn_id,
                            canonical_id=match_id,
                        )
                        if not persisted:
                            continue
                    else:
                        PROVIDER_MAPPING_UNRESOLVED.labels(
                            provider="espn",
                            reason="match_not_resolved",
                        ).inc()
                        logger.warning(
                            "provider_match_unresolved",
                            provider="espn",
                            provider_match_id=espn_id,
                            league_slug=espn_league_id,
                        )
                        continue

                score_home = 0
                score_away = 0
                aggregate_home: int | None = None
                aggregate_away: int | None = None
                home_stats: dict[str, Any] = {}
                away_stats: dict[str, Any] = {}

                for c in competitors:
                    sc = _competitor_score(c, sport)
                    try:
                        agg = int(c.get("aggregateScore", 0))
                    except (ValueError, TypeError):
                        agg = 0
                    if c.get("homeAway") == "home":
                        score_home = sc
                        if "aggregateScore" in c:
                            aggregate_home = agg
                        home_stats = _extract_team_stats(c)
                    else:
                        score_away = sc
                        if "aggregateScore" in c:
                            aggregate_away = agg
                        away_stats = _extract_team_stats(c)

                status_obj = comp.get("status", event.get("status", {}))
                if not isinstance(status_obj, dict):
                    status_obj = {}
                type_obj = status_obj.get("type", {})
                if not isinstance(type_obj, dict):
                    type_obj = {}
                espn_status = type_obj.get("name", "STATUS_SCHEDULED")
                try:
                    period_num = int(status_obj.get("period", 0))
                except (ValueError, TypeError):
                    period_num = 0
                phase = _resolve_phase(espn_status, period_num, sport, espn_league_id)
                clock = status_obj.get("displayClock")

                # Update match phase (no relationship access — async-safe)
                await session.execute(
                    text("UPDATE matches SET phase = :phase WHERE id = :id"),
                    {"phase": phase.value, "id": match_id},
                )

                # Update or create match state — raw SQL only (no ORM) to avoid async lazy-load on flush
                state_row = (
                    await session.execute(
                        text(
                            "SELECT score_home, score_away, clock, phase, period, extra_data, version "
                            "FROM match_state WHERE match_id = :match_id"
                        ),
                        {"match_id": match_id},
                    )
                ).fetchone()
                extra = {}
                if aggregate_home is not None and aggregate_away is not None:
                    extra["aggregate_home"] = aggregate_home
                    extra["aggregate_away"] = aggregate_away
                extra_json = json.dumps(extra) if extra else "{}"
                if state_row:
                    # state_row: (score_home, score_away, clock, phase, period, extra_data, version)
                    # Coerce to int so DB Decimal doesn't prevent updates
                    db_home = int(state_row[0]) if state_row[0] is not None else 0
                    db_away = int(state_row[1]) if state_row[1] is not None else 0
                    changed = (
                        db_home != score_home
                        or db_away != score_away
                        or state_row[2] != clock
                        or state_row[3] != phase.value
                        or (state_row[5] or {}) != extra
                    )
                    if changed:
                        period_val = str(period_num) if period_num else (state_row[4] or "")
                        new_version = (state_row[6] or 0) + 1
                        await session.execute(
                            text("""
                                UPDATE match_state SET
                                    score_home = :score_home, score_away = :score_away,
                                    clock = :clock, phase = :phase, period = :period,
                                    extra_data = :extra_data::jsonb, version = :version
                                WHERE match_id = :match_id
                            """),
                            {
                                "score_home": score_home,
                                "score_away": score_away,
                                "clock": clock or "",
                                "phase": phase.value,
                                "period": period_val,
                                "extra_data": extra_json,
                                "version": new_version,
                                "match_id": match_id,
                            },
                        )
                        count += 1

                        # Queue notification: get names via raw SQL (no ORM)
                        name_row = (
                            await session.execute(
                                text(
                                    "SELECT ht.name AS home_name, ht.short_name AS home_short, at.name AS away_name, at.short_name AS away_short, l.name AS league_name "
                                    "FROM matches m "
                                    "JOIN teams ht ON m.home_team_id = ht.id "
                                    "JOIN teams at ON m.away_team_id = at.id "
                                    "JOIN leagues l ON m.league_id = l.id "
                                    "WHERE m.id = :match_id"
                                ),
                                {"match_id": match_id},
                            )
                        ).fetchone()
                        # name_row: (home_name, home_short, away_name, away_short, league_name)
                        home_name = name_row[0] if name_row else "Home"
                        home_short = name_row[1] if name_row else "HOM"
                        away_name = name_row[2] if name_row else "Away"
                        away_short = name_row[3] if name_row else "AWY"
                        league_name = name_row[4] if name_row else espn_league_id

                        _notif_queue.append((str(match_id), {
                            "score_home": score_home,
                            "score_away": score_away,
                            "phase": phase.value,
                            "clock": clock,
                            "period": str(period_num) if period_num else None,
                            "sport": sport,
                            "league": league_name,
                            "home_name": home_name,
                            "away_name": away_name,
                            "home_short": home_short,
                            "away_short": away_short,
                        }))
                else:
                    # No match_state row yet — insert via raw SQL to avoid ORM relationship on flush
                    period_val = str(period_num) if period_num else None
                    await session.execute(
                        text("""
                            INSERT INTO match_state (match_id, score_home, score_away, score_breakdown, clock, phase, period, extra_data, version, seq)
                            VALUES (:match_id, :score_home, :score_away, '[]', :clock, :phase, :period, :extra_data::jsonb, 1, 0)
                        """),
                        {
                            "match_id": match_id,
                            "score_home": score_home,
                            "score_away": score_away,
                            "clock": clock or "",
                            "phase": phase.value,
                            "period": period_val or "",
                            "extra_data": extra_json,
                        },
                    )
                    count += 1

                # Upsert team statistics — raw SQL only (no ORM)
                if home_stats or away_stats:
                    stats_row = (
                        await session.execute(
                            text("SELECT id FROM match_stats WHERE match_id = :match_id"),
                            {"match_id": match_id},
                        )
                    ).fetchone()
                    stats_json_h = json.dumps(home_stats)
                    stats_json_a = json.dumps(away_stats)
                    if stats_row is not None:
                        await session.execute(
                            text("""
                                UPDATE match_stats SET home_stats = :home_stats::jsonb, away_stats = :away_stats::jsonb, version = version + 1
                                WHERE match_id = :match_id
                            """),
                            {"home_stats": stats_json_h, "away_stats": stats_json_a, "match_id": match_id},
                        )
                    else:
                        import uuid as _uuid
                        new_id = _uuid.uuid4()
                        await session.execute(
                            text("""
                                INSERT INTO match_stats (id, match_id, home_stats, away_stats, version, seq)
                                VALUES (:id, :match_id, :home_stats::jsonb, :away_stats::jsonb, 1, 0)
                            """),
                            {"id": new_id, "match_id": match_id, "home_stats": stats_json_h, "away_stats": stats_json_a},
                        )
            except Exception as evt_exc:
                await session.rollback()
                logger.warning(
                    "espn_event_parse_error",
                    espn_id=event.get("id", "?"),
                    sport=sport,
                    error=str(evt_exc),
                )

    # Process notification queue outside the DB session
    if _notif_queue:
        try:
            from notifications.dispatcher import process_game_update
            from notifications.engine import GameState
            for game_id, info in _notif_queue:
                state = GameState(
                    game_id=game_id,
                    score_home=info["score_home"],
                    score_away=info["score_away"],
                    phase=info["phase"],
                    clock=info.get("clock"),
                    period=info.get("period"),
                    sport=info["sport"],
                    league=info["league"],
                    home_name=info["home_name"],
                    away_name=info["away_name"],
                    home_short=info["home_short"],
                    away_short=info["away_short"],
                )
                await process_game_update(db, game_id, state)
        except Exception as notif_exc:
            logger.warning("notification_processing_error", error=str(notif_exc))

    return count


def _non_terminal_phase_values() -> tuple[str, ...]:
    """Phases that can be fallback-transitioned to finished after N hours (derived from enum)."""
    return tuple(p.value for p in MatchPhase if not p.is_terminal)


async def phase_sync_loop(db: DatabaseManager) -> None:
    """
    Background task: last-resort phase sync only.
    Does NOT transition scheduled->live or live->finished by time; ingest owns status.
    Only fallback: matches with phase in non-terminal phases and start_time < NOW() - N hours -> finished.
    Syncs match_state.phase -> matches.phase so match row reflects authoritative state from ingest.
    """
    settings = get_settings()
    fallback_hours = settings.phase_sync_fallback_hours
    non_terminal = _non_terminal_phase_values()

    while True:
        try:
            await asyncio.sleep(60)

            matches_checked = 0
            async with db.write_session() as session:
                logger.info(
                    "phase_sync.tick",
                    matches_checked=matches_checked,
                )

                # Fallback only: stale non-terminal state older than N hours should be finished.
                state_stmt = text("""
                    UPDATE match_state ms
                    SET phase = 'finished'
                    FROM matches m
                    WHERE ms.match_id = m.id
                      AND ms.phase IN :phases
                      AND m.start_time < NOW() - (INTERVAL '1 hour' * :hours)
                """).bindparams(bindparam("phases", expanding=True))
                await session.execute(
                    state_stmt,
                    {"phases": list(non_terminal), "hours": fallback_hours},
                )

                # Fallback only: matches still in non-terminal phase but started > N hours ago -> finished
                stmt = text("""
                    UPDATE matches
                    SET phase = 'finished'
                    WHERE phase IN :phases
                      AND start_time < NOW() - (INTERVAL '1 hour' * :hours)
                    RETURNING id, phase
                """).bindparams(bindparam("phases", expanding=True))
                finished_result = await session.execute(
                    stmt,
                    {"phases": list(non_terminal), "hours": fallback_hours},
                )
                rows = finished_result.fetchall()
                for row in rows:
                    match_id_val, old_phase = str(row[0]), (row[1] if len(row) > 1 else "live")
                    logger.info(
                        "phase_sync.fallback_transition",
                        match_id=match_id_val,
                        old_phase=old_phase,
                        new_phase="finished",
                        reason=f"elapsed_{fallback_hours}h_fallback",
                    )
                    logger.warning(
                        "stale_live_match_finalized",
                        match_id=match_id_val,
                        old_phase=old_phase,
                        fallback_hours=fallback_hours,
                    )
                matches_checked = len(rows)

                # Sync match_state.phase -> matches.phase (authoritative from ingest)
                await session.execute(text("""
                    UPDATE matches m
                    SET phase = ms.phase
                    FROM match_state ms
                    WHERE m.id = ms.match_id
                      AND m.phase IS DISTINCT FROM ms.phase
                """))

            logger.info(
                "phase_sync.tick",
                matches_checked=matches_checked,
            )

        except asyncio.CancelledError:
            logger.info("phase_sync_stopped")
            break
        except Exception as exc:
            logger.error("phase_sync_error", error=str(exc), exc_info=True)
            await asyncio.sleep(10)


async def news_fetch_loop(db: DatabaseManager) -> None:
    """Background task: fetch RSS feeds and store news. Interval from LV_NEWS_FETCH_INTERVAL_S."""
    await asyncio.sleep(10)  # let startup settle
    settings = get_settings()
    interval = max(60, getattr(settings, "news_fetch_interval_s", 300))
    logger.info("news_fetch_started", interval_s=interval)
    while True:
        try:
            await asyncio.sleep(interval)
            await fetch_and_store_news(db)
        except asyncio.CancelledError:
            logger.info("news_fetch_stopped")
            break
        except Exception as exc:
            logger.error("news_fetch_error", error=str(exc), exc_info=True)
            await asyncio.sleep(60)


# Retry connection on startup (e.g. Redis/DB not ready yet on Railway)
_CONNECT_RETRY_ATTEMPTS = 10
_CONNECT_RETRY_BASE_DELAY_S = 2.0


async def _connect_with_retry(connect_fn, name: str) -> None:
    """Call async connect_fn(); retry with exponential backoff on failure."""
    last_exc: Exception | None = None
    for attempt in range(1, _CONNECT_RETRY_ATTEMPTS + 1):
        try:
            await connect_fn()
            return
        except Exception as exc:
            last_exc = exc
            if attempt == _CONNECT_RETRY_ATTEMPTS:
                raise
            delay = _CONNECT_RETRY_BASE_DELAY_S * (2 ** (attempt - 1))
            logger.warning(
                "connect_retry",
                name=name,
                attempt=attempt,
                max_attempts=_CONNECT_RETRY_ATTEMPTS,
                delay_s=delay,
                error=str(exc),
            )
            await asyncio.sleep(delay)
    if last_exc:
        raise last_exc


@asynccontextmanager
async def _noop_lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """No-op lifespan for testing without DB/Redis."""
    yield


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Application lifespan manager.
    Handles startup (connect to Redis/Postgres, start WS manager) and
    shutdown (graceful cleanup).
    """
    global _ws_manager

    settings = get_settings()
    setup_logging("api")
    init_tracing()  # Initialize OpenTelemetry distributed tracing
    start_metrics_server(9090)

    # Initialize infrastructure (retry so healthcheck can pass once ready)
    redis = RedisManager(settings)
    db = DatabaseManager(settings)

    await _connect_with_retry(redis.connect, "Redis")
    await _connect_with_retry(db.connect, "Database")

    # Initialize database query monitoring (slow query detection + Prometheus metrics)
    slow_query_threshold_ms = int(getattr(settings, 'slow_query_threshold_ms', 500))
    init_query_monitoring(db.engine, slow_query_threshold_ms=slow_query_threshold_ms)

    # Initialize dependency injection
    init_dependencies(redis, db)

    # Fail fast if JWT secret missing (required for /v1/me, /v1/user/*, etc.)
    ensure_jwt_secret()

    # Start WebSocket manager
    _ws_manager = WebSocketManager(redis, settings)
    await _ws_manager.start()

    # Provider router: SportRadar primary, ESPN fallback
    from infra.providers import CircuitBreaker, ProviderRouter
    from infra.providers.espn import ESPNClient
    from infra.providers.sportradar import SportRadarClient
    from shared.config import SportRadarSettings

    sr_cfg = SportRadarSettings()
    espn = ESPNClient()
    if sr_cfg.is_configured:
        sportradar = SportRadarClient(
            api_key=sr_cfg.api_key,
            access_level=sr_cfg.access_level,
            daily_limit=sr_cfg.daily_limit,
            redis_client=redis.client,
            include_raw=sr_cfg.include_raw,
        )
        provider_router = ProviderRouter(
            primary=sportradar,
            fallback=espn,
            primary_circuit=CircuitBreaker(
                name="sportradar",
                failure_threshold=sr_cfg.cb_threshold,
                recovery_timeout_s=sr_cfg.cb_recovery_s,
            ),
        )
        logger.info("provider_router_started", primary="sportradar", fallback="espn")
    else:
        logger.warning("sportradar_api_key_missing", msg="LV_SPORTRADAR_API_KEY not set, using ESPN only")
        provider_router = ProviderRouter(
            primary=espn,
            fallback=espn,
            primary_circuit=CircuitBreaker(name="espn", failure_threshold=10, recovery_timeout_s=30.0),
        )
        logger.info("provider_router_started", primary="espn", fallback="espn")
    app.state.provider_router = provider_router

    # Keep schedules populated even when API is the only deployed service.
    from scheduler.service import ScheduleSyncService

    schedule_sync_service = ScheduleSyncService(db, redis=redis, settings=settings)
    schedule_sync_task = asyncio.create_task(schedule_sync_service.run())

    # Start background phase sync
    phase_sync_task = asyncio.create_task(phase_sync_loop(db))

    # Start live score refresh (SportRadar primary, ESPN fallback)
    live_refresh_task = asyncio.create_task(live_score_refresh_loop(db, redis, app))

    # Start news RSS aggregation (every 5 min)
    news_fetch_task = asyncio.create_task(news_fetch_loop(db))

    logger.info(
        "api_service_started",
        host=settings.api_host,
        port=settings.api_port,
    )

    yield

    # Shutdown
    schedule_sync_task.cancel()
    phase_sync_task.cancel()
    live_refresh_task.cancel()
    news_fetch_task.cancel()
    try:
        await schedule_sync_task
    except asyncio.CancelledError:
        pass
    try:
        await phase_sync_task
    except asyncio.CancelledError:
        pass
    try:
        await live_refresh_task
    except asyncio.CancelledError:
        pass
    try:
        await news_fetch_task
    except asyncio.CancelledError:
        pass

    if _ws_manager:
        await _ws_manager.stop()
    if getattr(app.state, "provider_router", None):
        await app.state.provider_router.close()
    await db.disconnect()
    await redis.disconnect()
    shutdown_tracing()  # Flush pending traces to Jaeger
    logger.info("api_service_stopped")


def create_app(*, use_lifespan: bool = True) -> FastAPI:
    """Create and configure the FastAPI application. Set use_lifespan=False for testing without DB/Redis."""
    settings = get_settings()

    app = FastAPI(
        title="Live View API",
        description="Real-time sports tracking platform",
        version="1.0.0",
        lifespan=lifespan if use_lifespan else _noop_lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # Middleware
    setup_middleware(app)

    # REST routes
    app.include_router(leagues_router)
    app.include_router(matches_router)
    app.include_router(news_router)
    app.include_router(today_router)
    app.include_router(notifications_router)
    app.include_router(admin_router)
    app.include_router(auth_router)
    app.include_router(user_router)

    # Health check
    @app.get("/health", tags=["system"])
    async def health() -> dict[str, str]:
        return {"status": "ok", "service": "api"}

    @app.post("/v1/refresh", tags=["system"])
    async def trigger_refresh(
        force: bool = Query(False, description="If true, run one refresh even when circuit is open (manual recovery)."),
        db: DatabaseManager = Depends(get_db),
        redis: RedisManager = Depends(get_redis),
    ) -> dict[str, Any]:
        """Run one live score refresh cycle and invalidate today cache. For manual/cron use."""
        async with httpx.AsyncClient(timeout=12.0) as client:
            if force:
                try:
                    updated = await _refresh_live_scores(db, redis, client)
                    await espn_circuit_breaker.record_success()
                except Exception as exc:
                    logger.warning("live_refresh_force_failed", error=str(exc))
                    return {"ok": False, "message": f"Force refresh failed: {exc!s}", "build": "live_scores_raw_sql"}
            else:
                try:
                    updated = await espn_circuit_breaker.call(_refresh_live_scores, db, redis, client)
                except CircuitBreakerOpen:
                    return {"ok": False, "message": "ESPN circuit breaker open, try again later or use ?force=true"}
        try:
            await _invalidate_today_cache(redis)
        except Exception:
            logger.warning("today_cache_invalidation_failed", exc_info=True)
        return {"ok": True, "message": "Refresh cycle run, today cache invalidated", "matches_updated": updated, "build": "live_scores_raw_sql"}

    @app.get("/ready", tags=["system"])
    async def readiness() -> Dict[str, Union[str, bool]]:
        """Readiness probe — checks downstream dependencies."""
        redis = get_redis()
        db = get_db()

        redis_ok = False
        db_ok = False

        try:
            await redis.client.ping()
            redis_ok = True
        except Exception:
            pass

        try:
            async with db.read_session() as session:
                await session.execute(text("SELECT 1"))
                db_ok = True
        except Exception:
            pass

        status = "ok" if (redis_ok and db_ok) else "degraded"
        return {
            "status": status,
            "redis": redis_ok,
            "database": db_ok,
        }

    @app.get("/v1/status", tags=["system"])
    async def system_status() -> dict[str, Any]:
        """Public status endpoint showing service health, provider status, and pipeline hints."""
        redis = get_redis()
        db = get_db()

        redis_ok = False
        db_ok = False
        try:
            await redis.client.ping()
            redis_ok = True
        except Exception:
            pass
        try:
            async with db.read_session() as session:
                await session.execute(text("SELECT 1"))
                db_ok = True
        except Exception:
            pass

        pipeline: dict[str, Any] = {}
        if db_ok:
            try:
                from datetime import datetime, timedelta, timezone
                now = datetime.now(timezone.utc)
                day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
                day_end = day_start + timedelta(days=1)
                async with db.read_session() as session:
                    r = await session.execute(
                        select(func.count()).select_from(MatchORM).where(
                            MatchORM.start_time >= day_start,
                            MatchORM.start_time < day_end,
                        )
                    )
                    pipeline["matches_today"] = r.scalar() or 0
            except Exception:
                pipeline["matches_today"] = None
        if redis_ok:
            try:
                last_sync = await redis.client.get("pipeline:last_schedule_sync")
                pipeline["last_schedule_sync"] = last_sync if isinstance(last_sync, str) else (last_sync.decode() if last_sync else None)
            except Exception:
                pipeline["last_schedule_sync"] = None

        # Live refresh debug info
        live_refresh_info: dict[str, Any] = {}
        settings = get_settings()
        live_refresh_info["espn_enabled"] = settings.espn_live_refresh_enabled
        live_refresh_info["fallback_enabled"] = settings.live_refresh_use_fallback
        live_refresh_info["interval_s"] = LIVE_REFRESH_INTERVAL_S

        if db_ok:
            try:
                async with db.read_session() as session:
                    live_count_r = await session.execute(
                        select(func.count()).select_from(MatchORM).where(
                            or_(MatchORM.phase.like("live%"), MatchORM.phase == "break")
                        )
                    )
                    live_refresh_info["live_matches_now"] = live_count_r.scalar() or 0
            except Exception:
                live_refresh_info["live_matches_now"] = None

        return {
            "build": "live_scores_raw_sql",
            "status": "ok" if (redis_ok and db_ok) else "degraded",
            "services": {
                "redis": redis_ok,
                "database": db_ok,
            },
            "providers": {
                "espn": {
                    **espn_circuit_breaker.stats,
                    "live_refresh_enabled": settings.espn_live_refresh_enabled,
                },
                "thesportsdb_fallback": {
                    "enabled": settings.live_refresh_use_fallback,
                },
            },
            "live_refresh": live_refresh_info,
            "pipeline": pipeline,
        }

    # WebSocket endpoint
    @app.websocket("/v1/ws")
    async def websocket_endpoint(ws: WebSocket, token: Optional[str] = Query(None)) -> None:
        """
        WebSocket endpoint for real-time match updates.

        Requires a valid JWT in the ?token= query parameter (same token used for REST API).

        Client operations:
        - subscribe: {"op": "subscribe", "match_id": "...", "tiers": [0, 1]}
        - unsubscribe: {"op": "unsubscribe", "match_id": "..."}
        - ping: {"op": "ping"}

        Server messages:
        - snapshot: Full state replay on subscribe
        - delta: Incremental update from live match
        - pong: Response to ping
        - error: Error notification
        - state: Connection state update
        """
        if _ws_manager is None:
            await ws.close(code=1013, reason="service_unavailable")
            return
        if not token:
            await ws.close(code=4001, reason="auth_required")
            return
        try:
            import jwt as pyjwt
            pyjwt.decode(
                token,
                _get_jwt_secret(),
                algorithms=["HS256"],
                options={"require": ["exp", "sub"]},
            )
        except Exception:
            await ws.close(code=4003, reason="invalid_token")
            return
        await _ws_manager.handle_connection(ws)

    return app


# For running with uvicorn directly
app = create_app()
