"""
Scheduler service for Live View.
Manages adaptive polling tasks for all active/live matches.
Uses leader election to ensure only one scheduler instance drives polls.
Publishes poll commands to the ingest service via Redis pub/sub.
"""
from __future__ import annotations

import asyncio
import json
import signal
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import or_, select

from shared.config import Settings, get_settings
from shared.models.enums import MatchPhase, ProviderName, Sport, Tier
from shared.models.orm import LeagueORM, MatchORM, MatchStateORM, ProviderMappingORM, SportORM
from shared.utils.database import DatabaseManager
from shared.utils.logging import get_logger, setup_logging
from shared.utils.metrics import (
    LIVE_MATCHES,
    SCHEDULER_ACTIVE_TASKS,
    start_metrics_server,
)
from shared.utils.redis_manager import RedisManager

from ingest.providers.registry import HealthScorer
from scheduler.engine.polling import AdaptivePollingEngine

logger = get_logger(__name__)

POLL_COMMAND_CHANNEL = "ingest:poll_commands"

# Phases that require active polling
ACTIVE_PHASES = [p.value for p in MatchPhase if p.is_live or p == MatchPhase.PRE_MATCH]
# Include recently finished matches for final score confirmation
RECENTLY_FINISHED_WINDOW = timedelta(minutes=15)


class MatchPollTask:
    """Represents an active polling task for a single match+tier combination."""

    def __init__(
        self,
        canonical_match_id: uuid.UUID,
        sport: Sport,
        tier: Tier,
        league_provider_id: str,
        match_provider_id: str,
        provider: ProviderName,
    ) -> None:
        self.canonical_match_id = canonical_match_id
        self.sport = sport
        self.tier = tier
        self.league_provider_id = league_provider_id
        self.match_provider_id = match_provider_id
        self.provider = provider
        self.phase: MatchPhase = MatchPhase.SCHEDULED
        self.next_poll_at: float = 0.0
        self.last_polled_at: float = 0.0
        self.consecutive_errors: int = 0
        self.task_handle: Optional[asyncio.Task[None]] = None


