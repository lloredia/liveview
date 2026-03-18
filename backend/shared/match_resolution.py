"""Shared helpers for resolving canonical matches from provider-side team and schedule data."""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta
from typing import Any, Optional

from sqlalchemy import text

from shared.utils.logging import get_logger
from shared.utils.metrics import PROVIDER_MAPPING_UNRESOLVED

logger = get_logger(__name__)


def normalize_team_name(value: str | None) -> str:
    return re.sub(r"[^a-z0-9]", "", (value or "").strip().lower())


def team_names_match(
    canonical_name: str | None,
    canonical_short: str | None,
    provider_name: str | None,
    provider_short: str | None,
) -> bool:
    canonical_candidates = {
        normalize_team_name(canonical_name),
        normalize_team_name(canonical_short),
    }
    provider_candidates = {
        normalize_team_name(provider_name),
        normalize_team_name(provider_short),
    }
    canonical_candidates.discard("")
    provider_candidates.discard("")
    return bool(canonical_candidates & provider_candidates)


async def resolve_match_by_team_names(
    session: Any,
    *,
    provider: str,
    provider_match_id: str,
    league_id: uuid.UUID,
    scheduled_at: datetime,
    home_name: str | None,
    home_short: str | None,
    away_name: str | None,
    away_short: str | None,
    window_minutes: int = 90,
) -> Optional[uuid.UUID]:
    """Resolve a unique canonical match by league + time window + team names."""
    candidates = (
        await session.execute(
            text(
                "SELECT m.id, ht.name, ht.short_name, at.name, at.short_name "
                "FROM matches m "
                "JOIN teams ht ON m.home_team_id = ht.id "
                "JOIN teams at ON m.away_team_id = at.id "
                "WHERE m.league_id = :league_id "
                "AND m.start_time >= :window_start "
                "AND m.start_time <= :window_end"
            ),
            {
                "league_id": league_id,
                "window_start": scheduled_at - timedelta(minutes=window_minutes),
                "window_end": scheduled_at + timedelta(minutes=window_minutes),
            },
        )
    ).fetchall()

    matched_candidates: list[uuid.UUID] = []
    for row in candidates:
        if team_names_match(row[1], row[2], home_name, home_short) and team_names_match(
            row[3], row[4], away_name, away_short
        ):
            matched_candidates.append(row[0])

    if len(matched_candidates) == 1:
        return matched_candidates[0]

    reason = "no_candidate"
    if len(matched_candidates) > 1:
        reason = "ambiguous_candidate"
        logger.warning(
            "match_resolution_ambiguous",
            provider=provider,
            provider_match_id=provider_match_id,
            candidate_count=len(matched_candidates),
            method="team_names",
        )
    else:
        logger.warning(
            "match_resolution_unresolved",
            provider=provider,
            provider_match_id=provider_match_id,
            method="team_names",
        )

    PROVIDER_MAPPING_UNRESOLVED.labels(provider=provider, reason=reason).inc()
    return None


async def resolve_match_by_team_ids(
    session: Any,
    *,
    provider: str,
    provider_match_id: str,
    league_id: uuid.UUID,
    home_team_id: uuid.UUID,
    away_team_id: uuid.UUID,
    scheduled_at: datetime,
    window_minutes: int = 90,
) -> Optional[uuid.UUID]:
    """Resolve a unique canonical match by league + exact team ids + time window."""
    rows = (
        await session.execute(
            text(
                "SELECT id FROM matches "
                "WHERE league_id = :league_id "
                "AND home_team_id = :home_team_id "
                "AND away_team_id = :away_team_id "
                "AND start_time >= :window_start "
                "AND start_time <= :window_end"
            ),
            {
                "league_id": league_id,
                "home_team_id": home_team_id,
                "away_team_id": away_team_id,
                "window_start": scheduled_at - timedelta(minutes=window_minutes),
                "window_end": scheduled_at + timedelta(minutes=window_minutes),
            },
        )
    ).fetchall()

    if len(rows) == 1:
        return rows[0][0]

    reason = "no_candidate"
    if len(rows) > 1:
        reason = "ambiguous_candidate"
        logger.warning(
            "match_resolution_ambiguous",
            provider=provider,
            provider_match_id=provider_match_id,
            candidate_count=len(rows),
            method="team_ids",
        )
    else:
        logger.warning(
            "match_resolution_unresolved",
            provider=provider,
            provider_match_id=provider_match_id,
            method="team_ids",
        )

    PROVIDER_MAPPING_UNRESOLVED.labels(provider=provider, reason=reason).inc()
    return None
