"""
Central configuration for all Live View services.
Uses pydantic-settings for env-based config with validation.
"""
from __future__ import annotations

import os
from enum import Enum
from functools import lru_cache
from typing import Optional
from urllib.parse import urlparse

from pydantic import Field, PostgresDsn, RedisDsn, model_validator
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


DEFAULT_DATABASE_URL = "postgresql+asyncpg://liveview:liveview@postgres:5432/liveview"
DEFAULT_REDIS_URL = "redis://redis:6379/0"


def _normalize_postgres_url(raw: str) -> str:
    if raw.startswith("postgres://"):
        return "postgresql+asyncpg://" + raw[len("postgres://") :]
    if raw.startswith("postgresql://") and "+asyncpg" not in raw:
        return raw.replace("postgresql://", "postgresql+asyncpg://", 1)
    return raw


def resolve_database_url_from_env(
    *,
    lv_database_url: Optional[str] = None,
    database_url: Optional[str] = None,
    postgres_url: Optional[str] = None,
    environment: Optional[str] = None,
) -> str:
    """Choose the runtime Postgres URL deterministically across local and platform env vars."""
    raw_lv = lv_database_url if lv_database_url is not None else os.environ.get("LV_DATABASE_URL")
    raw_primary = database_url if database_url is not None else os.environ.get("DATABASE_URL")
    raw_fallback = postgres_url if postgres_url is not None else os.environ.get("POSTGRES_URL")
    env_name = (environment if environment is not None else os.environ.get("LV_ENV", "")).lower()

    normalized_lv = _normalize_postgres_url(raw_lv) if raw_lv else ""
    normalized_primary = _normalize_postgres_url(raw_primary) if raw_primary else ""
    normalized_fallback = _normalize_postgres_url(raw_fallback) if raw_fallback else ""

    if normalized_lv and normalized_lv != DEFAULT_DATABASE_URL:
        return normalized_lv

    if env_name in {"production", "prod"}:
        return normalized_primary or normalized_fallback or normalized_lv or DEFAULT_DATABASE_URL

    return normalized_primary or normalized_fallback or DEFAULT_DATABASE_URL


def resolve_redis_url_from_env(
    *,
    lv_redis_url: Optional[str] = None,
    redis_url: Optional[str] = None,
    environment: Optional[str] = None,
) -> str:
    """Choose the runtime Redis URL deterministically across local and platform env vars."""
    raw_lv = lv_redis_url if lv_redis_url is not None else os.environ.get("LV_REDIS_URL")
    raw_primary = redis_url if redis_url is not None else os.environ.get("REDIS_URL")
    env_name = (environment if environment is not None else os.environ.get("LV_ENV", "")).lower()

    if raw_lv and raw_lv != DEFAULT_REDIS_URL:
        return raw_lv

    if env_name in {"production", "prod"}:
        return raw_primary or raw_lv or DEFAULT_REDIS_URL

    return raw_primary or DEFAULT_REDIS_URL


