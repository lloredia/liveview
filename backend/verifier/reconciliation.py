"""
Reconciliation: apply correction to DB + Redis, or flag dispute.
Uses same Redis snapshot and publish_delta contract as ingest normalizer.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models.domain import LeagueRef, MatchScoreboard, Score, TeamRef
from shared.models.enums import MatchPhase, Tier
from shared.models.orm import MatchORM, MatchStateORM
from shared.utils.logging import get_logger
from shared.utils.redis_manager import RedisManager

from verifier.config import VerifierSettings, get_verifier_settings
from verifier.sources.base import CanonicalMatchState

logger = get_logger(__name__)

SNAP_SCOREBOARD_KEY = "snap:match:{match_id}:scoreboard"
VERIFICATION_LAST_CHECKED = "verification:last_checked:{match_id}"
VERIFICATION_CONFIDENCE = "verification:confidence:{match_id}"
VERIFICATION_DISPUTES = "verification:disputes"
DISPUTE_KEY = "dispute:match:{match_id}"


def _phase_value(phase: str) -> str:
    """Ensure phase is a valid MatchPhase value or fallback."""
    p = (phase or "").strip().lower()
    if not p:
        return "scheduled"
    for mp in MatchPhase:
        if mp.value == p:
            return p
    if p.startswith("live_"):
        return p
    if p in ("finished", "postponed", "cancelled", "scheduled", "break", "suspended"):
        return p
    return "scheduled"


async def apply_correction(
    session: AsyncSession,
    redis: RedisManager,
    match_id: uuid.UUID,
    league: LeagueRef,
    home_team: TeamRef,
    away_team: TeamRef,
    start_time: datetime,
    corrected: CanonicalMatchState,
    settings: Optional[VerifierSettings] = None,
) -> bool:
    """
    Update match_state and match.phase, write Redis snapshot, publish delta.
    Returns True if updated, False if no change.
    """
    settings = settings or get_verifier_settings()
    state = await session.get(MatchStateORM, match_id)
    if not state:
        logger.warning("reconciliation_no_state", match_id=str(match_id))
        return False

    new_version = state.version + 1
    new_seq = state.seq + 1
    phase_val = _phase_value(corrected.phase)

    state.score_home = corrected.score_home
    state.score_away = corrected.score_away
    state.phase = phase_val
    state.clock = corrected.clock
    state.period = corrected.period
    state.version = new_version
    state.seq = new_seq
    state.updated_at = datetime.now(timezone.utc)

    match = await session.get(MatchORM, match_id)
    if match:
        match.phase = phase_val
        match.version = new_version

    await session.flush()

    score = Score(home=corrected.score_home, away=corrected.score_away, breakdown=[])
    try:
        phase_enum = MatchPhase(phase_val)
    except ValueError:
        phase_enum = MatchPhase.SCHEDULED
    scoreboard = MatchScoreboard(
        match_id=match_id,
        league=league,
        home_team=home_team,
        away_team=away_team,
        score=score,
        phase=phase_enum,
        clock=corrected.clock,
        start_time=start_time,
        version=new_version,
        seq=new_seq,
    )
    snap_key = SNAP_SCOREBOARD_KEY.format(match_id=str(match_id))
    await redis.set_snapshot(snap_key, scoreboard.model_dump_json(), ttl_s=300)
    await redis.publish_delta(str(match_id), Tier.SCOREBOARD.value, scoreboard.model_dump_json())

    logger.info(
        "verification_correction_applied",
        match_id=str(match_id),
        score=f"{corrected.score_home}-{corrected.score_away}",
        phase=phase_val,
        version=new_version,
    )
    return True


async def flag_dispute(
    redis: RedisManager,
    match_id: uuid.UUID,
    current: dict,
    verified_sources: list[dict],
    confidence: float,
    ttl_s: Optional[int] = None,
) -> None:
    """Store dispute in Redis for manual review."""
    settings = get_verifier_settings()
    ttl_s = ttl_s or settings.dispute_ttl_s
    key = DISPUTE_KEY.format(match_id=str(match_id))
    payload = json.dumps({
        "match_id": str(match_id),
        "current": current,
        "verified_sources": verified_sources,
        "confidence": confidence,
        "at": datetime.now(timezone.utc).isoformat(),
    })
    await redis.client.set(key, payload, ex=ttl_s)
    await redis.client.sadd(VERIFICATION_DISPUTES, key)
    logger.warning(
        "verification_dispute_flagged",
        match_id=str(match_id),
        confidence=confidence,
    )


async def set_last_checked(redis: RedisManager, match_id: str, ttl_s: Optional[int] = None) -> None:
    settings = get_verifier_settings()
    ttl_s = ttl_s or settings.last_checked_ttl_s
    key = VERIFICATION_LAST_CHECKED.format(match_id=match_id)
    await redis.client.set(key, datetime.now(timezone.utc).isoformat(), ex=ttl_s)


async def set_confidence(redis: RedisManager, match_id: str, confidence: float, ttl_s: int = 3600) -> None:
    key = VERIFICATION_CONFIDENCE.format(match_id=match_id)
    await redis.client.set(key, str(confidence), ex=ttl_s)
