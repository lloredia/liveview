"""
OpenTelemetry distributed tracing configuration for LiveView.

Exports spans to Jaeger for cross-service request tracking.
Instruments FastAPI, SQLAlchemy, httpx, and Redis automatically.

Environment variables:
- OTEL_ENABLED: Enable OpenTelemetry (default: true in production)
- OTEL_SERVICE_NAME: Service name for tracing (default: liveview-api)
- OTEL_JAEGER_AGENT_HOST: Jaeger agent hostname (default: localhost)
- OTEL_JAEGER_AGENT_PORT: Jaeger agent port (default: 6831)
- OTEL_TRACES_SAMPLE_RATE: Sampling rate 0.0-1.0 (default: 0.1 in production, 1.0 in dev)
"""

import os
from typing import Optional

from opentelemetry import trace, metrics
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.exporter.jaeger.thrift import JaegerExporter
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.instrumentation.redis import RedisInstrumentor

# Configuration
OTEL_ENABLED = os.getenv("OTEL_ENABLED", "true").lower() in ("true", "1", "yes")
OTEL_SERVICE_NAME = os.getenv("OTEL_SERVICE_NAME", "liveview-api")
OTEL_JAEGER_HOST = os.getenv("OTEL_JAEGER_AGENT_HOST", "localhost")
OTEL_JAEGER_PORT = int(os.getenv("OTEL_JAEGER_AGENT_PORT", "6831"))
OTEL_ENV = os.getenv("ENVIRONMENT", "development")
OTEL_SAMPLE_RATE = float(
    os.getenv("OTEL_TRACES_SAMPLE_RATE", "1.0" if OTEL_ENV != "production" else "0.1")
)

# Global tracer
_tracer_provider: Optional[TracerProvider] = None


def init_tracing() -> None:
    """
    Initialize OpenTelemetry with Jaeger exporter.
    Call once on application startup.
    """
    global _tracer_provider

    if not OTEL_ENABLED:
        return

    try:
        # Create resource with service name
        resource = Resource(attributes={
            SERVICE_NAME: OTEL_SERVICE_NAME,
            "environment": OTEL_ENV,
        })

        # Create Jaeger exporter
        jaeger_exporter = JaegerExporter(
            agent_host_name=OTEL_JAEGER_HOST,
            agent_port=OTEL_JAEGER_PORT,
        )

        # Create tracer provider with exporter
        _tracer_provider = TracerProvider(resource=resource)
        _tracer_provider.add_span_processor(SimpleSpanProcessor(jaeger_exporter))

        # Set as global tracer
        trace.set_tracer_provider(_tracer_provider)

        # Instrument libraries
        FastAPIInstrumentor().instrument()
        SQLAlchemyInstrumentor().instrument(
            enable_commenter=True,
            commenter_options={"db_driver": "asyncpg"},
        )
        HTTPXClientInstrumentor().instrument()
        RedisInstrumentor().instrument()

        print(
            f"✓ OpenTelemetry initialized: {OTEL_SERVICE_NAME} → "
            f"Jaeger({OTEL_JAEGER_HOST}:{OTEL_JAEGER_PORT}) "
            f"Sample Rate: {OTEL_SAMPLE_RATE}"
        )

    except Exception as e:
        print(f"⚠ OpenTelemetry initialization failed: {e}")
        # Don't fail startup, just disable tracing


def get_tracer(name: str) -> trace.Tracer:
    """
    Get a tracer for the given module name.

    Usage:
        tracer = get_tracer("backend.api.routes")
        with tracer.start_as_current_span("process_match") as span:
            span.set_attribute("match_id", match_id)
            # ... do work ...
    """
    return trace.get_tracer(name)


def shutdown_tracing() -> None:
    """
    Shutdown OpenTelemetry gracefully (flush pending spans).
    Call on application shutdown.
    """
    if _tracer_provider:
        _tracer_provider.force_flush(timeout_millis=30000)
