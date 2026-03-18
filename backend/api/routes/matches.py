"""
Match REST endpoints.

GET /v1/matches/{id}          — Match center (scoreboard + metadata).
GET /v1/matches/{id}/timeline — Ordered event timeline for a match.
GET /v1/matches/{id}/stats    — Team and player statistics.
GET /v1/matches/{id}/details  — Combined backend detail payload for match center tabs.
GET /v1/matches/{id}/lineup   — Lineup from Football-Data.org (soccer only).
GET /v1/matches/{id}/player-stats — Player stats from Football-Data.org when ESPN has none (soccer).
GET /v1/matches/{id}/soccer-details — Combined soccer lineup + player stats from Football-Data.org.
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


def _state_payload(row: Any, state: Any) -> dict[str, Any]:
    """Build state payload including optional aggregate from extra_data."""
    extra = row.extra_data if state and getattr(row, "extra_data", None) else {}
    if not isinstance(extra, dict):
        extra = {}
    out: dict[str, Any] = {
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
    }
    if "aggregate_home" in extra and "aggregate_away" in extra:
        out["aggregate_home"] = extra["aggregate_home"]
        out["aggregate_away"] = extra["aggregate_away"]
    return out


def _no_store(response: Response) -> None:
    """Mark match-center detail responses as uncached by clients/proxies."""
    response.headers["Cache-Control"] = "no-store"


def _canonical_phase(match_phase: str | None, state_phase: str | None) -> str | None:
    """Prefer the current state phase when available over the schedule row phase."""
    return state_phase if state_phase is not None else match_phase


_LEAGUE_TO_ESPN_MAP: dict[str, dict[str, str]] = {
    "Premier League": {"sport": "soccer", "slug": "eng.1"},
    "La Liga": {"sport": "soccer", "slug": "esp.1"},
    "Bundesliga": {"sport": "soccer", "slug": "ger.1"},
    "Serie A": {"sport": "soccer", "slug": "ita.1"},
    "Ligue 1": {"sport": "soccer", "slug": "fra.1"},
    "MLS": {"sport": "soccer", "slug": "usa.1"},
    "Champions League": {"sport": "soccer", "slug": "uefa.champions"},
    "Europa League": {"sport": "soccer", "slug": "uefa.europa"},
    "Conference League": {"sport": "soccer", "slug": "uefa.europa.conf"},
    "Championship": {"sport": "soccer", "slug": "eng.2"},
    "FA Cup": {"sport": "soccer", "slug": "eng.fa"},
    "EFL Cup": {"sport": "soccer", "slug": "eng.league_cup"},
    "Eredivisie": {"sport": "soccer", "slug": "ned.1"},
    "Liga Portugal": {"sport": "soccer", "slug": "por.1"},
    "Turkish Super Lig": {"sport": "soccer", "slug": "tur.1"},
    "Scottish Premiership": {"sport": "soccer", "slug": "sco.1"},
    "Saudi Pro League": {"sport": "soccer", "slug": "sau.1"},
    "Major League Soccer": {"sport": "soccer", "slug": "usa.1"},
    "UEFA Champions League": {"sport": "soccer", "slug": "uefa.champions"},
    "UEFA Europa League": {"sport": "soccer", "slug": "uefa.europa"},
    "UEFA Europa Conference League": {"sport": "soccer", "slug": "uefa.europa.conf"},
    "English Premier League": {"sport": "soccer", "slug": "eng.1"},
    "English Championship": {"sport": "soccer", "slug": "eng.2"},
    "NBA": {"sport": "basketball", "slug": "nba"},
    "WNBA": {"sport": "basketball", "slug": "wnba"},
    "NCAAM": {"sport": "basketball", "slug": "mens-college-basketball"},
    "NCAAW": {"sport": "basketball", "slug": "womens-college-basketball"},
    "NHL": {"sport": "hockey", "slug": "nhl"},
    "MLB": {"sport": "baseball", "slug": "mlb"},
    "NFL": {"sport": "football", "slug": "nfl"},
}


def _get_espn_league_mapping(league_name: str | None) -> dict[str, str] | None:
    if not league_name:
        return None
    if league_name in _LEAGUE_TO_ESPN_MAP:
        return _LEAGUE_TO_ESPN_MAP[league_name]
    normalized = re.sub(r"[^a-z0-9]", "", league_name.lower())
    for key, value in _LEAGUE_TO_ESPN_MAP.items():
        key_normalized = re.sub(r"[^a-z0-9]", "", key.lower())
        if normalized == key_normalized or normalized in key_normalized or key_normalized in normalized:
            return value
    return None


def _team_names_match_loose(a: str, b: str) -> bool:
    def norm(value: str) -> str:
        return re.sub(r"[^a-z0-9]", "", value.lower())

    def strip_suffix(value: str) -> str:
        out = norm(value)
        for suffix in ("fc", "cf", "cfc", "sc", "united", "city"):
            if out.endswith(suffix) and len(out) > len(suffix):
                out = out[: -len(suffix)]
        return out

    an = norm(a)
    bn = norm(b)
    an_alt = strip_suffix(a)
    bn_alt = strip_suffix(b)
    if an == bn or an_alt == bn_alt:
        return True
    return an in bn or bn in an or an_alt in bn_alt or bn_alt in an_alt


async def _find_espn_event_id(
    client: httpx.AsyncClient,
    home_team_name: str,
    away_team_name: str,
    sport: str,
    slug: str,
) -> str | None:
    prefix = f"soccer/{slug}" if sport == "soccer" else f"{sport}/{slug}"
    response = await client.get(f"https://site.api.espn.com/apis/site/v2/sports/{prefix}/scoreboard")
    if response.status_code != 200:
        return None
    data = response.json()
    for event in data.get("events", []):
        competition = (event.get("competitions") or [{}])[0]
        competitors = competition.get("competitors") or []
        home_comp = next((c for c in competitors if c.get("homeAway") == "home"), None)
        away_comp = next((c for c in competitors if c.get("homeAway") == "away"), None)
        if not home_comp or not away_comp:
            continue
        home_display = (home_comp.get("team") or {}).get("displayName") or (home_comp.get("team") or {}).get("name") or ""
        away_display = (away_comp.get("team") or {}).get("displayName") or (away_comp.get("team") or {}).get("name") or ""
        home_short = (home_comp.get("team") or {}).get("shortDisplayName") or (home_comp.get("team") or {}).get("abbreviation") or ""
        away_short = (away_comp.get("team") or {}).get("shortDisplayName") or (away_comp.get("team") or {}).get("abbreviation") or ""
        if (
            (_team_names_match_loose(home_team_name, home_display) or _team_names_match_loose(home_team_name, home_short))
            and (_team_names_match_loose(away_team_name, away_display) or _team_names_match_loose(away_team_name, away_short))
        ):
            return event.get("id")
    return None


def _extract_espn_player_stats(competitor: dict[str, Any]) -> dict[str, Any]:
    players: list[dict[str, Any]] = []
    stat_columns: list[str] = []
    stat_groups = competitor.get("statistics") or []
    if not stat_groups:
        return {"players": players, "statColumns": stat_columns}

    primary = stat_groups[0]
    labels = primary.get("labels") or []
    athletes = primary.get("athletes") or []
    for label in labels:
        if label not in stat_columns:
            stat_columns.append(label)
    for athlete in athletes:
        athlete_data = athlete.get("athlete") or {}
        stats_values = athlete.get("stats") or []
        stats_map = {label: (stats_values[i] if i < len(stats_values) else "-") for i, label in enumerate(labels)}
        players.append({
            "name": athlete_data.get("displayName") or athlete_data.get("shortName") or "Unknown",
            "jersey": athlete_data.get("jersey") or "",
            "position": ((athlete_data.get("position") or {}).get("abbreviation")) or "",
            "stats": stats_map,
            "starter": athlete.get("starter", False),
        })

    for group in stat_groups[1:]:
        group_labels = group.get("labels") or []
        group_athletes = group.get("athletes") or []
        for label in group_labels:
            if label not in stat_columns:
                stat_columns.append(label)
        for athlete in group_athletes:
            athlete_data = athlete.get("athlete") or {}
            name = athlete_data.get("displayName") or athlete_data.get("shortName") or "Unknown"
            existing = next((player for player in players if player["name"] == name), None)
            stats_values = athlete.get("stats") or []
            if existing:
                for index, label in enumerate(group_labels):
                    existing["stats"][label] = stats_values[index] if index < len(stats_values) else "-"
            else:
                players.append({
                    "name": name,
                    "jersey": athlete_data.get("jersey") or "",
                    "position": ((athlete_data.get("position") or {}).get("abbreviation")) or "",
                    "stats": {label: (stats_values[index] if index < len(stats_values) else "-") for index, label in enumerate(group_labels)},
                    "starter": athlete.get("starter", False),
                })
    return {"players": players, "statColumns": stat_columns}


async def _fetch_espn_supplementary_summary(
    home_team_name: str,
    away_team_name: str,
    league_name: str | None,
) -> dict[str, Any] | None:
    mapping = _get_espn_league_mapping(league_name)
    if not mapping:
        return None
    async with httpx.AsyncClient(timeout=10.0) as client:
        event_id = await _find_espn_event_id(client, home_team_name, away_team_name, mapping["sport"], mapping["slug"])
        if not event_id:
            return None
        prefix = f"soccer/{mapping['slug']}" if mapping["sport"] == "soccer" else f"{mapping['sport']}/{mapping['slug']}"
        response = await client.get(
            f"https://site.api.espn.com/apis/site/v2/sports/{prefix}/summary",
            params={"event": event_id},
        )
        if response.status_code != 200:
            return None
        data = response.json()

    header_competition = ((data.get("header") or {}).get("competitions") or [{}])[0]
    competitors = header_competition.get("competitors") or []
    home_comp = next((c for c in competitors if c.get("homeAway") == "home"), None)
    away_comp = next((c for c in competitors if c.get("homeAway") == "away"), None)

    raw_plays = data.get("plays") or data.get("keyEvents") or header_competition.get("plays") or []
    plays = [{
        "id": play.get("id") or "",
        "text": play.get("text") or play.get("shortDescription") or play.get("description") or "",
        "homeScore": play.get("homeScore", 0),
        "awayScore": play.get("awayScore", 0),
        "period": play.get("period") or {"number": 0, "displayValue": ""},
        "clock": play.get("clock") or {"displayValue": ""},
        "scoringPlay": play.get("scoringPlay", False),
        "scoreValue": play.get("scoreValue", 0),
        "team": (
            {
                "id": ((play.get("team") or {}).get("id")) or "",
                "displayName": ((play.get("team") or {}).get("displayName")) or ((play.get("team") or {}).get("shortDisplayName")) or "",
            }
            if play.get("team")
            else None
        ),
        "participants": [
            {"athlete": {"displayName": ((participant.get("athlete") or {}).get("displayName")) or ""}}
            for participant in (play.get("participants") or [])
        ],
        "type": play.get("type") or {"id": "", "text": ""},
    } for play in raw_plays]

    box_teams = (data.get("boxscore") or {}).get("teams") or []
    home_team = next((team for team in box_teams if team.get("homeAway") == "home"), box_teams[0] if box_teams else {})
    away_team = next((team for team in box_teams if team.get("homeAway") == "away"), box_teams[1] if len(box_teams) > 1 else {})
    home_team_stats = [
        {"name": stat.get("name") or "", "displayValue": stat.get("displayValue") or "", "label": stat.get("label") or ""}
        for stat in (home_team.get("statistics") or [])
    ]
    away_team_stats = [
        {"name": stat.get("name") or "", "displayValue": stat.get("displayValue") or "", "label": stat.get("label") or ""}
        for stat in (away_team.get("statistics") or [])
    ]

    player_groups = (data.get("boxscore") or {}).get("players") or []
    home_player_group = next((group for group in player_groups if group.get("homeAway") == "home"), player_groups[0] if player_groups else {})
    away_player_group = next((group for group in player_groups if group.get("homeAway") == "away"), player_groups[1] if len(player_groups) > 1 else {})
    home_players = _extract_espn_player_stats(home_player_group)
    away_players = _extract_espn_player_stats(away_player_group)

    injuries = {"home": [], "away": []}
    for team in data.get("injuries") or []:
        side = "home" if team.get("homeAway") == "home" else "away"
        for injury in team.get("injuries") or []:
            athlete = injury.get("athlete") or {}
            injuries[side].append({
                "name": athlete.get("displayName") or athlete.get("shortName") or "Unknown",
                "position": ((athlete.get("position") or {}).get("abbreviation")) or "",
                "jersey": athlete.get("jersey") or "",
                "type": ((injury.get("type") or {}).get("description")) or ((injury.get("type") or {}).get("name")) or "",
                "status": injury.get("status") or injury.get("longComment") or "",
            })

    substitutions = None
    if mapping["sport"] == "soccer" and plays:
        home_id = (home_comp or {}).get("id") or ""
        parsed_subs = []
        for play in plays:
            type_text = (((play.get("type") or {}).get("text")) or "").lower()
            if "substitution" not in type_text:
                continue
            participants = play.get("participants") or []
            if len(participants) >= 2:
                parsed_subs.append({
                    "minute": (((play.get("clock") or {}).get("displayValue")) or "").replace(" ", ""),
                    "playerOff": (((participants[0].get("athlete") or {}).get("displayName")) or "—"),
                    "playerOn": (((participants[1].get("athlete") or {}).get("displayName")) or "—"),
                    "homeAway": "home" if ((play.get("team") or {}).get("id")) == home_id else "away",
                })
        substitutions = parsed_subs or None

    return {
        "source": "espn",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "sport": mapping["sport"],
        "plays": plays,
        "team_stats": {"home": home_team_stats, "away": away_team_stats},
        "player_stats": {
            "home": {
                "teamName": (home_player_group.get("team") or {}).get("displayName") or home_team_name,
                "players": home_players["players"],
                "statColumns": list(dict.fromkeys(home_players["statColumns"] + away_players["statColumns"])),
            },
            "away": {
                "teamName": (away_player_group.get("team") or {}).get("displayName") or away_team_name,
                "players": away_players["players"],
                "statColumns": list(dict.fromkeys(home_players["statColumns"] + away_players["statColumns"])),
            },
        },
        "formations": {
            "home": (home_comp or {}).get("formation") or (home_comp or {}).get("formatted") or (box_teams[0].get("formation") if box_teams else None),
            "away": (away_comp or {}).get("formation") or (away_comp or {}).get("formatted") or (box_teams[1].get("formation") if len(box_teams) > 1 else None),
        },
        "injuries": injuries,
        "team_display": {
            "home_name": ((home_comp or {}).get("team") or {}).get("displayName") or ((home_team.get("team") or {}).get("displayName")) or home_team_name,
            "away_name": ((away_comp or {}).get("team") or {}).get("displayName") or ((away_team.get("team") or {}).get("displayName")) or away_team_name,
            "home_team_id": (home_comp or {}).get("id") or ((home_team.get("team") or {}).get("id")) or "",
            "away_team_id": (away_comp or {}).get("id") or ((away_team.get("team") or {}).get("id")) or "",
        },
        "substitutions": substitutions,
    }


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
            not_modified = Response(status_code=304)
            not_modified.headers["ETag"] = etag
            _no_store(not_modified)
            return not_modified

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
                MatchStateORM.phase.label("state_phase"),
                MatchStateORM.score_breakdown,
                MatchStateORM.extra_data,
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

    phase = _canonical_phase(row.phase, getattr(row, "state_phase", None) if state else None)
    payload = {
        "match": {
            "id": str(row.id),
            "phase": phase,
            "start_time": row.start_time.isoformat() if row.start_time else None,
            "venue": row.venue,
            "home_team": home_team,
            "away_team": away_team,
        },
        "state": _state_payload(row, state) if state else None,
        "recent_events": recent_events,
        "league": league,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    payload_json = json.dumps(payload, default=str)
    etag = _compute_etag(payload_json)
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "no-store" if str(phase).startswith("live") or phase == "break" else "public, max-age=2"

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
        match_stmt = (
            select(
                MatchORM.id,
                MatchORM.phase,
                MatchStateORM.phase.label("state_phase"),
            )
            .outerjoin(MatchStateORM, MatchORM.id == MatchStateORM.match_id)
            .where(MatchORM.id == match_id)
        )
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

    phase = _canonical_phase(match_row.phase, getattr(match_row, "state_phase", None))

    payload = {
        "match_id": str(match_id),
        "phase": phase,
        "events": events,
        "count": len(events),
        "next_seq": next_seq,
        "has_more": len(events) == limit,
    }

    # Short cache — timeline changes frequently during live matches
    _no_store(response)
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
            not_modified = Response(status_code=304)
            not_modified.headers["ETag"] = etag
            _no_store(not_modified)
            return not_modified
        data = json.loads(cached)
        response.headers["ETag"] = etag
        _no_store(response)
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
    _no_store(response)

    return payload


@router.get("/{match_id}/details")
async def get_match_details(
    match_id: uuid.UUID,
    request: Request,
    response: Response,
    db: DatabaseManager = Depends(get_db),
    redis: RedisManager = Depends(get_redis),
) -> dict[str, Any]:
    """Get combined backend detail sections for the match center tabs."""
    _no_store(response)
    cache_key = f"snap:match:{match_id}:details"
    cached = await redis.client.get(cache_key)
    if cached:
        etag = _compute_etag(cached)
        if_none_match = request.headers.get("if-none-match")
        if if_none_match and if_none_match == etag:
            not_modified = Response(status_code=304)
            not_modified.headers["ETag"] = etag
            _no_store(not_modified)
            return not_modified
        response.headers["ETag"] = etag
        return json.loads(cached)

    async with db.read_session() as session:
        ht = TeamORM.__table__.alias("ht")
        at = TeamORM.__table__.alias("at")

        match_stmt = (
            select(
                MatchORM.id,
                MatchORM.phase,
                MatchStateORM.phase.label("state_phase"),
                MatchORM.home_team_id,
                MatchORM.away_team_id,
                ht.c.short_name.label("ht_short"),
                ht.c.name.label("ht_name"),
                at.c.short_name.label("at_short"),
                at.c.name.label("at_name"),
                LeagueORM.name.label("league_name"),
            )
            .outerjoin(MatchStateORM, MatchORM.id == MatchStateORM.match_id)
            .outerjoin(ht, MatchORM.home_team_id == ht.c.id)
            .outerjoin(at, MatchORM.away_team_id == at.c.id)
            .join(LeagueORM, MatchORM.league_id == LeagueORM.id)
            .where(MatchORM.id == match_id)
        )
        match_result = await session.execute(match_stmt)
        match_row = match_result.one_or_none()
        if match_row is None:
            raise HTTPException(status_code=404, detail="Match not found")

        events_stmt = (
            select(MatchEventORM)
            .where(MatchEventORM.match_id == match_id)
            .order_by(
                MatchEventORM.minute.asc().nullsfirst(),
                MatchEventORM.second.asc().nullsfirst(),
                MatchEventORM.seq.asc(),
            )
            .limit(100)
        )
        events_result = await session.execute(events_stmt)
        events = [_event_orm_to_dict(event) for event in events_result.scalars().all()]

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

    soccer_details = None
    settings = get_settings()
    if settings.football_data_api_key:
        row = await _load_soccer_match_context(match_id, db)
        if row.sport_type == "soccer":
            fd_match_id = await _resolve_football_data_match_id(match_id, db, row)
            if fd_match_id:
                data = await _fetch_football_data_match_detail(fd_match_id)
                if data:
                    lineup = _build_lineup_payload(data)
                    soccer_details = {
                        "source": "football_data",
                        "lineup": {
                            "source": lineup["source"],
                            "home": lineup["home"],
                            "away": lineup["away"],
                        },
                        "player_stats": _build_player_stats_from_fd_match(data),
                    }

    supplementary = {
        "espn": await _fetch_espn_supplementary_summary(
            match_row.ht_name or "",
            match_row.at_name or "",
            match_row.league_name,
        )
    }

    phase = _canonical_phase(match_row.phase, getattr(match_row, "state_phase", None))

    payload = {
        "match_id": str(match_id),
        "phase": phase,
        "timeline": {
            "match_id": str(match_id),
            "phase": phase,
            "events": events,
            "count": len(events),
            "next_seq": events[-1]["seq"] if events else None,
            "has_more": len(events) == 100,
        },
        "stats": {
            "match_id": str(match_id),
            "teams": teams_stats,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
        "soccer_details": soccer_details,
        "supplementary": supplementary,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    payload_json = json.dumps(payload, default=str)
    response.headers["ETag"] = _compute_etag(payload_json)
    phase_key = str(phase or "").lower()
    cache_ttl = 15 if phase_key.startswith("live") or phase_key == "break" else 60
    await redis.client.set(cache_key, payload_json, ex=cache_ttl)
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


async def _load_soccer_match_context(
    match_id: uuid.UUID,
    db: DatabaseManager,
) -> Any:
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
        return row


async def _resolve_football_data_match_id(
    match_id: uuid.UUID,
    db: DatabaseManager,
    row: Any,
) -> str | None:
    async with db.read_session() as session:
        mapping_stmt = select(ProviderMappingORM.provider_id).where(
            ProviderMappingORM.entity_type == "match",
            ProviderMappingORM.canonical_id == match_id,
            ProviderMappingORM.provider == "football_data",
        )
        mapping_result = await session.execute(mapping_stmt)
        fd_match_id = mapping_result.scalar_one_or_none()

    if fd_match_id:
        return str(fd_match_id)

    fd_code = _LEAGUE_TO_FD_CODE.get((row.league_name or "").strip())
    if not fd_code:
        return None

    settings = get_settings()
    date_str = (row.start_time.date().isoformat() if row.start_time else "") or datetime.now(timezone.utc).date().isoformat()
    async with httpx.AsyncClient(timeout=10.0) as client:
        list_resp = await client.get(
            "https://api.football-data.org/v4/matches",
            params={"competitions": fd_code, "dateFrom": date_str, "dateTo": date_str},
            headers={"X-Auth-Token": settings.football_data_api_key},
        )
        if list_resp.status_code != 200:
            return None
        list_data = list_resp.json()

    for match in list_data.get("matches", []):
        home = (match.get("homeTeam") or {}).get("name", "")
        away = (match.get("awayTeam") or {}).get("name", "")
        if _team_names_match(row.ht_name or "", row.at_name or "", home, away):
            fd_match_id = str(match.get("id", ""))
            break

    if not fd_match_id:
        return None

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

    return fd_match_id


async def _fetch_football_data_match_detail(fd_match_id: str) -> dict[str, Any] | None:
    settings = get_settings()
    async with httpx.AsyncClient(timeout=10.0) as client:
        detail_resp = await client.get(
            f"https://api.football-data.org/v4/matches/{fd_match_id}",
            headers={
                "X-Auth-Token": settings.football_data_api_key,
                "X-Unfold-Lineups": "true",
            },
        )
        if detail_resp.status_code != 200:
            return None
    return detail_resp.json()


def _build_lineup_payload(data: dict[str, Any]) -> dict[str, Any]:
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
        "home": _team_lineup(data.get("homeTeam") or {}),
        "away": _team_lineup(data.get("awayTeam") or {}),
    }


@router.get("/{match_id}/lineup")
async def get_match_lineup(
    match_id: uuid.UUID,
    response: Response,
    db: DatabaseManager = Depends(get_db),
) -> dict[str, Any]:
    """
    Get lineup (formation, starters, bench) from Football-Data.org for a soccer match.

    Requires LV_FOOTBALL_DATA_API_KEY. Resolves our match to their match by
    provider_mappings or by league + date + team names. Returns home/away
    formation, lineup, and bench when available.
    """
    _no_store(response)
    settings = get_settings()
    if not settings.football_data_api_key:
        return {"source": None, "home": None, "away": None, "message": "Football-Data.org API key not configured"}
    row = await _load_soccer_match_context(match_id, db)
    if row.sport_type != "soccer":
        return {"source": None, "home": None, "away": None, "message": "Lineup only available for soccer"}

    fd_match_id = await _resolve_football_data_match_id(match_id, db, row)
    if not fd_match_id:
        return {"source": None, "home": None, "away": None, "message": "Match not found on Football-Data.org"}

    data = await _fetch_football_data_match_detail(fd_match_id)
    if not data:
        return {"source": "football_data", "home": None, "away": None, "message": "Failed to load lineup"}

    payload = _build_lineup_payload(data)
    payload["match_id"] = str(match_id)
    return payload


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
    response: Response,
    db: DatabaseManager = Depends(get_db),
) -> dict[str, Any]:
    """
    Get player-level statistics (soccer) from Football-Data.org when ESPN has none.

    Returns home/away players with G, A, YC, RC derived from lineup + goals + bookings.
    Same shape as ESPN boxscore players for the Player Stats tab.
    """
    _no_store(response)
    settings = get_settings()
    if not settings.football_data_api_key:
        return {"source": None, "home": None, "away": None, "message": "Football-Data.org API key not configured"}
    row = await _load_soccer_match_context(match_id, db)
    if row.sport_type != "soccer":
        return {"source": None, "home": None, "away": None, "message": "Player stats only available for soccer"}

    fd_match_id = await _resolve_football_data_match_id(match_id, db, row)
    if not fd_match_id:
        return {"source": None, "home": None, "away": None, "message": "Match not found on Football-Data.org"}

    data = await _fetch_football_data_match_detail(fd_match_id)
    if not data:
        return {"source": "football_data", "home": None, "away": None, "message": "Failed to load player stats"}

    return _build_player_stats_from_fd_match(data)


@router.get("/{match_id}/soccer-details")
async def get_match_soccer_details(
    match_id: uuid.UUID,
    response: Response,
    db: DatabaseManager = Depends(get_db),
) -> dict[str, Any]:
    """Get combined soccer lineup and fallback player stats from Football-Data.org."""
    _no_store(response)
    settings = get_settings()
    if not settings.football_data_api_key:
        return {
            "source": None,
            "lineup": None,
            "player_stats": None,
            "message": "Football-Data.org API key not configured",
        }

    row = await _load_soccer_match_context(match_id, db)
    if row.sport_type != "soccer":
        return {
            "source": None,
            "lineup": None,
            "player_stats": None,
            "message": "Soccer details only available for soccer",
        }

    fd_match_id = await _resolve_football_data_match_id(match_id, db, row)
    if not fd_match_id:
        return {
            "source": None,
            "lineup": None,
            "player_stats": None,
            "message": "Match not found on Football-Data.org",
        }

    data = await _fetch_football_data_match_detail(fd_match_id)
    if not data:
        return {
            "source": "football_data",
            "lineup": None,
            "player_stats": None,
            "message": "Failed to load soccer details",
        }

    lineup = _build_lineup_payload(data)
    player_stats = _build_player_stats_from_fd_match(data)
    return {
        "source": "football_data",
        "match_id": str(match_id),
        "lineup": {
            "source": lineup["source"],
            "home": lineup["home"],
            "away": lineup["away"],
        },
        "player_stats": player_stats,
    }


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
