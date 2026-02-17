"""
Central configuration for all Live View services.
Uses pydantic-settings for env-based config with validation.
"""
from __future__ import annotations

from enum import Enum
from functools import lru_cache
from typing import Optional

from pydantic import Field, PostgresDsn, RedisDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(str, Enum):
    DEV = "dev"
    STAGING = "staging"
    PRODUCTION = "production"


class ServiceRole(str, Enum):
    API = "api"
    INGEST = "ingest"
    SCHEDULER = "scheduler"
    BUILDER = "builder"


class Settings(BaseSettings):
    """Root settings shared across all services."""

    model_config = SettingsConfigDict(
        env_prefix="LV_",
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # ── General ──────────────────────────────────────────────
    environment: Environment = Environment.DEV
    service_role: ServiceRole = ServiceRole.API
    debug: bool = False
    log_level: str = "INFO"
    instance_id: str = Field(default="", description="Unique pod/container ID for distributed locking")

    # ── Postgres ─────────────────────────────────────────────
    database_url: PostgresDsn = Field(
        default="postgresql+asyncpg://liveview:liveview@postgres:5432/liveview"
    )
    db_pool_min: int = 2
    db_pool_max: int = 20
    db_command_timeout: int = 30

    # ── Redis ────────────────────────────────────────────────
    redis_url: RedisDsn = Field(default="redis://redis:6379/0")
    redis_max_connections: int = 50

    # ── API ──────────────────────────────────────────────────
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    api_workers: int = 1
    cors_origins: list[str] = ["*"]

    # ── WebSocket ────────────────────────────────────────────
    ws_heartbeat_interval_s: float = 15.0
    ws_max_subscriptions_per_conn: int = 50
    ws_replay_window_size: int = 100
    ws_presence_ttl_s: int = 60

    # ── Scheduler ────────────────────────────────────────────
    scheduler_tick_interval_s: float = 1.0
    scheduler_min_poll_interval_s: float = 1.0
    scheduler_max_poll_interval_s: float = 120.0
    scheduler_jitter_factor: float = 0.15
    scheduler_leader_ttl_s: int = 30
    scheduler_leader_renew_s: int = 10

    # ── Provider ─────────────────────────────────────────────
    provider_order: list[str] = Field(default=["sportradar", "espn", "thesportsdb"])
    provider_health_window_s: int = 300
    provider_health_threshold: float = 0.4
    provider_flap_ttl_s: int = 60
    provider_request_timeout_s: float = 10.0

    # ── Provider API keys ────────────────────────────────────
    sportradar_api_key: str = ""
    espn_api_key: str = ""
    thesportsdb_api_key: str = ""

    # ── Quota ────────────────────────────────────────────────
    sportradar_rpm_limit: int = 1000
    espn_rpm_limit: int = 600
    thesportsdb_rpm_limit: int = 300

    # ── Builder ──────────────────────────────────────────────
    builder_reconciliation_interval_s: float = 10.0
    builder_synthetic_confidence_min: float = 0.3

    # ── Observability ────────────────────────────────────────
    metrics_enabled: bool = True
    metrics_port: int = 9090

    @property
    def redis_url_str(self) -> str:
        return str(self.redis_url)

    @property
    def database_url_str(self) -> str:
        return str(self.database_url)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Singleton access to validated settings."""
    return Settings()
