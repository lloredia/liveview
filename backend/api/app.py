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
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional, Union

import httpx
from fastapi import Depends, FastAPI, Query, WebSocket
from sqlalchemy import func, or_, select, text

from shared.config import get_settings
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
)
from shared.utils.redis_manager import RedisManager

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

logger = get_logger(__name__)

# #region agent log
def _debug_log(location: str, message: str, data: dict[str, Any], hypothesis_id: str = "") -> None:
    payload = {
        "sessionId": "38b46f",
        "timestamp": int(datetime.now(timezone.utc).timestamp() * 1000),
        "location": location,
        "message": message,
        "data": data,
        "hypothesisId": hypothesis_id,
    }
    line = json.dumps(payload)
    logger.info("DEBUG-38b46f %s", line)
    try:
        for base in (Path.cwd(), Path.cwd().parent, Path(__file__).resolve().parent.parent.parent):
            log_path = base / "debug-38b46f.log"
            try:
                with open(log_path, "a", encoding="utf-8") as f:
                    f.write(line + "\n")
                return
            except OSError:
                continue
    except Exception:
        pass
# #endregion

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

BASKETBALL_QUARTER_PHASE = {
    1: MatchPhase.LIVE_Q1, 2: MatchPhase.LIVE_Q2,
    3: MatchPhase.LIVE_Q3, 4: MatchPhase.LIVE_Q4,
}
BASKETBALL_HALF_PHASE = {
    1: MatchPhase.LIVE_H1, 2: MatchPhase.LIVE_H2,
}
HALVES_BASKETBALL_LEAGUES = {"mens-college-basketball"}

