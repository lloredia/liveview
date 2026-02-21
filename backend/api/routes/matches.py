"""
Match REST endpoints.

GET /v1/matches/{id}          — Match center (scoreboard + metadata).
GET /v1/matches/{id}/timeline — Ordered event timeline for a match.
GET /v1/matches/{id}/stats    — Team and player statistics.
"""
from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import select

from shared.config import Settings, get_settings
from shared.models.orm import (
    LeagueORM,
    MatchEventORM,
    MatchORM,
    MatchStateORM,
    MatchStatsORM,
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
