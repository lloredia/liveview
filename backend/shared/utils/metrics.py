"""
Lightweight metrics collection for Live View.
Wraps prometheus_client with async-safe patterns.
"""
from __future__ import annotations

import time
from contextlib import asynccontextmanager, contextmanager
from typing import AsyncIterator, Iterator

from prometheus_client import Counter, Gauge, Histogram, Info, start_http_server

from shared.config import get_settings
from shared.utils.logging import get_logger

logger = get_logger(__name__)

# ── Counters ────────────────────────────────────────────────────────────
PROVIDER_REQUESTS = Counter(
    "lv_provider_requests_total",
    "Total provider HTTP requests",
    ["provider", "sport", "tier", "status"],
)
WS_MESSAGES = Counter(
    "lv_ws_messages_total",
    "Total WebSocket messages",
    ["direction"],
)
WS_MESSAGES_SENT = Counter(
    "lv_ws_messages_sent_total",
    "Total WebSocket messages sent to clients",
    ["tier", "msg_type"],
)
WS_MESSAGES_RECEIVED = Counter(
    "lv_ws_messages_received_total",
    "Total WebSocket messages received from clients",
    ["op"],
)
FANOUT_PUBLISHES = Counter(
    "lv_fanout_publishes_total",
    "Total delta messages published to Redis pub/sub",
    ["tier"],
)
INGEST_NORMALIZATIONS = Counter(
    "lv_ingest_normalizations_total",
    "Total successful normalization operations",
    ["provider", "sport"],
)
SYNTHETIC_EVENTS = Counter(
    "lv_synthetic_events_total",
    "Total synthetic events generated",
    ["event_type"],
)

# ── Histograms ──────────────────────────────────────────────────────────
PROVIDER_LATENCY = Histogram(
    "lv_provider_latency_seconds",
    "Provider request latency in seconds",
    ["provider"],
    buckets=(0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
)
SCHEDULER_INTERVAL = Histogram(
    "lv_scheduler_interval_seconds",
    "Computed polling interval for matches",
    ["sport", "phase"],
    buckets=(1, 2, 5, 10, 15, 30, 60, 120),
)
INGEST_PROCESSING = Histogram(
    "lv_ingest_processing_seconds",
    "Time to process a single ingest cycle for a match",
    ["provider", "tier"],
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5),
)

# ── Gauges ──────────────────────────────────────────────────────────────
WS_CONNECTIONS = Gauge(
    "lv_ws_connections_active",
    "Currently active WebSocket connections",
)
WS_SUBSCRIPTIONS = Gauge(
    "lv_ws_subscriptions_active",
    "Currently active WebSocket subscriptions",
)
LIVE_MATCHES = Gauge(
    "lv_live_matches",
    "Number of currently live matches being tracked",
    ["sport"],
)
PROVIDER_HEALTH_SCORE = Gauge(
    "lv_provider_health_score",
    "Current health score for each provider",
    ["provider"],
)
MATCH_CENTER_EMPTY_RATE = Gauge(
    "lv_match_center_empty_rate",
    "Rate of match center requests returning empty data",
)
SCHEDULER_ACTIVE_TASKS = Gauge(
    "lv_scheduler_active_tasks",
    "Number of active polling tasks in the scheduler",
)
LIVE_REFRESH_ERRORS = Counter(
    "lv_live_refresh_errors_total",
    "Provider errors in API live refresh loop",
    ["provider", "league"],
)
LIVE_REFRESH_FALLBACKS = Counter(
    "lv_live_refresh_fallbacks_total",
    "Fallback provider activations in API live refresh",
    ["fallback_provider", "league"],
)
LIVE_REFRESH_UPDATES = Counter(
    "lv_live_refresh_updates_total",
    "Matches updated by API live refresh (per provider)",
    ["provider"],
)
LIVE_GAMES_DETECTED = Gauge(
    "lv_live_games_detected",
    "Number of live/active leagues detected in last refresh cycle",
)

# ── Info ────────────────────────────────────────────────────────────────
SERVICE_INFO = Info("lv_service", "Service build information")


@contextmanager
def track_latency(histogram: Histogram, **labels: str) -> Iterator[None]:
    """Context manager to track operation latency."""
    start = time.perf_counter()
    try:
        yield
    finally:
        elapsed = time.perf_counter() - start
        histogram.labels(**labels).observe(elapsed)


@asynccontextmanager
async def atrack_latency(histogram: Histogram, **labels: str) -> AsyncIterator[None]:
    """Async context manager to track operation latency."""
    start = time.perf_counter()
    try:
        yield
    finally:
        elapsed = time.perf_counter() - start
        histogram.labels(**labels).observe(elapsed)


def start_metrics_server(port: int | None = None) -> None:
    """Start the Prometheus metrics HTTP server."""
    settings = get_settings()
    if not settings.metrics_enabled:
        return
    metrics_port = port or settings.metrics_port
    try:
        start_http_server(metrics_port)
        logger.info("metrics_server_started", port=metrics_port)
    except OSError as exc:
        logger.warning("metrics_server_failed", error=str(exc), port=metrics_port)