class SchedulerService:
    """
    Main scheduler that:
    1. Acquires leadership via Redis-based leader election
    2. Discovers active matches from the database
    3. Creates/destroys poll tasks dynamically
    4. Computes adaptive intervals per task
    5. Publishes poll commands to ingest service
    """

    def __init__(
        self,
        redis: RedisManager,
        db: DatabaseManager,
        polling_engine: AdaptivePollingEngine,
        health_scorer: HealthScorer,
        settings: Settings | None = None,
    ) -> None:
        self._redis = redis
        self._db = db
        self._polling = polling_engine
        self._health_scorer = health_scorer
        self._settings = settings or get_settings()
        self._instance_id = self._settings.instance_id or str(uuid.uuid4())[:8]
        self._tasks: dict[str, MatchPollTask] = {}  # key: f"{match_id}:{tier}"
        self._is_leader = False
        self._shutdown = asyncio.Event()

    def _task_key(self, match_id: uuid.UUID, tier: Tier) -> str:
        return f"{match_id}:{tier.value}"

    # ── Leader election ─────────────────────────────────────────────────

    async def _acquire_leadership(self) -> bool:
        """Attempt to acquire or renew scheduler leadership."""
        if self._is_leader:
            renewed = await self._redis.renew_leader(
                "scheduler", self._instance_id, self._settings.scheduler_leader_ttl_s
            )
            if not renewed:
                logger.warning("leadership_lost", instance_id=self._instance_id)
                self._is_leader = False
                await self._stop_all_tasks()
            return renewed

        acquired = await self._redis.try_acquire_leader(
            "scheduler", self._instance_id, self._settings.scheduler_leader_ttl_s
        )
        if acquired:
            self._is_leader = True
            logger.info("leadership_acquired", instance_id=self._instance_id)
        return acquired

    # ── Match discovery ─────────────────────────────────────────────────

    async def _discover_active_matches(self) -> list[dict[str, Any]]:
        """
        Query the database for matches that need active polling.
        Returns match metadata needed to create poll tasks.
        """
        now = datetime.now(timezone.utc)
        recently_finished_cutoff = now - RECENTLY_FINISHED_WINDOW

        async with self._db.read_session() as session:
            # Get all matches that are live, pre-match, or recently finished
            stmt = (
                select(
                    MatchORM.id,
                    MatchORM.phase,
                    MatchORM.start_time,
                    SportORM.sport_type,
                    LeagueORM.id.label("league_id"),
                )
                .join(LeagueORM, MatchORM.league_id == LeagueORM.id)
                .join(SportORM, LeagueORM.sport_id == SportORM.id)
                .where(
                    or_(
                        MatchORM.phase.in_(ACTIVE_PHASES),
                        # Include matches starting within next 10 minutes
                        MatchORM.start_time.between(now - timedelta(minutes=5), now + timedelta(minutes=10)),
                        # Recently finished for final confirmation
                        (MatchORM.phase == MatchPhase.FINISHED.value)
                        & (MatchORM.updated_at >= recently_finished_cutoff),
                    )
                )
            )
            result = await session.execute(stmt)
            rows = result.all()

            matches: list[dict[str, Any]] = []
            for row in rows:
                # Resolve provider IDs for primary provider
                provider_mapping_stmt = select(
                    ProviderMappingORM.provider,
                    ProviderMappingORM.provider_id,
                ).where(
                    ProviderMappingORM.entity_type == "match",
                    ProviderMappingORM.canonical_id == row.id,
                )
                mappings = (await session.execute(provider_mapping_stmt)).all()

                # Also get league provider mapping
                league_mapping_stmt = select(
                    ProviderMappingORM.provider,
                    ProviderMappingORM.provider_id,
                ).where(
                    ProviderMappingORM.entity_type == "league",
                    ProviderMappingORM.canonical_id == row.league_id,
                )
                league_mappings = (await session.execute(league_mapping_stmt)).all()

                # Build provider ID lookup
                match_pids: dict[str, str] = {m.provider: m.provider_id for m in mappings}
                league_pids: dict[str, str] = {m.provider: m.provider_id for m in league_mappings}

                matches.append({
                    "canonical_match_id": row.id,
                    "phase": row.phase,
                    "sport": row.sport_type,
                    "match_provider_ids": match_pids,
                    "league_provider_ids": league_pids,
                })

            return matches

    # ── Task management ─────────────────────────────────────────────────

    async def _reconcile_tasks(self) -> None:
        """
        Synchronize poll tasks with currently active matches.
        Creates new tasks, updates existing, removes stale.
        """
        active_matches = await self._discover_active_matches()

        active_keys: set[str] = set()
        sport_counts: dict[str, int] = {}

        for match_data in active_matches:
            match_id = match_data["canonical_match_id"]
            sport = Sport(match_data["sport"])
            phase = MatchPhase(match_data["phase"])
            match_pids = match_data["match_provider_ids"]
            league_pids = match_data["league_provider_ids"]

            sport_counts[sport.value] = sport_counts.get(sport.value, 0) + 1

            # Determine which tiers need polling
            tiers_to_poll = [Tier.SCOREBOARD]
            if phase.is_live:
                tiers_to_poll.append(Tier.EVENTS)
                tiers_to_poll.append(Tier.STATS)

            for tier in tiers_to_poll:
                key = self._task_key(match_id, tier)
                active_keys.add(key)

                if key not in self._tasks:
                    # Pick a provider mapping for this tier
                    # Use the configured cascade order
                    provider = ProviderName.ESPN  # default
                    match_pid = ""
                    league_pid = ""
                    for pname in self._settings.provider_order:
                        if pname in match_pids:
                            provider = ProviderName(pname)
                            match_pid = match_pids[pname]
                            league_pid = league_pids.get(pname, "")
                            break

                    task = MatchPollTask(
                        canonical_match_id=match_id,
                        sport=sport,
                        tier=tier,
                        league_provider_id=league_pid,
                        match_provider_id=match_pid,
                        provider=provider,
                    )
                    task.phase = phase
                    self._tasks[key] = task

                    logger.info(
                        "poll_task_created",
                        match_id=str(match_id),
                        tier=tier.value,
                        sport=sport.value,
                        phase=phase.value,
                    )
                else:
                    # Update phase
                    self._tasks[key].phase = phase

        # Remove tasks for matches no longer active
        stale_keys = set(self._tasks.keys()) - active_keys
        for key in stale_keys:
            task = self._tasks.pop(key)
            if task.task_handle and not task.task_handle.done():
                task.task_handle.cancel()
            logger.info(
                "poll_task_removed",
                match_id=str(task.canonical_match_id),
                tier=task.tier.value,
            )

        SCHEDULER_ACTIVE_TASKS.set(len(self._tasks))
        for sport_val, count in sport_counts.items():
            LIVE_MATCHES.labels(sport=sport_val).set(count)

    async def _execute_poll_cycle(self) -> None:
        """
        Execute one scheduling tick: evaluate all tasks and dispatch polls for those that are due.
        """
        now = time.monotonic()

        for key, task in list(self._tasks.items()):
            if now < task.next_poll_at:
                continue

            # Compute next interval
            health = await self._health_scorer.compute_health(task.provider)
            quota_usage = await self._redis.get_quota_usage(task.provider.value)

            # Get quota limit based on provider
            quota_limits: dict[str, int] = {
                "sportradar": self._settings.sportradar_rpm_limit,
                "espn": self._settings.espn_rpm_limit,
                "thesportsdb": self._settings.thesportsdb_rpm_limit,
            }
            quota_limit = quota_limits.get(task.provider.value, 1000)

            interval = await self._polling.compute_interval(
                match_id=str(task.canonical_match_id),
                sport=task.sport,
                phase=task.phase,
                tier=task.tier,
                provider_health_score=health.score,
                quota_usage=quota_usage,
                quota_limit=quota_limit,
            )

            task.next_poll_at = now + interval
            task.last_polled_at = now

            # Publish poll command to ingest
            command = {
                "canonical_match_id": str(task.canonical_match_id),
                "tier": task.tier.value,
                "sport": task.sport.value,
                "league_provider_id": task.league_provider_id,
                "match_provider_id": task.match_provider_id,
                "provider": task.provider.value,
                "timestamp": time.time(),
            }

            await self._redis.client.publish(
                POLL_COMMAND_CHANNEL,
                json.dumps(command),
            )

            logger.debug(
                "poll_command_dispatched",
                match_id=str(task.canonical_match_id),
                tier=task.tier.value,
                next_in=round(interval, 2),
            )

    async def _stop_all_tasks(self) -> None:
        """Cancel all active poll tasks."""
        for key, task in self._tasks.items():
            if task.task_handle and not task.task_handle.done():
                task.task_handle.cancel()
        self._tasks.clear()
        SCHEDULER_ACTIVE_TASKS.set(0)

    # ── Main loop ───────────────────────────────────────────────────────

    async def run(self) -> None:
        """
        Main scheduler loop.
        Runs leader election, match discovery, and poll dispatch in a tight loop.
        """
        reconcile_counter = 0
        reconcile_every_n = 10  # Reconcile every 10 ticks (~10s)

        while not self._shutdown.is_set():
            try:
                # Leader election
                is_leader = await self._acquire_leadership()
                if not is_leader:
                    await asyncio.sleep(self._settings.scheduler_leader_renew_s)
                    continue

                # Periodically reconcile tasks with DB
                reconcile_counter += 1
                if reconcile_counter >= reconcile_every_n:
                    await self._reconcile_tasks()
                    reconcile_counter = 0

                # Execute poll cycle
                await self._execute_poll_cycle()

                # Sleep for tick interval
                await asyncio.sleep(self._settings.scheduler_tick_interval_s)

            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("scheduler_loop_error", error=str(exc), exc_info=True)
                await asyncio.sleep(2.0)

    def request_shutdown(self) -> None:
        self._shutdown.set()


async def main() -> None:
    """Scheduler service entrypoint."""
    settings = get_settings()
    setup_logging("scheduler")
    start_metrics_server(9092)

    redis = RedisManager(settings)
    db = DatabaseManager(settings)

    await redis.connect()
    await db.connect()

    polling_engine = AdaptivePollingEngine(redis, settings)
    health_scorer = HealthScorer(redis, settings)

    service = SchedulerService(redis, db, polling_engine, health_scorer, settings)

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, service.request_shutdown)

    logger.info("scheduler_service_started", instance_id=settings.instance_id)

    try:
        await service.run()
    finally:
        await service._stop_all_tasks()
        await db.disconnect()
        await redis.disconnect()
        logger.info("scheduler_service_stopped")


if __name__ == "__main__":
    asyncio.run(main())
