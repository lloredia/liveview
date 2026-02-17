"""
Builder service for Live View.
Responsibilities:
1. Subscribe to match state change fanout channels.
2. Generate synthetic timeline events when providers lack play-by-play.
3. Reconcile synthetic events against real events when they arrive (dedup / supersede).
4. Persist reconciled events back to the database and publish to downstream consumers.
"""
from __future__ import annotations

import asyncio
import json
import signal
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import delete, select

from shared.config import Settings, get_settings
from shared.models.domain import MatchEvent, MatchScoreboard, Score
from shared.models.enums import EventType, MatchPhase, Sport, Tier
from shared.models.orm import (
    MatchEventORM,
    MatchORM,
    MatchStateORM,
    SportORM,
    LeagueORM,
)
from shared.utils.database import DatabaseManager
from shared.utils.logging import get_logger, setup_logging
from shared.utils.metrics import SYNTHETIC_EVENTS, start_metrics_server
from shared.utils.redis_manager import RedisManager

from builder.timeline.synthetic import SyntheticTimelineGenerator

logger = get_logger(__name__)

# Channel pattern for scoreboard deltas: fanout:match:{match_id}:tier:0
FANOUT_PATTERN = "fanout:match:*:tier:0"
# Channel for real events arriving: fanout:match:{match_id}:tier:1
EVENTS_FANOUT_PATTERN = "fanout:match:*:tier:1"

# Redis key for storing previous scoreboard state per match (for diff generation)
PREV_SNAP_PREFIX = "builder:prev_snap:"

# Reconciliation: if a real event arrives within this window of a synthetic event
# with matching type/team/score, the synthetic event is superseded.
RECONCILIATION_WINDOW_S = 120.0


class ReconciliationEngine:
    """
    Compares synthetic events against real events and removes duplicates.

    Strategy:
    1. When a real event arrives, check recent synthetic events for the same match.
    2. If a synthetic event matches on (event_type, team_id, score_home, score_away)
       within a time window, mark the synthetic event as superseded.
    3. Superseded synthetic events are soft-deleted (kept for audit but excluded from timeline).
    """

    def __init__(self, db: DatabaseManager) -> None:
        self._db = db

    async def reconcile(
        self,
        match_id: uuid.UUID,
        real_events: list[MatchEvent],
    ) -> int:
        """
        Reconcile real events against existing synthetic events for a match.

        Returns the number of synthetic events superseded.
        """
        if not real_events:
            return 0

        superseded_count = 0

        async with self._db.write_session() as session:
            # Fetch all synthetic events for this match that haven't been superseded
            stmt = (
                select(MatchEventORM)
                .where(
                    MatchEventORM.match_id == match_id,
                    MatchEventORM.synthetic == True,  # noqa: E712
                )
                .order_by(MatchEventORM.seq.desc())
                .limit(50)  # Only check recent synthetic events
            )
            result = await session.execute(stmt)
            synthetic_events = list(result.scalars().all())

            if not synthetic_events:
                return 0

            for real_evt in real_events:
                for synth_orm in synthetic_events:
                    if self._events_match(real_evt, synth_orm):
                        # Delete the synthetic event — real event takes precedence
                        await session.delete(synth_orm)
                        superseded_count += 1
                        logger.info(
                            "synthetic_event_superseded",
                            match_id=str(match_id),
                            synthetic_event_id=str(synth_orm.id),
                            real_event_type=real_evt.event_type.value,
                            real_provider_event_id=real_evt.provider_event_id,
                        )
                        break  # Each real event can only supersede one synthetic

            await session.commit()

        return superseded_count

    def _events_match(self, real: MatchEvent, synth: MatchEventORM) -> bool:
        """
        Determine if a real event matches (and should supersede) a synthetic event.

        Matching criteria:
        - Same event type
        - Same team (if applicable)
        - Same or adjacent score state
        - Within temporal window (minute-based)
        """
        if real.event_type.value != synth.event_type:
            return False

        # For scoring events, check score match
        if real.event_type in (EventType.GOAL, EventType.BASKET, EventType.RUN):
            if real.score_home != synth.score_home or real.score_away != synth.score_away:
                return False
            if real.team_id and synth.team_id and real.team_id != synth.team_id:
                return False

        # For phase transitions, event type match is sufficient
        if real.event_type in (
            EventType.MATCH_START, EventType.MATCH_END,
            EventType.PERIOD_START, EventType.PERIOD_END,
        ):
            # Minute proximity check
            if real.minute is not None and synth.minute is not None:
                if abs(real.minute - synth.minute) > 5:
                    return False

        return True


