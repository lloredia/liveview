"""
SQLAlchemy slow query monitoring with Prometheus metrics.

Instruments the SQLAlchemy engine to log queries that exceed the
slow_query_threshold_ms and emit a Prometheus counter.
"""
from __future__ import annotations

import time
import logging
from typing import Any

logger = logging.getLogger(__name__)

try:
    from prometheus_client import Counter, Histogram
    _PROMETHEUS_AVAILABLE = True
    _slow_query_counter = Counter(
        "db_slow_queries_total",
        "Total number of slow database queries",
        ["threshold_ms"],
    )
    _query_duration_histogram = Histogram(
        "db_query_duration_seconds",
        "Database query duration in seconds",
        buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
    )
except ImportError:
    _PROMETHEUS_AVAILABLE = False


def init_query_monitoring(engine: Any, slow_query_threshold_ms: int = 500) -> None:
    """
    Attach SQLAlchemy event listeners to log slow queries and emit metrics.

    Args:
        engine: SQLAlchemy (async) engine instance.
        slow_query_threshold_ms: Queries taking longer than this (ms) are logged as warnings.
    """
    try:
        from sqlalchemy import event

        @event.listens_for(engine.sync_engine, "before_cursor_execute")
        def before_cursor_execute(conn: Any, cursor: Any, statement: Any,
                                   parameters: Any, context: Any, executemany: Any) -> None:
            conn.info.setdefault("query_start_time", []).append(time.perf_counter())

        @event.listens_for(engine.sync_engine, "after_cursor_execute")
        def after_cursor_execute(conn: Any, cursor: Any, statement: Any,
                                  parameters: Any, context: Any, executemany: Any) -> None:
            start = conn.info["query_start_time"].pop(-1)
            elapsed_ms = (time.perf_counter() - start) * 1000

            if _PROMETHEUS_AVAILABLE:
                _query_duration_histogram.observe(elapsed_ms / 1000)

            if elapsed_ms >= slow_query_threshold_ms:
                if _PROMETHEUS_AVAILABLE:
                    _slow_query_counter.labels(threshold_ms=str(slow_query_threshold_ms)).inc()
                logger.warning(
                    "slow_query_detected",
                    extra={
                        "elapsed_ms": round(elapsed_ms, 2),
                        "threshold_ms": slow_query_threshold_ms,
                        "statement": statement[:200],
                    },
                )

        logger.info(
            "query_monitoring_initialized",
            extra={"slow_query_threshold_ms": slow_query_threshold_ms},
        )
    except Exception as exc:
        logger.warning("query_monitoring_init_failed", extra={"error": str(exc)})
