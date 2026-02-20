"""
Ingest service entrypoint.
Listens for poll commands from the scheduler via Redis pub/sub,
fetches data from the selected provider, normalizes, and publishes deltas.
"""
from __future__ import annotations

import asyncio
import json
import signal
import uuid
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

from shared.config import Settings, get_settings
from shared.models.enums import ProviderName, Sport, Tier
from shared.utils.database import DatabaseManager
from shared.utils.logging import get_logger, setup_logging
from shared.utils.metrics import (
    INGEST_PROCESSING,
    atrack_latency,
    start_metrics_server,
)
from shared.utils.redis_manager import RedisManager

from ingest.normalization.normalizer import NormalizationService
from ingest.providers.base import BaseProvider
from ingest.providers.espn import ESPNProvider
from ingest.providers.registry import HealthScorer, ProviderRegistry
from ingest.providers.sportradar import SportradarProvider
from ingest.providers.thesportsdb import TheSportsDBProvider

logger = get_logger(__name__)

POLL_COMMAND_CHANNEL = "ingest:poll_commands"


MAX_CONCURRENT_POLLS = 20

# Retry connection on startup (e.g. Redis/DB not ready yet in Docker)
CONNECT_RETRY_ATTEMPTS = 10
CONNECT_RETRY_BASE_DELAY_S = 2.0


async def _connect_with_retry(connect_fn, name: str) -> None:
    """Call async connect_fn(); retry with exponential backoff on failure."""
    last_exc: Exception | None = None
    for attempt in range(1, CONNECT_RETRY_ATTEMPTS + 1):
        try:
            await connect_fn()
            return
        except Exception as exc:
            last_exc = exc
            if attempt == CONNECT_RETRY_ATTEMPTS:
                raise
            delay = CONNECT_RETRY_BASE_DELAY_S * (2 ** (attempt - 1))
            logger.warning(
                "connect_retry",
                name=name,
                attempt=attempt,
                max_attempts=CONNECT_RETRY_ATTEMPTS,
                delay_s=delay,
                error=str(exc),
            )
            await asyncio.sleep(delay)
    if last_exc:
        raise last_exc




class IngestService:
    """
    Main ingest service that processes poll commands.

    Each command contains:
        match_id, tier, sport, league_provider_id, match_provider_id
    """

    def __init__(
        self,
        redis: RedisManager,
        db: DatabaseManager,
        registry: ProviderRegistry,
        normalizer: NormalizationService,
        settings: Settings | None = None,
    ) -> None:
        self._redis = redis
        self._db = db
        self._registry = registry
        self._normalizer = normalizer
        self._settings = settings or get_settings()
        self._shutdown = asyncio.Event()
        self._semaphore = asyncio.Semaphore(MAX_CONCURRENT_POLLS)

    async def process_poll_command(self, command: dict[str, Any]) -> None:
        """
        Process a single poll command from the scheduler.

        Args:
            command: Dict with match_id, tier, sport, league_provider_id,
                     match_provider_id, canonical_match_id.
        """
        async with self._semaphore:
            await self._execute_poll(command)

    async def _execute_poll(self, command: dict[str, Any]) -> None:
        canonical_match_id = uuid.UUID(command["canonical_match_id"])
        tier = Tier(command["tier"])
        sport = Sport(command["sport"])
        league_pid = command["league_provider_id"]
        match_pid = command["match_provider_id"]

        try:
            # Select provider
            provider_name, provider = await self._registry.select_provider(
                str(canonical_match_id), tier, sport
            )

            async with atrack_latency(
                INGEST_PROCESSING, provider=provider_name.value, tier=str(tier.value)
            ):
                if tier == Tier.SCOREBOARD:
                    result = await provider.fetch_scoreboard(sport, league_pid, match_pid)
                    if result.success and result.scoreboard:
                        async with self._db.session() as session:
                            await self._normalizer.normalize_scoreboard(
                                session, canonical_match_id, result.scoreboard, provider_name
                            )
                    elif not result.success:
                        logger.warning(
                            "scoreboard_fetch_failed",
                            match_id=str(canonical_match_id),
                            provider=provider_name.value,
                            error=result.error,
                        )

                elif tier == Tier.EVENTS:
                    result = await provider.fetch_events(sport, league_pid, match_pid)
                    if result.success and result.events is not None:
                        async with self._db.session() as session:
                            await self._normalizer.normalize_events(
                                session, canonical_match_id, result.events, provider_name
                            )

                elif tier == Tier.STATS:
                    result = await provider.fetch_stats(sport, league_pid, match_pid)
                    if result.success and result.stats:
                        async with self._db.session() as session:
                            await self._normalizer.normalize_stats(
                                session, canonical_match_id, result.stats, provider_name
                            )

        except Exception as exc:
            logger.error(
                "poll_command_error",
                match_id=str(canonical_match_id),
                tier=tier.value,
                error=str(exc),
                exc_info=True,
            )

    async def listen_for_commands(self) -> None:
        """Subscribe to the poll commands channel and process incoming commands."""
        pubsub = await self._redis.subscribe_channel(POLL_COMMAND_CHANNEL)
        logger.info("ingest_listening", channel=POLL_COMMAND_CHANNEL)

        try:
            while not self._shutdown.is_set():
                try:
                    message = await asyncio.wait_for(
                        pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0),
                        timeout=2.0,
                    )
                    if message and message.get("type") == "pmessage":
                        data = message.get("data", "")
                        if isinstance(data, str):
                            command = json.loads(data)
                            # Fire-and-forget with bounded concurrency
                            asyncio.create_task(self.process_poll_command(command))
                except asyncio.TimeoutError:
                    continue
                except json.JSONDecodeError as exc:
                    logger.warning("invalid_command_json", error=str(exc))
                except Exception as exc:
                    logger.error("command_listen_error", error=str(exc))
                    await asyncio.sleep(1.0)
        finally:
            await pubsub.punsubscribe(POLL_COMMAND_CHANNEL)
            await pubsub.aclose()

    def request_shutdown(self) -> None:
        self._shutdown.set()


