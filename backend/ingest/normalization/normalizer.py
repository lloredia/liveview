"""
Normalization layer for the ingest service.
Resolves provider-specific IDs to canonical UUIDs using provider_mappings table.
Writes normalized data to PostgreSQL and publishes deltas to Redis.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models.domain import (
    MatchEvent,
    MatchScoreboard,
    MatchStats,
)
from shared.models.enums import ProviderName, Tier
from shared.models.orm import (
    MatchEventORM,
    MatchORM,
    MatchStateORM,
    MatchStatsORM,
    ProviderMappingORM,
)
from shared.utils.logging import get_logger
from shared.utils.metrics import FANOUT_PUBLISHES, INGEST_NORMALIZATIONS
from shared.utils.redis_manager import (
    SNAP_EVENTS_KEY,
    SNAP_SCOREBOARD_KEY,
    SNAP_STATS_KEY,
    RedisManager,
)

logger = get_logger(__name__)


class NormalizationService:
    """
    Normalizes provider data and persists to the canonical data store.

    Responsibilities:
    - Resolve provider IDs → canonical UUIDs via provider_mappings
    - Write match state to PostgreSQL
    - Write snapshots to Redis
    - Publish deltas on Redis pub/sub
    - Handle idempotent upserts
    """

    def __init__(self, redis: RedisManager) -> None:
        self._redis = redis

    # ── Provider ID resolution ──────────────────────────────────────────

    async def resolve_canonical_id(
        self,
        session: AsyncSession,
        entity_type: str,
        provider: ProviderName,
        provider_id: str,
    ) -> Optional[uuid.UUID]:
        """
        Look up the canonical UUID for a provider-specific entity ID.

        Args:
            session: Active DB session.
            entity_type: 'match', 'team', 'league', 'player'.
            provider: The provider name.
            provider_id: The provider's identifier.

        Returns:
            The canonical UUID, or None if no mapping exists.
        """
        stmt = select(ProviderMappingORM.canonical_id).where(
            ProviderMappingORM.entity_type == entity_type,
            ProviderMappingORM.provider == provider.value,
            ProviderMappingORM.provider_id == provider_id,
        )
        result = await session.execute(stmt)
        row = result.scalar_one_or_none()
        return row

    async def ensure_mapping(
        self,
        session: AsyncSession,
        entity_type: str,
        canonical_id: uuid.UUID,
        provider: ProviderName,
        provider_id: str,
    ) -> None:
        """Create or update a provider mapping (idempotent upsert)."""
        stmt = pg_insert(ProviderMappingORM).values(
            entity_type=entity_type,
            canonical_id=canonical_id,
            provider=provider.value,
            provider_id=provider_id,
        ).on_conflict_do_update(
            constraint="uq_provider_mapping",
            set_={"canonical_id": canonical_id, "updated_at": datetime.now(timezone.utc)},
        )
        await session.execute(stmt)

    # ── Scoreboard normalization (Tier 0) ───────────────────────────────

    async def normalize_scoreboard(
        self,
        session: AsyncSession,
        canonical_match_id: uuid.UUID,
        scoreboard: MatchScoreboard,
        provider: ProviderName,
    ) -> bool:
        """
        Normalize and persist a scoreboard update.

        Returns:
            True if the state changed (delta should be published), False if no-op.
        """
        # Upsert match_state
        existing = await session.get(MatchStateORM, canonical_match_id)

        score_breakdown_json = [sb.model_dump() for sb in scoreboard.score.breakdown]
        new_version = (existing.version + 1) if existing else 1
        new_seq = (existing.seq + 1) if existing else 1

        if existing:
            # Check for actual changes
            changed = (
                existing.score_home != scoreboard.score.home
                or existing.score_away != scoreboard.score.away
                or existing.phase != scoreboard.phase.value
                or existing.clock != scoreboard.clock
            )
            if not changed:
                return False

            existing.score_home = scoreboard.score.home
            existing.score_away = scoreboard.score.away
            existing.score_breakdown = score_breakdown_json
            existing.clock = scoreboard.clock
            existing.phase = scoreboard.phase.value
            existing.version = new_version
            existing.seq = new_seq
            existing.updated_at = datetime.now(timezone.utc)
        else:
            state = MatchStateORM(
                match_id=canonical_match_id,
                score_home=scoreboard.score.home,
                score_away=scoreboard.score.away,
                score_breakdown=score_breakdown_json,
                clock=scoreboard.clock,
                phase=scoreboard.phase.value,
                version=new_version,
                seq=new_seq,
            )
            session.add(state)

        # Update match phase
        match_orm = await session.get(MatchORM, canonical_match_id)
        if match_orm:
            match_orm.phase = scoreboard.phase.value
            match_orm.version = new_version

        await session.flush()

        # Write scoreboard snapshot to Redis
        snapshot_data = scoreboard.model_copy(
            update={"match_id": canonical_match_id, "version": new_version, "seq": new_seq}
        )
        snap_key = SNAP_SCOREBOARD_KEY.format(match_id=str(canonical_match_id))
        await self._redis.set_snapshot(snap_key, snapshot_data.model_dump_json(), ttl_s=300)

        # Publish delta
        await self._redis.publish_delta(
            str(canonical_match_id),
            Tier.SCOREBOARD.value,
            snapshot_data.model_dump_json(),
        )
        FANOUT_PUBLISHES.labels(tier="scoreboard").inc()
        INGEST_NORMALIZATIONS.labels(provider=provider.value, sport=scoreboard.league.sport.value).inc()

        logger.info(
            "scoreboard_normalized",
            match_id=str(canonical_match_id),
            score=f"{scoreboard.score.home}-{scoreboard.score.away}",
            phase=scoreboard.phase.value,
            version=new_version,
        )
        return True

    # ── Events normalization (Tier 1) ───────────────────────────────────

    async def normalize_events(
        self,
        session: AsyncSession,
        canonical_match_id: uuid.UUID,
        events: list[MatchEvent],
        provider: ProviderName,
    ) -> list[MatchEvent]:
        """
        Normalize and persist new events. Handles idempotent insert via
        the unique constraint on (match_id, source_provider, provider_event_id).

        Returns:
            List of newly inserted events (not duplicates).
        """
        new_events: list[MatchEvent] = []

        for event in events:
            if not event.provider_event_id:
                event.provider_event_id = str(uuid.uuid4())

            # Check for existing event (idempotency)
            existing_stmt = select(MatchEventORM.id).where(
                MatchEventORM.match_id == canonical_match_id,
                MatchEventORM.source_provider == provider.value,
                MatchEventORM.provider_event_id == event.provider_event_id,
            )
            existing = (await session.execute(existing_stmt)).scalar_one_or_none()
            if existing:
                continue

            # Get next seq
            max_seq_stmt = select(text("COALESCE(MAX(seq), 0)")).select_from(
                MatchEventORM.__table__
            ).where(MatchEventORM.match_id == canonical_match_id)
            max_seq = (await session.execute(max_seq_stmt)).scalar() or 0
            next_seq = max_seq + 1

            orm_event = MatchEventORM(
                match_id=canonical_match_id,
                event_type=event.event_type.value,
                minute=event.minute,
                second=event.second,
                period=event.period,
                team_id=event.team_id,
                player_name=event.player_name,
                detail=event.detail,
                score_home=event.score_home,
                score_away=event.score_away,
                synthetic=event.synthetic,
                confidence=event.confidence,
                source_provider=provider.value,
                provider_event_id=event.provider_event_id,
                seq=next_seq,
            )
            session.add(orm_event)

            normalized_event = event.model_copy(update={
                "match_id": canonical_match_id,
                "id": orm_event.id,
                "seq": next_seq,
            })
            new_events.append(normalized_event)

        if new_events:
            await session.flush()

            # Append to Redis event stream
            for evt in new_events:
                await self._redis.append_event_stream(
                    str(canonical_match_id),
                    evt.model_dump_json(),
                )

            # Publish delta
            events_payload = json.dumps([e.model_dump_json() for e in new_events])
            await self._redis.publish_delta(
                str(canonical_match_id),
                Tier.EVENTS.value,
                events_payload,
            )
            FANOUT_PUBLISHES.labels(tier="events").inc()

            logger.info(
                "events_normalized",
                match_id=str(canonical_match_id),
                new_count=len(new_events),
                provider=provider.value,
            )

        return new_events

    # ── Stats normalization (Tier 2) ────────────────────────────────────

    async def normalize_stats(
        self,
        session: AsyncSession,
        canonical_match_id: uuid.UUID,
        stats: MatchStats,
        provider: ProviderName,
    ) -> bool:
        """
        Normalize and persist match statistics update.

        Returns:
            True if stats changed, False if no-op.
        """
        existing = (await session.execute(
            select(MatchStatsORM).where(MatchStatsORM.match_id == canonical_match_id)
        )).scalar_one_or_none()

        home_dict = stats.home_stats.model_dump(exclude_none=True)
        away_dict = stats.away_stats.model_dump(exclude_none=True)

        if existing:
            # Check for changes
            if existing.home_stats == home_dict and existing.away_stats == away_dict:
                return False

            existing.home_stats = home_dict
            existing.away_stats = away_dict
            existing.version += 1
            existing.seq += 1
            existing.updated_at = datetime.now(timezone.utc)
            new_version = existing.version
            new_seq = existing.seq
        else:
            orm_stats = MatchStatsORM(
                match_id=canonical_match_id,
                home_stats=home_dict,
                away_stats=away_dict,
                version=1,
                seq=1,
            )
            session.add(orm_stats)
            new_version = 1
            new_seq = 1

        await session.flush()

        # Snapshot
        snapshot = stats.model_copy(update={
            "match_id": canonical_match_id,
            "version": new_version,
            "seq": new_seq,
        })
        snap_key = SNAP_STATS_KEY.format(match_id=str(canonical_match_id))
        await self._redis.set_snapshot(snap_key, snapshot.model_dump_json(), ttl_s=300)

        # Publish delta
        await self._redis.publish_delta(
            str(canonical_match_id),
            Tier.STATS.value,
            snapshot.model_dump_json(),
        )
        FANOUT_PUBLISHES.labels(tier="stats").inc()

        logger.info(
            "stats_normalized",
            match_id=str(canonical_match_id),
            version=new_version,
        )
        return True
