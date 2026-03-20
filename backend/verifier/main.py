"""
Verifier service entrypoint.
Runs continuous match verification loop with asyncio; degrades gracefully on source failure.
"""
from __future__ import annotations

import asyncio
import signal
import sys
from pathlib import Path

# Ensure backend root is on path when run as python -m verifier.main
_backend = Path(__file__).resolve().parent.parent
if str(_backend) not in sys.path:
    sys.path.insert(0, str(_backend))

from shared.config import get_settings
from shared.utils.database import DatabaseManager
from shared.utils.health_server import start_health_server
from shared.utils.logging import get_logger, setup_logging
from shared.utils.redis_manager import RedisManager

from verifier.config import get_verifier_settings
from verifier.engine import ContinuousMatchVerificationEngine, run_verification_loop
from verifier.metrics import metrics_http_server

logger = get_logger(__name__)
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


async def main() -> None:
    setup_logging("verifier")
    start_health_server("verifier")
    settings = get_settings()
    verifier_settings = get_verifier_settings()

    db = DatabaseManager(settings)
    redis = RedisManager(settings)

    try:
        await _connect_with_retry(db.connect, "Database")
        await _connect_with_retry(redis.connect, "Redis")
    except Exception as e:
        logger.exception("startup_connect_failed", error=str(e))
        raise

    engine = ContinuousMatchVerificationEngine(db, redis, verifier_settings)
    high = (verifier_settings.high_demand_interval_min, verifier_settings.high_demand_interval_max)
    low = (verifier_settings.low_demand_interval_min, verifier_settings.low_demand_interval_max)
    loop_task = asyncio.create_task(
        run_verification_loop(engine, high, low, verifier_settings.jitter_factor)
    )
    metrics_task = asyncio.create_task(metrics_http_server(verifier_settings.metrics_port))

    shutdown = asyncio.Event()

    def on_signal() -> None:
        shutdown.set()

    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            asyncio.get_running_loop().add_signal_handler(sig, on_signal)
        except (NotImplementedError, ValueError, OSError, RuntimeError) as exc:
            logger.warning("signal_handler_unavailable", signal=sig, error=str(exc))

    logger.info("verifier_started")
    await shutdown.wait()

    loop_task.cancel()
    try:
        await loop_task
    except asyncio.CancelledError:
        pass
    metrics_task.cancel()
    try:
        await metrics_task
    except asyncio.CancelledError:
        pass

    await redis.disconnect()
    await db.disconnect()
    logger.info("verifier_stopped")


if __name__ == "__main__":
    asyncio.run(main())