def build_provider_registry(redis: RedisManager, settings: Settings) -> ProviderRegistry:
    """Construct the full provider registry with all configured providers."""
    providers: dict[ProviderName, BaseProvider] = {}

    if settings.sportradar_api_key:
        providers[ProviderName.SPORTRADAR] = SportradarProvider(
            redis=redis,
            api_key=settings.sportradar_api_key,
            rpm_limit=settings.sportradar_rpm_limit,
        )

    providers[ProviderName.ESPN] = ESPNProvider(
        redis=redis,
        api_key=settings.espn_api_key,
        rpm_limit=settings.espn_rpm_limit,
    )

    if settings.thesportsdb_api_key:
        providers[ProviderName.THESPORTSDB] = TheSportsDBProvider(
            redis=redis,
            api_key=settings.thesportsdb_api_key,
            rpm_limit=settings.thesportsdb_rpm_limit,
        )
    else:
        # TheSportsDB free tier always available
        providers[ProviderName.THESPORTSDB] = TheSportsDBProvider(
            redis=redis,
            rpm_limit=settings.thesportsdb_rpm_limit,
        )

    scorer = HealthScorer(redis=redis, settings=settings)
    return ProviderRegistry(
        providers=providers,
        health_scorer=scorer,
        redis=redis,
        settings=settings,
    )


async def main() -> None:
    """Ingest service entrypoint."""
    settings = get_settings()
    setup_logging("ingest")
    start_metrics_server(9091)

    redis = RedisManager(settings)
    db = DatabaseManager(settings)

    await _connect_with_retry(redis.connect, "Redis")
    await _connect_with_retry(db.connect, "Database")

    registry = build_provider_registry(redis, settings)
    # Start all provider HTTP clients
    for prov in registry.providers.values():
        await prov.start()

    normalizer = NormalizationService(redis)
    service = IngestService(redis, db, registry, normalizer, settings)

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, service.request_shutdown)
        except (ValueError, OSError, RuntimeError) as exc:
            logger.warning("signal_handler_unavailable", signal=sig, error=str(exc))

    logger.info("ingest_service_started")

    try:
        await service.listen_for_commands()
    finally:
        for prov in registry.providers.values():
            await prov.close()
        await db.disconnect()
        await redis.disconnect()
        logger.info("ingest_service_stopped")


if __name__ == "__main__":
    asyncio.run(main())
