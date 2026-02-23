"""
Match REST endpoints.

GET /v1/matches/{id}          — Match center (scoreboard + metadata).
GET /v1/matches/{id}/timeline — Ordered event timeline for a match.
GET /v1/matches/{id}/stats    — Team and player statistics.
GET /v1/matches/{id}/lineup   — Lineup from Football-Data.org (soccer only).
GET /v1/matches/{id}/player-stats — Player stats from Football-Data.org when ESPN has none (soccer).
"""
from __future__ import annotations

import hashlib
import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import select

from shared.config import get_settings
from shared.models.orm import (
    LeagueORM,
    MatchEventORM,
    MatchORM,
    MatchStateORM,
    MatchStatsORM,
    ProviderMappingORM,
    SportORM,
    TeamORM,
)
from shared.utils.database import DatabaseManager
from shared.utils.logging import get_logger
from shared.utils.redis_manager import RedisManager

from api.dependencies import get_db, get_redis

logger = get_logger(__name__)
router = APIRouter(prefix="/v1/matches", tags=["matches"])


@router.get("/{match_id}")
async def get_match_center(
    match_id: uuid.UUID,
    request: Request,
    response: Response,
    db: DatabaseManager = Depends(get_db),
    redis: RedisManager = Depends(get_redis),
) -> dict[str, Any]:
    """
    Get the match center view — scoreboard, teams, and current match state.

    This is the primary endpoint for rendering a match detail view.
    Supports ETag-based conditional requests.
    """
    # Try Redis snapshot first
    snap_key = f"snap:match:{match_id}:scoreboard"
    cached = await redis.client.get(snap_key)

    if cached:
        etag = _compute_etag(cached)
        if_none_match = request.headers.get("if-none-match")
        if if_none_match and if_none_match == etag:
            return Response(status_code=304)

    async with db.read_session() as session:
        ht = TeamORM.__table__.alias("ht")
        at = TeamORM.__table__.alias("at")

        stmt = (
            select(
                MatchORM.id,
                MatchORM.phase,
                MatchORM.start_time,
                MatchORM.venue,
                MatchStateORM.score_home,
                MatchStateORM.score_away,
                MatchStateORM.clock,
                MatchStateORM.period,
                MatchStateORM.score_breakdown,
                MatchStateORM.version,
                ht.c.id.label("ht_id"),
                ht.c.name.label("ht_name"),
                ht.c.short_name.label("ht_short"),
                ht.c.logo_url.label("ht_logo"),
                at.c.id.label("at_id"),
                at.c.name.label("at_name"),
                at.c.short_name.label("at_short"),
                at.c.logo_url.label("at_logo"),
                LeagueORM.id.label("league_id"),
                LeagueORM.name.label("league_name"),
            )
            .outerjoin(MatchStateORM, MatchORM.id == MatchStateORM.match_id)
            .outerjoin(ht, MatchORM.home_team_id == ht.c.id)
            .outerjoin(at, MatchORM.away_team_id == at.c.id)
            .join(LeagueORM, MatchORM.league_id == LeagueORM.id)
            .where(MatchORM.id == match_id)
        )
        result = await session.execute(stmt)
        row = result.one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="Match not found")

        home_team = {"id": str(row.ht_id), "name": row.ht_name, "short_name": row.ht_short, "logo_url": row.ht_logo} if row.ht_id else None
        away_team = {"id": str(row.at_id), "name": row.at_name, "short_name": row.at_short, "logo_url": row.at_logo} if row.at_id else None
        league = {"id": str(row.league_id), "name": row.league_name} if getattr(row, "league_id", None) else None

        state = row if row.score_home is not None else None

        events_stmt = (
            select(MatchEventORM)
            .where(MatchEventORM.match_id == match_id)
            .order_by(MatchEventORM.seq.desc())
            .limit(5)
        )
        events_result = await session.execute(events_stmt)
        recent_events = [
            _event_orm_to_dict(e) for e in events_result.scalars().all()
        ]

    payload = {
        "match": {
            "id": str(row.id),
            "phase": row.phase,
            "start_time": row.start_time.isoformat() if row.start_time else None,
            "venue": row.venue,
            "home_team": home_team,
            "away_team": away_team,
        },
        "state": {
            "score_home": row.score_home if state else 0,
            "score_away": row.score_away if state else 0,
            "clock": row.clock if state else None,
            "period": row.period if state else None,
            "period_scores": (
                json.loads(row.score_breakdown)
                if state and isinstance(row.score_breakdown, str)
                else (row.score_breakdown if state and row.score_breakdown else [])
            ),
            "version": row.version if state else 0,
        } if state else None,
        "recent_events": recent_events,
        "league": league,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    payload_json = json.dumps(payload, default=str)
    etag = _compute_etag(payload_json)
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "public, max-age=2"

    return payload


@router.get("/{match_id}/timeline")
async def get_match_timeline(
    match_id: uuid.UUID,
    request: Request,
    response: Response,
    after_seq: Optional[int] = Query(
        None, description="Return only events after this sequence number (for pagination)"
    ),
    limit: int = Query(100, ge=1, le=500, description="Maximum events to return"),
    include_synthetic: bool = Query(
        True, description="Include synthetic (inferred) events"
    ),
    db: DatabaseManager = Depends(get_db),
    redis: RedisManager = Depends(get_redis),
) -> dict[str, Any]:
    """
    Get the event timeline for a match.

    Events are ordered by (minute, second, seq) ascending.
    Supports cursor-based pagination via `after_seq`.
    Synthetic events are included by default and marked with `synthetic: true`.
    """
    async with db.read_session() as session:
        # Verify match exists
        match_stmt = select(MatchORM.id, MatchORM.phase).where(MatchORM.id == match_id)
        match_result = await session.execute(match_stmt)
        match_row = match_result.one_or_none()
        if match_row is None:
            raise HTTPException(status_code=404, detail="Match not found")

        # Build query
        stmt = (
            select(MatchEventORM)
            .where(MatchEventORM.match_id == match_id)
        )

        if not include_synthetic:
            stmt = stmt.where(MatchEventORM.synthetic == False)  # noqa: E712

        if after_seq is not None:
            stmt = stmt.where(MatchEventORM.seq > after_seq)

        stmt = stmt.order_by(
            MatchEventORM.minute.asc().nullsfirst(),
            MatchEventORM.second.asc().nullsfirst(),
            MatchEventORM.seq.asc(),
        ).limit(limit)

        result = await session.execute(stmt)
        events = [_event_orm_to_dict(e) for e in result.scalars().all()]

    # Determine next cursor
    next_seq = events[-1]["seq"] if events else None

    payload = {
        "match_id": str(match_id),
        "phase": match_row.phase,
        "events": events,
        "count": len(events),
        "next_seq": next_seq,
        "has_more": len(events) == limit,
    }

    # Short cache — timeline changes frequently during live matches
    response.headers["Cache-Control"] = "public, max-age=1"
    return payload


@router.get("/{match_id}/stats")
async def get_match_stats(
    match_id: uuid.UUID,
    request: Request,
    response: Response,
    db: DatabaseManager = Depends(get_db),
    redis: RedisManager = Depends(get_redis),
) -> dict[str, Any]:
    """
    Get team-level statistics for a match.

    Returns possession, shots, fouls, corners, and other sport-specific stats.
    """
    # Check Redis snapshot
    snap_key = f"snap:match:{match_id}:stats"
    cached = await redis.client.get(snap_key)
    if cached:
        etag = _compute_etag(cached)
        if_none_match = request.headers.get("if-none-match")
        if if_none_match and if_none_match == etag:
            return Response(status_code=304)
        data = json.loads(cached)
        response.headers["ETag"] = etag
        response.headers["Cache-Control"] = "public, max-age=5"
        return data

    async with db.read_session() as session:
        ht = TeamORM.__table__.alias("ht")
        at = TeamORM.__table__.alias("at")

        match_stmt = (
            select(
                MatchORM.id,
                MatchORM.home_team_id,
                MatchORM.away_team_id,
                ht.c.short_name.label("ht_short"),
                ht.c.name.label("ht_name"),
                at.c.short_name.label("at_short"),
                at.c.name.label("at_name"),
            )
            .outerjoin(ht, MatchORM.home_team_id == ht.c.id)
            .outerjoin(at, MatchORM.away_team_id == at.c.id)
            .where(MatchORM.id == match_id)
        )
        match_result = await session.execute(match_stmt)
        match_row = match_result.one_or_none()
        if match_row is None:
            raise HTTPException(status_code=404, detail="Match not found")

        stats_stmt = select(MatchStatsORM).where(MatchStatsORM.match_id == match_id)
        stats_result = await session.execute(stats_stmt)
        stats = stats_result.scalar_one_or_none()

        teams_stats = []
        if stats:
            for side, team_id, team_name, stats_data in [
                ("home", match_row.home_team_id, match_row.ht_short or match_row.ht_name, stats.home_stats),
                ("away", match_row.away_team_id, match_row.at_short or match_row.at_name, stats.away_stats),
            ]:
                teams_stats.append({
                    "team_id": str(team_id) if team_id else None,
                    "team_name": team_name,
                    "side": side,
                    "stats": stats_data or {},
                })

    payload = {
        "match_id": str(match_id),
        "teams": teams_stats,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    payload_json = json.dumps(payload, default=str)
    etag = _compute_etag(payload_json)
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "public, max-age=5"

    return payload


# Football-Data.org competition codes for lineup lookup (soccer)
_LEAGUE_TO_FD_CODE: dict[str, str] = {
    "Premier League": "PL",
    "La Liga": "PD",
    "Bundesliga": "BL1",
    "Serie A": "SA",
    "Ligue 1": "FL1",
    "Champions League": "CL",
    "UEFA Champions League": "CL",
    "Europa League": "EL",
    "UEFA Europa League": "EL",
    "Conference League": "UECL",
    "UEFA Europa Conference League": "UECL",
    "Championship": "ELC",
    "FA Cup": "FAC",
    "EFL Cup": "ELC",
    "Eredivisie": "DED",
    "Liga Portugal": "PPL",
    "Scottish Premiership": "SC0",
    "Turkish Super Lig": "TSL",
    "Saudi Pro League": "SAU",
}


def _normalize_team_name(name: Optional[str]) -> str:
    """Lowercase, alphanumeric only for fuzzy match."""
    if not name:
        return ""
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


# Soccer suffixes to strip so "Angers SCO" / "Lille OSC" match "Angers" / "Lille"
_FD_STRIP_SUFFIXES = (
    "sco", "osc", "losc", "fc", "cf", "cfc", "sc", "united", "city", "hotspur",
    "rangers", "athletic", "wanderers", "albion", "rovers", "county", "town",
)


def _team_names_match(our_home: str, our_away: str, fd_home: str, fd_away: str) -> bool:
    """True if our home/away pair matches Football-Data.org home/away (fuzzy)."""
    def norm(s: str) -> str:
        n = _normalize_team_name(s)
        for suf in _FD_STRIP_SUFFIXES:
            if len(n) > len(suf) and n.endswith(suf):
                n = n[: -len(suf)]
                break
        return n

    def names_match(a: str, b: str) -> bool:
        an, bn = norm(a), norm(b)
        if not an or not bn:
            return an == bn
        if an == bn:
            return True
        # One contains the other (e.g. "angers" vs "angerssco", "lille" vs "lilleosc")
        if an in bn or bn in an:
            return True
        return False

    return names_match(our_home, fd_home) and names_match(our_away, fd_away)


@router.get("/{match_id}/lineup")
async def get_match_lineup(
    match_id: uuid.UUID,
    db: DatabaseManager = Depends(get_db),
) -> dict[str, Any]:
    """
    Get lineup (formation, starters, bench) from Football-Data.org for a soccer match.

    Requires LV_FOOTBALL_DATA_API_KEY. Resolves our match to their match by
    provider_mappings or by league + date + team names. Returns home/away
    formation, lineup, and bench when available.
    """
    settings = get_settings()
    if not settings.football_data_api_key:
        return {"source": None, "home": None, "away": None, "message": "Football-Data.org API key not configured"}

    async with db.read_session() as session:
        ht = TeamORM.__table__.alias("ht")
        at = TeamORM.__table__.alias("at")
        stmt = (
            select(
                MatchORM.id,
                MatchORM.start_time,
                LeagueORM.name.label("league_name"),
                SportORM.sport_type,
                ht.c.name.label("ht_name"),
                at.c.name.label("at_name"),
            )
            .join(LeagueORM, MatchORM.league_id == LeagueORM.id)
            .join(SportORM, LeagueORM.sport_id == SportORM.id)
            .outerjoin(ht, MatchORM.home_team_id == ht.c.id)
            .outerjoin(at, MatchORM.away_team_id == at.c.id)
            .where(MatchORM.id == match_id)
        )
        result = await session.execute(stmt)
        row = result.one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="Match not found")
        if row.sport_type != "soccer":
            return {"source": None, "home": None, "away": None, "message": "Lineup only available for soccer"}

        # Resolve football_data match id
        mapping_stmt = select(ProviderMappingORM.provider_id).where(
            ProviderMappingORM.entity_type == "match",
            ProviderMappingORM.canonical_id == match_id,
            ProviderMappingORM.provider == "football_data",
        )
        mapping_result = await session.execute(mapping_stmt)
        fd_match_id = mapping_result.scalar_one_or_none()

        if not fd_match_id:
            # Try to find by league + date + team names
            fd_code = _LEAGUE_TO_FD_CODE.get((row.league_name or "").strip())
            if not fd_code:
                return {"source": None, "home": None, "away": None, "message": "League not mapped to Football-Data.org"}
            date_str = (row.start_time.date().isoformat() if row.start_time else "") or datetime.now(timezone.utc).date().isoformat()
            async with httpx.AsyncClient(timeout=10.0) as client:
                list_resp = await client.get(
                    "https://api.football-data.org/v4/matches",
                    params={"competitions": fd_code, "dateFrom": date_str, "dateTo": date_str},
                    headers={"X-Auth-Token": settings.football_data_api_key},
                )
                if list_resp.status_code != 200:
                    return {"source": None, "home": None, "away": None, "message": "Football-Data.org request failed"}
                list_data = list_resp.json()
            for m in list_data.get("matches", []):
                h = (m.get("homeTeam") or {}).get("name", "")
                a = (m.get("awayTeam") or {}).get("name", "")
                if _team_names_match(row.ht_name or "", row.at_name or "", h, a):
                    fd_match_id = str(m.get("id", ""))
                    break
            if not fd_match_id:
                return {"source": None, "home": None, "away": None, "message": "Match not found on Football-Data.org"}

            # Persist mapping for next time
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            async with db.session() as write_session:
                await write_session.execute(
                    pg_insert(ProviderMappingORM)
                    .values(
                        entity_type="match",
                        canonical_id=match_id,
                        provider="football_data",
                        provider_id=fd_match_id,
                        extra_data={},
                    )
                    .on_conflict_do_nothing(constraint="uq_provider_mapping")
                )

    # Fetch match detail with lineups
    async with httpx.AsyncClient(timeout=10.0) as client:
        detail_resp = await client.get(
            f"https://api.football-data.org/v4/matches/{fd_match_id}",
            headers={
                "X-Auth-Token": settings.football_data_api_key,
                "X-Unfold-Lineups": "true",
            },
        )
        if detail_resp.status_code != 200:
            return {"source": "football_data", "home": None, "away": None, "message": "Failed to load lineup"}

    data = detail_resp.json()

    def _team_lineup(team_obj: dict) -> dict[str, Any]:
        if not team_obj:
            return {"formation": None, "lineup": [], "bench": []}
        return {
            "formation": team_obj.get("formation"),
            "lineup": [
                {"id": p.get("id"), "name": p.get("name"), "position": p.get("position"), "shirt_number": p.get("shirtNumber")}
                for p in team_obj.get("lineup", [])
            ],
            "bench": [
                {"id": p.get("id"), "name": p.get("name"), "position": p.get("position"), "shirt_number": p.get("shirtNumber")}
                for p in team_obj.get("bench", [])
            ],
        }

    return {
        "source": "football_data",
        "match_id": str(match_id),
        "home": _team_lineup(data.get("homeTeam") or {}),
        "away": _team_lineup(data.get("awayTeam") or {}),
    }


def _build_player_stats_from_fd_match(data: dict) -> dict[str, Any]:
    """Build home/away player stats from Football-Data match (lineup + bench + goals + bookings)."""
    stat_columns = ["G", "A", "YC", "RC"]

    def player_key(p: dict) -> str:
        return (p.get("name") or "").strip().lower()

    def make_player(p: dict, starter: bool) -> dict[str, Any]:
        return {
            "name": p.get("name") or "",
            "jersey": str(p.get("shirtNumber") or ""),
            "position": (p.get("position") or "").strip(),
            "stats": {"G": 0, "A": 0, "YC": 0, "RC": 0},
            "starter": starter,
        }

    def team_players(team_obj: dict, team_id: int | None) -> list[dict]:
        if not team_obj:
            return []
        by_name: dict[str, dict] = {}
        for p in team_obj.get("lineup", []):
            pl = make_player(p, True)
            by_name[player_key(pl)] = pl
        for p in team_obj.get("bench", []):
            pl = make_player(p, False)
            if player_key(pl) not in by_name:
                by_name[player_key(pl)] = pl
        # Goals: scorer gets G, assister gets A (only for this team's goals)
        for g in data.get("goals", []):
            goal_team_id = (g.get("team") or {}).get("id")
            if goal_team_id != team_id:
                continue
            scorer_name = ((g.get("scorer") or {}).get("name") or "").strip().lower()
            if scorer_name and scorer_name in by_name:
                by_name[scorer_name]["stats"]["G"] = by_name[scorer_name]["stats"].get("G", 0) + 1
            assist = g.get("assist")
            if assist:
                assister_name = (assist.get("name") or "").strip().lower()
                if assister_name and assister_name in by_name:
                    by_name[assister_name]["stats"]["A"] = by_name[assister_name]["stats"].get("A", 0) + 1
        # Bookings: YC / RC for this team only
        for b in data.get("bookings", []):
            book_team_id = (b.get("team") or {}).get("id")
            if book_team_id != team_id:
                continue
            card = (b.get("card") or "").upper()
            player_name = ((b.get("player") or {}).get("name") or "").strip().lower()
            if player_name and player_name in by_name:
                if "RED" in card:
                    by_name[player_name]["stats"]["RC"] = by_name[player_name]["stats"].get("RC", 0) + 1
                else:
                    by_name[player_name]["stats"]["YC"] = by_name[player_name]["stats"].get("YC", 0) + 1
        return list(by_name.values())

    home_team = data.get("homeTeam") or {}
    away_team = data.get("awayTeam") or {}
    home_id = home_team.get("id")
    away_id = away_team.get("id")
    home_pl = team_players(home_team, home_id)
    away_pl = team_players(away_team, away_id)
    return {
        "source": "football_data",
        "statColumns": stat_columns,
        "home": {
            "teamName": home_team.get("name", ""),
            "players": home_pl,
            "statColumns": stat_columns,
        },
        "away": {
            "teamName": away_team.get("name", ""),
            "players": away_pl,
            "statColumns": stat_columns,
        },
    }


@router.get("/{match_id}/player-stats")
async def get_match_player_stats(
    match_id: uuid.UUID,
    db: DatabaseManager = Depends(get_db),
) -> dict[str, Any]:
    """
    Get player-level statistics (soccer) from Football-Data.org when ESPN has none.

    Returns home/away players with G, A, YC, RC derived from lineup + goals + bookings.
    Same shape as ESPN boxscore players for the Player Stats tab.
    """
    settings = get_settings()
    if not settings.football_data_api_key:
        return {"source": None, "home": None, "away": None, "message": "Football-Data.org API key not configured"}

    async with db.read_session() as session:
        ht = TeamORM.__table__.alias("ht")
        at = TeamORM.__table__.alias("at")
        stmt = (
            select(
                MatchORM.id,
                MatchORM.start_time,
                LeagueORM.name.label("league_name"),
                SportORM.sport_type,
                ht.c.name.label("ht_name"),
                at.c.name.label("at_name"),
            )
            .join(LeagueORM, MatchORM.league_id == LeagueORM.id)
            .join(SportORM, LeagueORM.sport_id == SportORM.id)
            .outerjoin(ht, MatchORM.home_team_id == ht.c.id)
            .outerjoin(at, MatchORM.away_team_id == at.c.id)
            .where(MatchORM.id == match_id)
        )
        result = await session.execute(stmt)
        row = result.one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="Match not found")
        if row.sport_type != "soccer":
            return {"source": None, "home": None, "away": None, "message": "Player stats only available for soccer"}

        mapping_stmt = select(ProviderMappingORM.provider_id).where(
            ProviderMappingORM.entity_type == "match",
            ProviderMappingORM.canonical_id == match_id,
            ProviderMappingORM.provider == "football_data",
        )
        mapping_result = await session.execute(mapping_stmt)
        fd_match_id = mapping_result.scalar_one_or_none()

        if not fd_match_id:
            fd_code = _LEAGUE_TO_FD_CODE.get((row.league_name or "").strip())
            if not fd_code:
                return {"source": None, "home": None, "away": None, "message": "League not mapped to Football-Data.org"}
            date_str = (row.start_time.date().isoformat() if row.start_time else "") or datetime.now(timezone.utc).date().isoformat()
            async with httpx.AsyncClient(timeout=10.0) as client:
                list_resp = await client.get(
                    "https://api.football-data.org/v4/matches",
                    params={"competitions": fd_code, "dateFrom": date_str, "dateTo": date_str},
                    headers={"X-Auth-Token": settings.football_data_api_key},
                )
                if list_resp.status_code != 200:
                    return {"source": None, "home": None, "away": None, "message": "Football-Data.org request failed"}
                list_data = list_resp.json()
            for m in list_data.get("matches", []):
                h = (m.get("homeTeam") or {}).get("name", "")
                a = (m.get("awayTeam") or {}).get("name", "")
                if _team_names_match(row.ht_name or "", row.at_name or "", h, a):
                    fd_match_id = str(m.get("id", ""))
                    break
            if not fd_match_id:
                return {"source": None, "home": None, "away": None, "message": "Match not found on Football-Data.org"}

            from sqlalchemy.dialects.postgresql import insert as pg_insert
            async with db.session() as write_session:
                await write_session.execute(
                    pg_insert(ProviderMappingORM)
                    .values(
                        entity_type="match",
                        canonical_id=match_id,
                        provider="football_data",
                        provider_id=fd_match_id,
                        extra_data={},
                    )
                    .on_conflict_do_nothing(constraint="uq_provider_mapping")
                )

    async with httpx.AsyncClient(timeout=10.0) as client:
        detail_resp = await client.get(
            f"https://api.football-data.org/v4/matches/{fd_match_id}",
            headers={
                "X-Auth-Token": settings.football_data_api_key,
                "X-Unfold-Lineups": "true",
            },
        )
        if detail_resp.status_code != 200:
            return {"source": "football_data", "home": None, "away": None, "message": "Failed to load player stats"}

    data = detail_resp.json()
    return _build_player_stats_from_fd_match(data)


def _event_orm_to_dict(event: MatchEventORM) -> dict[str, Any]:
    """Convert a MatchEventORM to a serializable dictionary."""
    return {
        "id": str(event.id),
        "seq": event.seq,
        "event_type": event.event_type,
        "minute": event.minute,
        "second": event.second,
        "period": event.period,
        "team_id": str(event.team_id) if event.team_id else None,
        "player_id": str(event.player_id) if event.player_id else None,
        "player_name": event.player_name,
        "detail": event.detail,
        "score_home": event.score_home,
        "score_away": event.score_away,
        "synthetic": event.synthetic,
        "confidence": event.confidence,
        "created_at": event.created_at.isoformat() if event.created_at else None,
    }


def _compute_etag(content: str | bytes) -> str:
    """Compute a weak ETag from content."""
    if isinstance(content, str):
        content = content.encode()
    digest = hashlib.md5(content).hexdigest()[:16]
    return f'W/"{digest}"'