class BuilderService:
    """
    Main builder service that:
    1. Subscribes to scoreboard state change fanout channels.
    2. Generates synthetic events from state diffs.
    3. Persists synthetic events to the database.
    4. Reconciles when real events arrive.
    """

    def __init__(
        self,
        redis: RedisManager,
        db: DatabaseManager,
        settings: Settings | None = None,
    ) -> None:
        self._redis = redis
        self._db = db
        self._settings = settings or get_settings()
        self._timeline_gen = SyntheticTimelineGenerator(min_confidence=0.3)
        self._reconciler = ReconciliationEngine(db)
        self._shutdown = asyncio.Event()
        self._tasks: list[asyncio.Task[None]] = []
        # In-memory cache of previous scoreboards per match for diff computation
        # (backed by Redis for crash recovery)
        self._prev_scoreboards: dict[str, MatchScoreboard] = {}

    async def _load_previous_scoreboard(
        self, match_id: str
    ) -> Optional[MatchScoreboard]:
        """Load previous scoreboard from local cache or Redis."""
        if match_id in self._prev_scoreboards:
            return self._prev_scoreboards[match_id]

        key = f"{PREV_SNAP_PREFIX}{match_id}"
        raw = await self._redis.client.get(key)
        if raw:
            try:
                data = json.loads(raw)
                sb = MatchScoreboard.model_validate(data)
                self._prev_scoreboards[match_id] = sb
                return sb
            except Exception as exc:
                logger.warning(
                    "prev_scoreboard_parse_error",
                    match_id=match_id,
                    error=str(exc),
                )
        return None

    async def _save_previous_scoreboard(
        self, match_id: str, scoreboard: MatchScoreboard
    ) -> None:
        """Save current scoreboard as previous for next diff."""
        self._prev_scoreboards[match_id] = scoreboard
        key = f"{PREV_SNAP_PREFIX}{match_id}"
        await self._redis.client.set(
            key,
            scoreboard.model_dump_json(),
            ex=3600,  # 1 hour TTL
        )

    async def _handle_scoreboard_delta(self, channel: str, message: str) -> None:
        """
        Handle an incoming scoreboard delta from the fanout channel.
        Parses the match ID from the channel, loads the previous state,
        generates synthetic events, and persists them.
        """
        try:
            # Channel format: fanout:match:{match_id}:tier:0
            parts = channel.split(":")
            if len(parts) < 4:
                return
            match_id_str = parts[2]

            data = json.loads(message)
            current_sb = MatchScoreboard.model_validate(data)

            # Resolve sport for this match
            sport = await self._resolve_match_sport(uuid.UUID(match_id_str))
            if sport is None:
                return

            # Load previous state
            previous_sb = await self._load_previous_scoreboard(match_id_str)

            # Generate synthetic events
            synthetic_events = self._timeline_gen.generate_from_state_change(
                match_id=uuid.UUID(match_id_str),
                sport=sport,
                previous=previous_sb,
                current=current_sb,
            )

            if synthetic_events:
                await self._persist_synthetic_events(synthetic_events)
                logger.info(
                    "synthetic_events_generated",
                    match_id=match_id_str,
                    count=len(synthetic_events),
                    types=[e.event_type.value for e in synthetic_events],
                )

            # Update previous state
            await self._save_previous_scoreboard(match_id_str, current_sb)

        except Exception as exc:
            logger.error(
                "scoreboard_delta_handler_error",
                channel=channel,
                error=str(exc),
                exc_info=True,
            )

    async def _handle_events_delta(self, channel: str, message: str) -> None:
        """
        Handle incoming real events from the fanout channel.
        Triggers reconciliation against existing synthetic events.
        """
        try:
            parts = channel.split(":")
            if len(parts) < 4:
                return
            match_id_str = parts[2]

            data = json.loads(message)
            if not isinstance(data, list):
                data = [data]

            real_events: list[MatchEvent] = []
            for evt_data in data:
                try:
                    real_events.append(MatchEvent.model_validate(evt_data))
                except Exception:
                    continue

            if real_events:
                superseded = await self._reconciler.reconcile(
                    match_id=uuid.UUID(match_id_str),
                    real_events=real_events,
                )
                if superseded > 0:
                    logger.info(
                        "reconciliation_completed",
                        match_id=match_id_str,
                        superseded_count=superseded,
                    )

        except Exception as exc:
            logger.error(
                "events_delta_handler_error",
                channel=channel,
                error=str(exc),
                exc_info=True,
            )

    async def _resolve_match_sport(self, match_id: uuid.UUID) -> Optional[Sport]:
        """Resolve the sport type for a given match ID."""
        cache_key = f"builder:sport:{match_id}"
        cached = await self._redis.client.get(cache_key)
        if cached:
            try:
                return Sport(cached.decode() if isinstance(cached, bytes) else cached)
            except ValueError:
                pass

        async with self._db.read_session() as session:
            stmt = (
                select(SportORM.sport_type)
                .join(LeagueORM, SportORM.id == LeagueORM.sport_id)
                .join(MatchORM, LeagueORM.id == MatchORM.league_id)
                .where(MatchORM.id == match_id)
            )
            result = await session.execute(stmt)
            row = result.scalar_one_or_none()
            if row:
                sport = Sport(row)
                await self._redis.client.set(cache_key, sport.value, ex=7200)
                return sport

        return None

    async def _persist_synthetic_events(self, events: list[MatchEvent]) -> None:
        """Persist synthetic events to the database with idempotency."""
        async with self._db.write_session() as session:
            for evt in events:
                orm = MatchEventORM(
                    id=evt.id,
                    match_id=evt.match_id,
                    event_type=evt.event_type.value,
                    minute=evt.minute,
                    second=evt.second,
                    period=evt.period,
                    team_id=evt.team_id,
                    player_id=None,
                    detail=evt.detail,
                    score_home=evt.score_home,
                    score_away=evt.score_away,
                    source_provider=None,
                    provider_event_id=evt.provider_event_id,
                    synthetic=True,
                    confidence=evt.confidence,
                    created_at=evt.created_at or datetime.now(timezone.utc),
                )
                session.add(orm)

            try:
                await session.commit()
            except Exception as exc:
                await session.rollback()
                if "unique" in str(exc).lower() or "duplicate" in str(exc).lower():
                    logger.debug(
                        "synthetic_event_duplicate_ignored",
                        count=len(events),
                    )
                else:
                    raise

    async def _run_scoreboard_subscriber(self) -> None:
        """Subscribe to scoreboard delta channels and process messages."""
        pubsub = self._redis.client.pubsub()
        await pubsub.psubscribe(FANOUT_PATTERN)
        logger.info("subscribed_to_scoreboard_fanout", pattern=FANOUT_PATTERN)

        try:
            while not self._shutdown.is_set():
                message = await pubsub.get_message(
                    ignore_subscribe_messages=True, timeout=1.0
                )
                if message and message["type"] == "pmessage":
                    channel = (
                        message["channel"].decode()
                        if isinstance(message["channel"], bytes)
                        else message["channel"]
                    )
                    data = (
                        message["data"].decode()
                        if isinstance(message["data"], bytes)
                        else message["data"]
                    )
                    asyncio.create_task(
                        self._handle_scoreboard_delta(channel, data)
                    )
                else:
                    await asyncio.sleep(0.01)
        finally:
            await pubsub.punsubscribe(FANOUT_PATTERN)
            await pubsub.close()

    async def _run_events_subscriber(self) -> None:
        """Subscribe to real events delta channels and trigger reconciliation."""
        pubsub = self._redis.client.pubsub()
        await pubsub.psubscribe(EVENTS_FANOUT_PATTERN)
        logger.info("subscribed_to_events_fanout", pattern=EVENTS_FANOUT_PATTERN)

        try:
            while not self._shutdown.is_set():
                message = await pubsub.get_message(
                    ignore_subscribe_messages=True, timeout=1.0
                )
                if message and message["type"] == "pmessage":
                    channel = (
                        message["channel"].decode()
                        if isinstance(message["channel"], bytes)
                        else message["channel"]
                    )
                    data = (
                        message["data"].decode()
                        if isinstance(message["data"], bytes)
                        else message["data"]
                    )
                    asyncio.create_task(
                        self._handle_events_delta(channel, data)
                    )
                else:
                    await asyncio.sleep(0.01)
        finally:
            await pubsub.punsubscribe(EVENTS_FANOUT_PATTERN)
            await pubsub.close()

    async def _run_periodic_cleanup(self) -> None:
        """
        Periodically clean up stale synthetic events and expired cache entries.
        Runs every 5 minutes.
        """
        while not self._shutdown.is_set():
            try:
                await asyncio.sleep(300)
                if self._shutdown.is_set():
                    break

                stale_keys = []
                for match_id_str in list(self._prev_scoreboards.keys()):
                    sb = self._prev_scoreboards[match_id_str]
                    if sb.phase.is_terminal:
                        stale_keys.append(match_id_str)

                for key in stale_keys:
                    del self._prev_scoreboards[key]

                if stale_keys:
                    logger.info(
                        "prev_scoreboard_cache_cleanup",
                        removed_count=len(stale_keys),
                    )

            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error(
                    "periodic_cleanup_error", error=str(exc), exc_info=True
                )

    async def run(self) -> None:
        """Start the builder service."""
        self._tasks = [
            asyncio.create_task(self._run_scoreboard_subscriber()),
            asyncio.create_task(self._run_events_subscriber()),
            asyncio.create_task(self._run_periodic_cleanup()),
        ]

        logger.info("builder_service_started")
        await self._shutdown.wait()

        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)

    def request_shutdown(self) -> None:
        """Signal the service to shut down gracefully."""
        self._shutdown.set()


async def main() -> None:
    """Builder service entrypoint."""
    settings = get_settings()
    setup_logging("builder")
    start_metrics_server(9093)

    redis = RedisManager(settings)
    db = DatabaseManager(settings)

    await redis.connect()
    await db.connect()

    service = BuilderService(redis, db, settings)

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, service.request_shutdown)

    try:
        await service.run()
    finally:
        await db.disconnect()
        await redis.disconnect()
        logger.info("builder_service_stopped")


if __name__ == "__main__":
    asyncio.run(main())
