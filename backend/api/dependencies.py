"""
Dependency injection for the API service.
Provides database sessions, Redis connections, and settings to route handlers.
"""
from __future__ import annotations

from functools import lru_cache
from typing import AsyncGenerator

from shared.config import Settings, get_settings
from shared.utils.database import DatabaseManager
from shared.utils.redis_manager import RedisManager

# Module-level singletons, initialized at startup
_redis: RedisManager | None = None
_db: DatabaseManager | None = None


def init_dependencies(redis: RedisManager, db: DatabaseManager) -> None:
    """Initialize module-level singletons. Called once at startup."""
    global _redis, _db
    _redis = redis
    _db = db


def get_redis() -> RedisManager:
    """FastAPI dependency: returns the shared RedisManager."""
    if _redis is None:
        raise RuntimeError("RedisManager not initialized — call init_dependencies first")
    return _redis


def get_db() -> DatabaseManager:
    """FastAPI dependency: returns the shared DatabaseManager."""
    if _db is None:
        raise RuntimeError("DatabaseManager not initialized — call init_dependencies first")
    return _db
