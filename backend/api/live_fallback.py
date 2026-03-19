"""
Fallback live score fetcher for the API server.

Used when ESPN returns errors for a league during the 30s refresh cycle.
Strategy:
  1. Retry ESPN once with backoff.
  2. If retry fails, try TheSportsDB eventsday endpoint (returns today's
     events with scores; free tier does not have real-time livescore).

The fallback writes the same DB shape as _apply_espn_events so the rest
of the pipeline (today cache, scoreboard routes, frontend) sees no diff.
"""
from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import select, text

from shared.config import get_settings
from shared.models.enums import MatchPhase
from shared.models.orm import MatchORM, ProviderMappingORM
from shared.utils.database import DatabaseManager
from shared.utils.logging import get_logger

logger = get_logger(__name__)

ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports"
TSDB_BASE = "https://www.thesportsdb.com/api/v1/json"

TSDB_LEAGUE_MAP: dict[str, str] = {
    "eng.1": "4328", "esp.1": "4335", "ger.1": "4331", "ita.1": "4332",
    "fra.1": "4334", "ned.1": "4337", "por.1": "4344", "tur.1": "4339",
    "usa.1": "4346", "sco.1": "4330",
    "nba": "4387", "wnba": "4962",
    "nhl": "4380", "mlb": "4424", "nfl": "4391",
}

TSDB_STATUS_TO_PHASE: dict[str, MatchPhase] = {
    "not started": MatchPhase.SCHEDULED, "ns": MatchPhase.SCHEDULED,
    "ft": MatchPhase.FINISHED, "match finished": MatchPhase.FINISHED,
    "finished": MatchPhase.FINISHED, "aet": MatchPhase.FINISHED,
    "1h": MatchPhase.LIVE_FIRST_HALF, "2h": MatchPhase.LIVE_SECOND_HALF,
    "ht": MatchPhase.LIVE_HALFTIME, "et": MatchPhase.LIVE_EXTRA_TIME,
    "live": MatchPhase.LIVE_FIRST_HALF,
    "postponed": MatchPhase.POSTPONED, "cancelled": MatchPhase.CANCELLED,
    "q1": MatchPhase.LIVE_Q1, "q2": MatchPhase.LIVE_Q2,
    "q3": MatchPhase.LIVE_Q3, "q4": MatchPhase.LIVE_Q4,
    "h1": MatchPhase.LIVE_H1, "h2": MatchPhase.LIVE_H2,
    "p1": MatchPhase.LIVE_P1, "p2": MatchPhase.LIVE_P2,
    "p3": MatchPhase.LIVE_P3, "ot": MatchPhase.LIVE_OT,
}


async def espn_retry(
    client: httpx.AsyncClient,
    espn_path: str,
    *,
    backoff_s: float = 2.0,
) -> dict[str, Any] | None:
    """Single ESPN retry with backoff. Returns parsed JSON or None."""
    await asyncio.sleep(backoff_s)
    try:
        url = f"{ESPN_BASE}/{espn_path}/scoreboard"
        resp = await client.get(url, timeout=10.0)
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        logger.debug("espn_retry_failed", path=espn_path, error=str(exc))
        return None