HOCKEY_PERIOD_PHASE = {
    1: MatchPhase.LIVE_P1, 2: MatchPhase.LIVE_P2, 3: MatchPhase.LIVE_P3,
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


async def live_score_refresh_loop(db: DatabaseManager, redis: RedisManager) -> None:
    """
    Background task that fetches live scores from ESPN every 30s.
    Discovers which leagues have live/recently-started matches,
    hits ESPN's scoreboard API, and updates scores + clock + phase in the DB.
    Uses a circuit breaker to avoid hammering ESPN when it's unresponsive.
    """
    await asyncio.sleep(5)  # let startup settle
    settings = get_settings()
    if not settings.espn_live_refresh_enabled:
        logger.info("live_score_refresh_disabled_by_flag")
        return
    logger.info("live_score_refresh_started")

    async with httpx.AsyncClient(timeout=12.0) as client:
        # Run one refresh immediately so scores are fresh right after deploy/cold start
        try:
            await espn_circuit_breaker.call(_refresh_live_scores, db, redis, client)
        except Exception as exc:
            logger.warning("live_score_refresh_startup_error", error=str(exc))

        while True:
            try:
                await asyncio.sleep(LIVE_REFRESH_INTERVAL_S)
                await espn_circuit_breaker.call(_refresh_live_scores, db, redis, client)
            except asyncio.CancelledError:
                logger.info("live_score_refresh_stopped")
                break
            except CircuitBreakerOpen as exc:
                logger.warning("espn_circuit_open", retry_after=exc.retry_after)
                await asyncio.sleep(min(exc.retry_after, 30))
            except Exception as exc:
                logger.error("live_score_refresh_error", error=str(exc), exc_info=True)
                await asyncio.sleep(10)


async def _refresh_live_scores(
    db: DatabaseManager, redis: RedisManager, client: httpx.AsyncClient,
) -> int:
    """One cycle of live score refresh. Returns number of matches updated."""
    # Find leagues that have live/scheduled matches OR recently finished (so we get final scores)
    async with db.read_session() as session:
        live_phases = [p.value for p in MatchPhase if p.is_live]
        live_phases.append(MatchPhase.BREAK.value)
        live_phases.append(MatchPhase.PRE_MATCH.value)
        live_phases.append(MatchPhase.SCHEDULED.value)
        finished_cutoff = datetime.now(timezone.utc) - timedelta(hours=48)

        stmt = (
            select(
                ProviderMappingORM.provider_id.label("espn_league_id"),
            )
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
        # #region agent log
        _debug_log("app.py:_refresh_live_scores", "no leagues to refresh", {"league_count": 0}, "E")
        # #endregion
        return 0

    # #region agent log
    _debug_log("app.py:_refresh_live_scores", "leagues to refresh", {"league_count": len(league_ids), "league_ids": league_ids[:5]}, "A")
    # #endregion
    LIVE_GAMES_DETECTED.set(len(league_ids))
    settings = get_settings()
    use_fallback = getattr(settings, "live_refresh_use_fallback", True)

    updated = 0
    for espn_league_id in league_ids:
        path = SPORT_LEAGUE_ESPN_PATHS.get(espn_league_id)
        if not path:
            continue
        sport = ESPN_LEAGUE_SPORT.get(espn_league_id, "soccer")
        espn_ok = False
        try:
            url = f"{ESPN_BASE}/{path}/scoreboard"
            resp = await client.get(url, timeout=10.0)
            resp.raise_for_status()
            data = resp.json()
            events = data.get("events", [])
            updated += await _apply_espn_events(db, events, sport, espn_league_id)
            espn_ok = True
        except Exception as exc:
            LIVE_REFRESH_ERRORS.labels(provider="espn", league=espn_league_id).inc()
            logger.warning("live_refresh_espn_failed", league=espn_league_id, error=str(exc))

            retry_data = await espn_retry(client, path, backoff_s=2.0)
            if retry_data:
                events = retry_data.get("events", [])
                espn_count = await _apply_espn_events(db, events, sport, espn_league_id)
                updated += espn_count
                espn_ok = True
                LIVE_REFRESH_UPDATES.labels(provider="espn").inc(espn_count)
                logger.info("live_refresh_espn_retry_ok", league=espn_league_id)

        if espn_ok:
            LIVE_REFRESH_UPDATES.labels(provider="espn").inc(updated)

        if not espn_ok and use_fallback:
            LIVE_REFRESH_FALLBACKS.labels(fallback_provider="thesportsdb", league=espn_league_id).inc()
            try:
                fb_count = await tsdb_fallback_for_league(client, db, espn_league_id, sport)
                updated += fb_count
                LIVE_REFRESH_UPDATES.labels(provider="thesportsdb").inc(fb_count)
                if fb_count:
                    logger.info("live_refresh_fallback_used", league=espn_league_id, provider="thesportsdb", matches=fb_count)
            except Exception as fb_exc:
                LIVE_REFRESH_ERRORS.labels(provider="thesportsdb", league=espn_league_id).inc()
                logger.warning("live_refresh_fallback_error", league=espn_league_id, error=str(fb_exc))

    if updated > 0:
        logger.info("live_scores_refreshed", matches_updated=updated)
    # Always invalidate today cache after refresh so next GET /today gets DB state (even when updated=0)
    today_key = f"today:{__import__('datetime').datetime.now(__import__('datetime').timezone.utc).date().isoformat()}"
    try:
        await redis.client.delete(today_key)
    except Exception:
        pass
    # #region agent log
    _debug_log("app.py:_refresh_live_scores", "refresh cycle done", {"matches_updated": updated, "league_count": len(league_ids)}, "B")
    # #endregion
    return updated


def _resolve_phase(espn_status: str, period_num: int, sport: str, espn_league_id: str = "") -> MatchPhase:
    """Map ESPN status + period + sport + league to the correct MatchPhase."""
    if espn_status in ("STATUS_FINAL", "STATUS_FULL_TIME"):
        return MatchPhase.FINISHED
    if espn_status == "STATUS_SCHEDULED":
        return MatchPhase.SCHEDULED
    if espn_status in ("STATUS_POSTPONED",):
        return MatchPhase.POSTPONED
    if espn_status in ("STATUS_CANCELED",):
        return MatchPhase.CANCELLED
    if espn_status in ("STATUS_DELAYED", "STATUS_RAIN_DELAY"):
        return MatchPhase.SUSPENDED
    if espn_status == "STATUS_HALFTIME":
        return MatchPhase.LIVE_HALFTIME
    if espn_status == "STATUS_END_PERIOD":
        return MatchPhase.BREAK

    # STATUS_IN_PROGRESS — use sport + league + period for specificity
    if sport == "basketball":
        if espn_league_id in HALVES_BASKETBALL_LEAGUES:
            if period_num > 2:
                return MatchPhase.LIVE_OT
            return BASKETBALL_HALF_PHASE.get(period_num, MatchPhase.LIVE_H1)
        if period_num > 4:
            return MatchPhase.LIVE_OT
        return BASKETBALL_QUARTER_PHASE.get(period_num, MatchPhase.LIVE_Q1)
    if sport == "hockey":
        if period_num > 3:
            return MatchPhase.LIVE_OT
        return HOCKEY_PERIOD_PHASE.get(period_num, MatchPhase.LIVE_P1)
    if sport == "football":
        if period_num > 4:
            return MatchPhase.LIVE_OT
        return BASKETBALL_QUARTER_PHASE.get(period_num, MatchPhase.LIVE_Q1)
    if sport == "baseball":
        return MatchPhase.LIVE_INNING
    # Soccer (default)
    if period_num == 1:
        return MatchPhase.LIVE_FIRST_HALF
    if period_num == 2:
        return MatchPhase.LIVE_SECOND_HALF
    if period_num == 3:
        return MatchPhase.LIVE_EXTRA_TIME
    return MatchPhase.LIVE_FIRST_HALF


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


async def _apply_espn_events(db: DatabaseManager, events: list[dict[str, Any]], sport: str = "soccer", espn_league_id: str = "") -> int:
    """Apply ESPN scoreboard events to our database. Returns count of updated matches."""
    if not events:
        return 0

    _notif_queue: list[tuple[str, Any]] = []

    count = 0
    skip_log_count = 0
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
                        # So next time we hit the fast path — raw INSERT to avoid ORM flush/lazy-load
                        await session.execute(
                            text(
                                "INSERT INTO provider_mappings (id, entity_type, canonical_id, provider, provider_id, extra_data, created_at, updated_at) "
                                "VALUES (:id, 'match', :canonical_id, 'espn', :provider_id, '{}', NOW(), NOW())"
                            ),
                            {
                                "id": uuid_mod.uuid4(),
                                "canonical_id": match_id,
                                "provider_id": espn_id,
                            },
                        )
                    else:
                        # #region agent log
                        if skip_log_count < 2:
                            _debug_log("app.py:_apply_espn_events", "event skipped no match_id", {"espn_id": espn_id, "league": espn_league_id}, "B")
                            skip_log_count += 1
                        # #endregion
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

                # #region agent log
                if count == 0 and events:
                    _debug_log("app.py:_apply_espn_events", "first event scores", {
                        "espn_id": espn_id, "league": espn_league_id, "match_source": match_source,
                        "score_home": score_home, "score_away": score_away,
                        "first_competitor_keys": list(competitors[0].keys()) if competitors else [],
                        "has_linescores": bool(competitors and competitors[0].get("linescores")) if competitors else False,
                    }, "C")
                # #endregion

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


async def phase_sync_loop(db: DatabaseManager) -> None:
    """
    Background task: last-resort phase sync only.
    Does NOT transition scheduled->live or live->finished by time; ingest owns status.
    Only fallback: matches with phase in ('live','scheduled') and start_time < NOW() - 5h -> finished.
    Syncs match_state.phase -> matches.phase so match row reflects authoritative state from ingest.
    """
    settings = get_settings()
    fallback_hours = settings.phase_sync_fallback_hours

    while True:
        try:
            await asyncio.sleep(60)

            matches_checked = 0
            async with db.write_session() as session:
                logger.info(
                    "phase_sync.tick",
                    matches_checked=matches_checked,
                )

                # Fallback only: matches still live/scheduled but started > N hours ago -> finished
                finished_result = await session.execute(text("""
                    UPDATE matches
                    SET phase = 'finished'
                    WHERE phase IN ('live', 'scheduled', 'live_first_half', 'live_second_half',
                      'live_q1', 'live_q2', 'live_q3', 'live_q4', 'live_halftime', 'break',
                      'live_p1', 'live_p2', 'live_p3', 'live_ot', 'live_inning')
                      AND start_time < NOW() - (INTERVAL '1 hour' * :hours)
                    RETURNING id, phase
                """), {"hours": fallback_hours})
                rows = finished_result.fetchall()
                for row in rows:
                    match_id_val, old_phase = str(row[0]), (row[1] if len(row) > 1 else "live")
                    logger.info(
                        "phase_sync.fallback_transition",
                        match_id=match_id_val,
                        old_phase=old_phase,
                        new_phase="finished",
                        reason="elapsed_5h_fallback",
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


NEWS_FETCH_INTERVAL_S = 300


async def news_fetch_loop(db: DatabaseManager) -> None:
    """Background task: fetch RSS feeds and store news every 5 minutes."""
    await asyncio.sleep(10)  # let startup settle
    logger.info("news_fetch_started")
    while True:
        try:
            await asyncio.sleep(NEWS_FETCH_INTERVAL_S)
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
    start_metrics_server(9090)

    # Initialize infrastructure (retry so healthcheck can pass once ready)
    redis = RedisManager(settings)
    db = DatabaseManager(settings)

    await _connect_with_retry(redis.connect, "Redis")
    await _connect_with_retry(db.connect, "Database")

    # Initialize dependency injection
    init_dependencies(redis, db)

    # Start WebSocket manager
    _ws_manager = WebSocketManager(redis, settings)
    await _ws_manager.start()

    # Start background phase sync
    phase_sync_task = asyncio.create_task(phase_sync_loop(db))

    # Start live score refresh (fetches from ESPN every 30s)
    live_refresh_task = asyncio.create_task(live_score_refresh_loop(db, redis))

    # Start news RSS aggregation (every 5 min)
    news_fetch_task = asyncio.create_task(news_fetch_loop(db))

    logger.info(
        "api_service_started",
        host=settings.api_host,
        port=settings.api_port,
    )

    yield

    # Shutdown
    phase_sync_task.cancel()
    live_refresh_task.cancel()
    news_fetch_task.cancel()
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
    await db.disconnect()
    await redis.disconnect()
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
        today_key = f"today:{datetime.now(timezone.utc).date().isoformat()}"
        try:
            await redis.client.delete(today_key)
        except Exception:
            pass
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
    async def websocket_endpoint(ws: WebSocket) -> None:
        """
        WebSocket endpoint for real-time match updates.

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
        await _ws_manager.handle_connection(ws)

    return app


# For running with uvicorn directly
app = create_app()