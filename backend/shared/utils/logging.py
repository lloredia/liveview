"""
Structured JSON logging for all Live View services.
Uses structlog for context-rich, machine-parseable logs.
"""
from __future__ import annotations

import logging
import sys
from typing import Any

import structlog
from shared.config import get_settings


def setup_logging(service_name: str, extra_context: dict[str, Any] | None = None) -> None:
    """
    Configure structured logging for a service.

    Args:
        service_name: The service identifier (api, ingest, scheduler, builder).
        extra_context: Additional static context fields bound to every log entry.
    """
    settings = get_settings()
    log_level = getattr(logging, settings.log_level.upper(), logging.INFO)

    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
    ]

    if settings.environment.value == "dev":
        renderer: structlog.types.Processor = structlog.dev.ConsoleRenderer(colors=True)
    else:
        renderer = structlog.processors.JSONRenderer()

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
        foreign_pre_chain=shared_processors,
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(log_level)

    # Silence noisy libraries
    for noisy in ("uvicorn.access", "httpx", "httpcore", "asyncio"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    # Bind static service context
    structlog.contextvars.clear_contextvars()
    bound: dict[str, Any] = {"service": service_name, "instance_id": settings.instance_id}
    if extra_context:
        bound.update(extra_context)
    structlog.contextvars.bind_contextvars(**bound)


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    """Get a named structured logger."""
    return structlog.get_logger(name)
