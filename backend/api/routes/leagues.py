"""
League REST endpoints.

GET /v1/leagues          — List all leagues, grouped by sport.
GET /v1/leagues/{id}/scoreboard — Live scoreboard for a league (all matches in current phase).
"""
from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select

from shared.config import Settings, get_settings
from shared.models.enums import MatchPhase
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
router = APIRouter(prefix="/v1/leagues", tags=["leagues"])


@router.get("")
async def list_leagues(
    db: DatabaseManager = Depends(get_db),
) -> list[dict[str, Any]]:
    """
    List all leagues grouped by sport.

    Returns a list of sport objects, each containing their leagues.
    """
    async with db.read_session() as session:
        stmt = (
            select(
                LeagueORM.id,
                LeagueORM.name,
                LeagueORM.short_name,
                LeagueORM.country,
                SportORM.sport_type,
                SportORM.name.label("sport_display"),
            )
            .join(SportORM, LeagueORM.sport_id == SportORM.id)
            .order_by(SportORM.sport_type, LeagueORM.name)
        )
        result = await session.execute(stmt)
        rows = result.all()

    sports: dict[str, dict[str, Any]] = {}
    for row in rows:
        sport_key = row.sport_type
        if sport_key not in sports:
            sports[sport_key] = {
                "sport": sport_key,
                "sport_display": row.sport_display,
                "leagues": [],
            }
        sports[sport_key]["leagues"].append({
            "id": str(row.id),
            "name": row.name,
            "short_name": row.short_name,
            "country": row.country,
        })

    return list(sports.values())


@router.get("/{league_id}/scoreboard")
async def league_scoreboard(
    league_id: uuid.UUID,
    request: Request,
    response: Response,
    db: DatabaseManager = Depends(get_db),
    redis: RedisManager = Depends(get_redis),
) -> dict[str, Any]:
    """
    Get the live scoreboard for a league.

    Returns all matches that are currently live, recently finished, or starting soon,
    with current scores and match phase information.

    Supports ETag-based conditional requests.
    """
    # Check Redis cache first
    cache_key = f"api:scoreboard:{league_id}"
    cached = await redis.client.get(cache_key)
    if cached:
        data = json.loads(cached)
        etag = _compute_etag(cached)
        if_none_match = request.headers.get("if-none-match")
        if if_none_match and if_none_match == etag:
            return Response(status_code=304)
        response.headers["ETag"] = etag
        response.headers["Cache-Control"] = "public, max-age=2"
        return data

    # Query database
    async with db.read_session() as session:
        league_stmt = select(LeagueORM).where(LeagueORM.id == league_id)
        league_result = await session.execute(league_stmt)
        league = league_result.scalar_one_or_none()
        if league is None:
            raise HTTPException(status_code=404, detail="League not found")

        home_team = TeamORM.__table__.alias("ht")
        away_team = TeamORM.__table__.alias("at")

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
                MatchStateORM.version,
                home_team.c.id.label("ht_id"),
                home_team.c.name.label("ht_name"),
                home_team.c.short_name.label("ht_short"),
                home_team.c.logo_url.label("ht_logo"),
                away_team.c.id.label("at_id"),
                away_team.c.name.label("at_name"),
                away_team.c.short_name.label("at_short"),
                away_team.c.logo_url.label("at_logo"),
            )
            .outerjoin(MatchStateORM, MatchORM.id == MatchStateORM.match_id)
            .outerjoin(home_team, MatchORM.home_team_id == home_team.c.id)
            .outerjoin(away_team, MatchORM.away_team_id == away_team.c.id)
            .where(MatchORM.league_id == league_id)
            .where(
                MatchORM.phase.in_([
                    p.value for p in MatchPhase
                    if p.is_live or p == MatchPhase.PRE_MATCH
                    or p == MatchPhase.FINISHED or p == MatchPhase.SCHEDULED
                ])
            )
            .order_by(MatchORM.start_time)
        )
        result = await session.execute(stmt)
        match_rows = result.all()

        matches = []
        for row in match_rows:
            matches.append({
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
                "home_team": {
                    "id": str(row.ht_id) if row.ht_id else None,
                    "name": row.ht_name,
                    "short_name": row.ht_short,
                    "logo_url": row.ht_logo,
                } if row.ht_id else None,
                "away_team": {
                    "id": str(row.at_id) if row.at_id else None,
                    "name": row.at_name,
                    "short_name": row.at_short,
                    "logo_url": row.at_logo,
                } if row.at_id else None,
            })

    payload = {
        "league_id": str(league_id),
        "league_name": league.name,
        "matches": matches,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    # Cache for 2 seconds
    payload_json = json.dumps(payload, default=str)
    await redis.client.set(cache_key, payload_json, ex=2)

    etag = _compute_etag(payload_json)
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "public, max-age=2"

    return payload


def _compute_etag(content: str | bytes) -> str:
    """Compute a weak ETag from content."""
    if isinstance(content, str):
        content = content.encode()
    digest = hashlib.md5(content).hexdigest()[:16]
    return f'W/"{digest}"'