class Settings(BaseSettings):
    """Root settings shared across all services."""

    model_config = SettingsConfigDict(
        env_prefix="LV_",
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",  # ignore extra .env vars (e.g. POSTGRES_HOST, LOG_FORMAT) not on Settings
    )

    # ── General ──────────────────────────────────────────────
    environment: Environment = Environment.DEV
    service_role: ServiceRole = ServiceRole.API
    debug: bool = False
    log_level: str = "INFO"
    instance_id: str = Field(default="", description="Unique pod/container ID for distributed locking")

    # ── Postgres ─────────────────────────────────────────────
    database_url: PostgresDsn = Field(default=DEFAULT_DATABASE_URL)
    db_pool_min: int = 2

    @model_validator(mode="after")
    def use_database_url_fallback(self) -> "Settings":
        """Resolve DATABASE_URL consistently across LV_ and platform-provided env vars."""
        resolved = resolve_database_url_from_env(environment=self.environment.value)
        if str(self.database_url) == resolved:
            return self
        try:
            self.database_url = PostgresDsn(resolved)
        except Exception:
            pass
        return self

    @model_validator(mode="after")
    def normalize_database_url_asyncpg(self) -> "Settings":
        """Ensure database_url uses asyncpg driver (backend uses asyncpg, not psycopg2)."""
        raw = str(self.database_url)
        if "+asyncpg" in raw:
            return self
        if raw.startswith("postgres://"):
            raw = "postgresql+asyncpg://" + raw[len("postgres://") :]
        elif raw.startswith("postgresql://"):
            raw = raw.replace("postgresql://", "postgresql+asyncpg://", 1)
        else:
            return self
        try:
            self.database_url = PostgresDsn(raw)
        except Exception:
            pass
        return self

    db_pool_max: int = 20
    db_command_timeout: int = 30

    # ── Redis ────────────────────────────────────────────────
    redis_url: RedisDsn = Field(default=DEFAULT_REDIS_URL)
    redis_max_connections: int = 50

    @model_validator(mode="after")
    def use_redis_url_fallback(self) -> "Settings":
        """Resolve REDIS_URL consistently across LV_ and platform-provided env vars."""
        resolved = resolve_redis_url_from_env(environment=self.environment.value)
        if str(self.redis_url) == resolved:
            return self
        try:
            self.redis_url = RedisDsn(resolved)
        except Exception:
            pass
        return self

    # ── API ──────────────────────────────────────────────────
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    api_workers: int = 1
    cors_origins: list[str] = ["*"]
    admin_key: str = Field(
        default="",
        description="Secret for POST /v1/admin/ingest/{league_slug}. Required in X-Admin-Key header. Empty = endpoint disabled.",
    )

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
    provider_order: list[str] = Field(
        default=["sportradar", "espn", "football_data", "thesportsdb"],
        description="Provider cascade for ingest; first available per match is used.",
    )
    provider_health_window_s: int = 300
    provider_health_threshold: float = 0.4
    provider_flap_ttl_s: int = 60
    provider_request_timeout_s: float = 10.0

    # ── Provider API keys ────────────────────────────────────
    sportradar_api_key: str = ""
    espn_api_key: str = ""
    thesportsdb_api_key: str = ""
    football_data_api_key: str = ""

    # ── Quota ────────────────────────────────────────────────
    sportradar_rpm_limit: int = 1000
    espn_rpm_limit: int = 600
    thesportsdb_rpm_limit: int = 300
    football_data_rpm_limit: int = 60

    # ── Builder ──────────────────────────────────────────────
    builder_reconciliation_interval_s: float = 10.0
    builder_synthetic_confidence_min: float = 0.3

    # ── Phase sync (fallback only; ingest owns status) ─────────────────────
    phase_sync_fallback_hours: int = Field(
        default=5,
        description="Matches with phase live/scheduled and start_time older than this many hours are set to finished (fallback only).",
    )
    postgame_recheck_minutes: int = Field(
        default=180,
        description="Minutes after a match finishes during which the backend continues rechecking final state and score.",
    )

    # ── Cache TTL (today / scoreboard) ────────────────────────────────────
    cache_ttl_live_seconds: int = Field(
        default=10,
        description="Redis cache TTL in seconds when any match is live or in break.",
    )

    # ── News ──────────────────────────────────────────────────
    news_fetch_interval_s: int = Field(
        default=300,
        description="Interval in seconds between RSS news fetch runs (default 5 min).",
    )

    # ── Feature flags ────────────────────────────────────────
    espn_live_refresh_enabled: bool = True
    live_refresh_use_fallback: bool = True

    # ── Observability ────────────────────────────────────────
    metrics_enabled: bool = True
    metrics_port: int = 9090

    @property
    def redis_url_str(self) -> str:
        return str(self.redis_url)

    @property
    def database_url_str(self) -> str:
        return str(self.database_url)

    @property
    def database_url_safe_log(self) -> str:
        """URL with password redacted, for logging only."""
        try:
            u = urlparse(str(self.database_url))
            netloc = f"{u.username or '?'}@***" + (f":{u.port}" if u.port else "")
            path = u.path or "/?"
            return f"{u.scheme}://{netloc}{path}"
        except Exception:
            return "postgresql+asyncpg://***"

    @model_validator(mode="after")
    def validate_critical_secrets_in_production(self) -> "Settings":
        """Ensure critical secrets are set in production."""
        if self.environment == Environment.PRODUCTION:
            if not self.database_url or str(self.database_url).startswith("postgresql+asyncpg://liveview:liveview@postgres"):
                raise ValueError("DATABASE_URL must be set and point to prod database in production")
            if not self.redis_url or str(self.redis_url).startswith("redis://redis:6379"):
                raise ValueError("REDIS_URL must be set and point to prod Redis in production")
            # Note: AUTH_JWT_SECRET is checked in auth.deps.ensure_jwt_secret()
        return self


class SportRadarSettings(BaseSettings):
    """SportRadar provider configuration. Instantiate in app lifespan only."""

    model_config = SettingsConfigDict(
        env_prefix="LV_SPORTRADAR_",
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    api_key: str = ""
    access_level: str = Field(default="trial", description="trial or production")
    daily_limit: int = Field(default=1000, description="Daily request quota")
    include_raw: bool = Field(default=False, description="Include raw API response in ProviderMatch")
    cb_threshold: int = Field(default=5, description="Circuit breaker failure threshold")
    cb_recovery_s: float = Field(default=60.0, description="Circuit breaker recovery timeout seconds")

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key and str(self.api_key).strip())


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Singleton access to validated settings."""
    return Settings()