async def tsdb_fallback_for_league(
    client: httpx.AsyncClient,
    db: DatabaseManager,
    espn_league_id: str,
    sport: str,
) -> int:
    """
    Fetch today's events from TheSportsDB for one league and update DB.
    Returns count of updated matches.
    """
    tsdb_league = TSDB_LEAGUE_MAP.get(espn_league_id)
    if not tsdb_league:
        return 0

    tsdb_key = _get_tsdb_key()
    if not tsdb_key:
        logger.debug("tsdb_fallback_not_configured", league=espn_league_id)
        return 0

    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    url = f"{TSDB_BASE}/{tsdb_key}/eventsday.php"
    try:
        resp = await client.get(url, params={"d": today_str, "l": tsdb_league}, timeout=10.0)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.warning("tsdb_fallback_fetch_error", league=espn_league_id, error=str(exc))
        return 0

    events = data.get("events") or []
    if not events:
        logger.debug("tsdb_fallback_no_events", league=espn_league_id)
        return 0

    count = 0
    async with db.write_session() as session:
        for ev in events:
            try:
                home_name = (ev.get("strHomeTeam") or "").strip()
                away_name = (ev.get("strAwayTeam") or "").strip()
                if not home_name or not away_name:
                    continue

                home_score = _safe_int(ev.get("intHomeScore"))
                away_score = _safe_int(ev.get("intAwayScore"))
                if home_score is None or away_score is None:
                    continue

                status_raw = (ev.get("strStatus") or "").strip().lower()
                phase = TSDB_STATUS_TO_PHASE.get(status_raw, MatchPhase.SCHEDULED)

                tsdb_event_id = str(ev.get("idEvent", ""))
                match_id = None

                if tsdb_event_id:
                    row = (
                        await session.execute(
                            text(
                                "SELECT canonical_id FROM provider_mappings "
                                "WHERE entity_type = 'match' AND provider = 'thesportsdb' AND provider_id = :pid"
                            ),
                            {"pid": tsdb_event_id},
                        )
                    ).fetchone()
                    match_id = row[0] if row else None

                if not match_id:
                    match_id = await _fuzzy_match_by_teams(session, home_name, away_name, espn_league_id)

                if not match_id:
                    continue

                # Raw SQL only — avoid ORM (MatchStateORM.match lazy-load on flush)
                state_row = (
                    await session.execute(
                        text("SELECT score_home, score_away, phase, version FROM match_state WHERE match_id = :mid"),
                        {"mid": match_id},
                    )
                ).fetchone()
                if state_row:
                    changed = (
                        state_row[0] != home_score
                        or state_row[1] != away_score
                        or state_row[2] != phase.value
                    )
                    if changed:
                        new_ver = (state_row[3] or 0) + 1
                        await session.execute(
                            text(
                                "UPDATE match_state SET score_home = :sh, score_away = :sa, phase = :ph, version = :ver WHERE match_id = :mid"
                            ),
                            {"sh": home_score, "sa": away_score, "ph": phase.value, "ver": new_ver, "mid": match_id},
                        )
                        count += 1

                await session.execute(
                    text("UPDATE matches SET phase = :phase WHERE id = :id"),
                    {"phase": phase.value, "id": match_id},
                )

            except Exception as exc:
                logger.debug("tsdb_fallback_event_error", event_id=ev.get("idEvent"), error=str(exc))

    if count:
        logger.info("tsdb_fallback_applied", league=espn_league_id, matches_updated=count)
    return count


async def _fuzzy_match_by_teams(session: Any, home: str, away: str, espn_league_id: str) -> Any:
    """Try to find a match in the DB by home/away team names + league."""
    from shared.models.orm import LeagueORM, TeamORM
    from sqlalchemy import and_, func

    league_stmt = select(ProviderMappingORM.canonical_id).where(
        ProviderMappingORM.entity_type == "league",
        ProviderMappingORM.provider == "espn",
        ProviderMappingORM.provider_id == espn_league_id,
    )
    league_id = (await session.execute(league_stmt)).scalar_one_or_none()
    if not league_id:
        return None

    home_lower = home.lower()
    away_lower = away.lower()
    ht = TeamORM.__table__.alias("ht")
    at = TeamORM.__table__.alias("at")
    stmt = (
        select(MatchORM.id)
        .outerjoin(ht, MatchORM.home_team_id == ht.c.id)
        .outerjoin(at, MatchORM.away_team_id == at.c.id)
        .where(
            MatchORM.league_id == league_id,
            func.lower(ht.c.name).contains(home_lower) | func.lower(ht.c.short_name).contains(home_lower),
            func.lower(at.c.name).contains(away_lower) | func.lower(at.c.short_name).contains(away_lower),
            MatchORM.phase.in_([p.value for p in MatchPhase if p.is_live or p == MatchPhase.SCHEDULED or p == MatchPhase.FINISHED]),
        )
        .order_by(MatchORM.start_time.desc())
        .limit(1)
    )
    return (await session.execute(stmt)).scalar_one_or_none()


def _safe_int(val: Any) -> int | None:
    if val is None:
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


def _get_tsdb_key() -> str:
    settings = get_settings()
    configured = (settings.thesportsdb_api_key or "").strip()
    if configured:
        return configured

    legacy = os.getenv("LV_THESPORTSDB_API_KEY") or os.getenv("THESPORTSDB_API_KEY") or ""
    legacy = legacy.strip()
    if legacy:
        return legacy

    runtime_env = (os.getenv("LV_ENV") or settings.environment.value).lower()
    if runtime_env in {"production", "prod"}:
        return ""

    return "3"
