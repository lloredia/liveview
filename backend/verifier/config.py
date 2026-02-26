"""
Verifier service configuration.
Uses LV_ prefix and same Redis/DB env as other services; adds verifier-specific limits.
"""
from __future__ import annotations

from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from shared.config import get_settings
from shared.utils.logging import get_logger

logger = get_logger(__name__)


class VerifierSettings(BaseSettings):
    """Verifier-specific settings; use get_settings() for Redis/DB."""

    model_config = SettingsConfigDict(
        env_prefix="LV_VERIFIER_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Intervals (seconds)
    high_demand_interval_min: float = Field(default=5.0, description="Min interval for high-demand matches")
    high_demand_interval_max: float = Field(default=10.0, description="Max interval for high-demand matches")
    low_demand_interval_min: float = Field(default=20.0, description="Min interval for low-demand matches")
    low_demand_interval_max: float = Field(default=60.0, description="Max interval for low-demand matches")
    jitter_factor: float = Field(default=0.2, description="Jitter as fraction of interval (0.2 = ±20%)")

    # Concurrency and limits
    max_concurrent_requests: int = Field(default=10, description="Max concurrent outbound HTTP requests")
    per_domain_rpm: int = Field(default=60, description="Max requests per minute per domain (token bucket)")
    per_domain_burst: int = Field(default=6, description="Burst size per domain")

    # Timeouts and retries
    fetch_timeout_s: float = Field(default=10.0, description="HTTP timeout per request")
    retry_max_attempts: int = Field(default=3, description="Max retries on transient failure")
    retry_base_delay_s: float = Field(default=1.0, description="Base delay for exponential backoff")
    backoff_on_429_s: float = Field(default=60.0, description="Extra backoff when rate limited (429)")

    # Confidence thresholds
    confidence_high: float = Field(default=0.8, description="Above this: apply correction")
    confidence_medium: float = Field(default=0.5, description="Above this: log warning, retry next cycle")
    # Below confidence_medium: flag as dispute

    # Circuit breaker
    circuit_failure_threshold: int = Field(default=5, description="Failures before opening circuit")
    circuit_recovery_s: float = Field(default=120.0, description="Seconds before half-open")

    # Redis key TTLs
    last_checked_ttl_s: int = Field(default=86400, description="TTL for verification:last_checked:{match_id}")
    dispute_ttl_s: int = Field(default=86400 * 7, description="TTL for dispute entries")

    # Metrics
    metrics_port: int = Field(default=9091, description="Port for metrics HTTP server")


def get_verifier_settings() -> VerifierSettings:
    """Load verifier settings. Call get_settings() before run if using shared Redis/DB."""
    return VerifierSettings()
