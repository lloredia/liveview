"""
Today REST endpoint.

GET /v1/today?date=YYYY-MM-DD — All matches across all leagues for a given date.

Defaults to today (UTC). Groups matches by league with live/scheduled/finished sections.
"""
from __future__ import annotations

import hashlib
import json
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import select, func, case, and_, or_

from shared.models.orm import (
    LeagueORM,
    MatchORM,
    MatchStateORM,
    SportORM,
    TeamORM,
)
from shared.utils.database import DatabaseManager
from shared.utils.logging import get_logger
from shared.utils.redis_manager import RedisManager

from api.dependencies import get_db, get_redis

logger = get_logger(__name__)
router = APIRouter(prefix="/v1", tags=["today"])


@router.get("/today")
async def get_today(
    request: Request,
    response: Response,
    date_str: Optional[str] = Query(
        None,
        alias="date",
        description="Date in YYYY-MM-DD format. Defaults to today (UTC).",
    ),
    db: DatabaseManager = Depends(get_db),
    redis: RedisManager = Depends(get_redis),
) -> dict[str, Any]:
    """
    Get all matches across all leagues for a given date.

    Returns matches grouped by league, sorted by start time.
    Each league group includes sport info and league metadata.
    Supports ETag-based conditional requests for efficient polling.
    """
    # Parse date
    if date_str:
        try:
            target_date = date.fromisoformat(date_str)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid date format: {date_str}. Use YYYY-MM-DD.",
            )
    else:
        target_date = datetime.now(timezone.utc).date()

    # Date range: full day in UTC
    day_start = datetime(
        target_date.year, target_date.month, target_date.day,
        tzinfo=timezone.utc,
    )
    day_end = day_start + timedelta(days=1)
    is_today_utc = target_date == datetime.now(timezone.utc).date()

    # Try Redis cache first (short TTL for live data)
    cache_key = f"today:{target_date.isoformat()}"
    cached = await redis.client.get(cache_key)
    if cached:
        etag = _compute_etag(cached)
        if_none_match = request.headers.get("if-none-match")
        if if_none_match and if_none_match == etag:
            return Response(status_code=304)

    async with db.read_session() as session:
        # Matches that started on the selected date
        date_condition = and_(
            MatchORM.start_time >= day_start,
            MatchORM.start_time < day_end,
        )
        # When viewing "today", also include all currently live matches (e.g. started yesterday, still in progress)
        if is_today_utc:
            live_condition = or_(
                MatchORM.phase.like("live%"),
                MatchORM.phase == "break",
            )
            where_clause = or_(date_condition, live_condition)
        else:
            where_clause = date_condition

        # Fetch all matches for the date with their state, teams, and league info
        stmt = (
            select(
                MatchORM.id,
                MatchORM.phase,
                MatchORM.start_time,
                MatchORM.venue,
                MatchORM.league_id,
                MatchStateORM.score_home,
                MatchStateORM.score_away,
                MatchStateORM.clock,
                MatchStateORM.period,
                MatchStateORM.score_breakdown,
                MatchStateORM.version,
                LeagueORM.id.label("league_id_ref"),
                LeagueORM.name.label("league_name"),
                LeagueORM.short_name.label("league_short_name"),
                LeagueORM.country.label("league_country"),
                LeagueORM.logo_url.label("league_logo_url"),
                SportORM.name.label("sport_name"),
                SportORM.sport_type,
            )
            .join(MatchStateORM, MatchORM.id == MatchStateORM.match_id)
            .join(LeagueORM, MatchORM.league_id == LeagueORM.id)
            .join(SportORM, LeagueORM.sport_id == SportORM.id)
            .where(where_clause)
            .order_by(MatchORM.start_time.asc())
        )

        result = await session.execute(stmt)
        rows = result.all()

        # Collect all team IDs we need
        match_ids = [row.id for row in rows]

        # Fetch team info for all matches
        teams_by_match: dict[uuid.UUID, dict[str, Any]] = {}
        if match_ids:
            team_stmt = (
                select(
                    MatchORM.id.label("match_id"),
                    MatchORM.home_team_id,
                    MatchORM.away_team_id,
                )
                .where(MatchORM.id.in_(match_ids))
            )
            team_result = await session.execute(team_stmt)
            team_rows = team_result.all()

            # Gather unique team IDs
            all_team_ids = set()
            match_team_map: dict[uuid.UUID, tuple[uuid.UUID, uuid.UUID]] = {}
            for tr in team_rows:
                all_team_ids.add(tr.home_team_id)
                all_team_ids.add(tr.away_team_id)
                match_team_map[tr.match_id] = (tr.home_team_id, tr.away_team_id)

            # Fetch all teams in one query
            team_info: dict[uuid.UUID, dict[str, Any]] = {}
            if all_team_ids:
                team_detail_stmt = (
                    select(
                        TeamORM.id,
                        TeamORM.name,
                        TeamORM.short_name,
                        TeamORM.logo_url,
                    )
                    .where(TeamORM.id.in_(list(all_team_ids)))
                )
                td_result = await session.execute(team_detail_stmt)
                for td in td_result.all():
                    team_info[td.id] = {
                        "id": str(td.id),
                        "name": td.name,
                        "short_name": td.short_name,
                        "logo_url": td.logo_url,
                    }

            # Map teams to matches
            for mid, (home_id, away_id) in match_team_map.items():
                teams_by_match[mid] = {
                    "home_team": team_info.get(home_id, {}),
                    "away_team": team_info.get(away_id, {}),
                }

    # Group matches by league (dedupe: "today" query can return same match via date and live conditions)
    league_groups: dict[str, dict[str, Any]] = {}
    seen_match_ids: set[uuid.UUID] = set()

    for row in rows:
        if row.id in seen_match_ids:
            continue
        seen_match_ids.add(row.id)
        lid = str(row.league_id)

        if lid not in league_groups:
            league_groups[lid] = {
                "league_id": lid,
                "league_name": row.league_name,
                "league_short_name": row.league_short_name,
                "league_country": row.league_country,
                "league_logo_url": row.league_logo_url,
                "sport": row.sport_name,
                "sport_type": row.sport_type,
                "matches": [],
            }

        teams = teams_by_match.get(row.id, {})

        # Parse score_breakdown safely
        score_breakdown = row.score_breakdown
        if isinstance(score_breakdown, str):
            try:
                score_breakdown = json.loads(score_breakdown)
            except (json.JSONDecodeError, TypeError):
                score_breakdown = []

        match_data = {
            "id": str(row.id),
            "phase": row.phase,
            "start_time": row.start_time.isoformat() if row.start_time else None,
            "venue": row.venue,
            "score": {
                "home": row.score_home or 0,
                "away": row.score_away or 0,
            },
            "clock": row.clock,
            "period": row.period,
            "version": row.version or 0,
            "home_team": teams.get("home_team", {}),
            "away_team": teams.get("away_team", {}),
        }
        league_groups[lid]["matches"].append(match_data)

    # Sort league groups: leagues with live matches first, then by match count
    def league_sort_key(group: dict[str, Any]) -> tuple[int, int]:
        live_count = sum(
            1 for m in group["matches"]
            if m["phase"].startswith("live") or m["phase"] == "break"
        )
        return (-live_count, -len(group["matches"]))

    sorted_groups = sorted(league_groups.values(), key=league_sort_key)

    # Summary stats
    all_matches = [m for g in sorted_groups for m in g["matches"]]
    live_count = sum(
        1 for m in all_matches
        if m["phase"].startswith("live") or m["phase"] == "break"
    )
    finished_count = sum(
        1 for m in all_matches
        if m["phase"] in ("finished", "postponed", "cancelled")
    )
    scheduled_count = sum(
        1 for m in all_matches
        if m["phase"] in ("scheduled", "pre_match")
    )

    payload = {
        "date": target_date.isoformat(),
        "total_matches": len(all_matches),
        "live": live_count,
        "finished": finished_count,
        "scheduled": scheduled_count,
        "leagues": sorted_groups,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    # Cache for 15 seconds (short for live updates)
    payload_json = json.dumps(payload, default=str)
    await redis.client.setex(cache_key, 15, payload_json)

    etag = _compute_etag(payload_json)
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "public, max-age=5"

    return payload


def _compute_etag(content: str | bytes) -> str:
    """Compute a weak ETag from content."""
    if isinstance(content, str):
        content = content.encode()
    digest = hashlib.md5(content).hexdigest()[:16]
    return f'W/"{digest}"'