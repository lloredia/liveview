"""
Async PostgreSQL connection manager using SQLAlchemy 2.0+ async engine.
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator, Optional

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from shared.config import Settings, get_settings
from shared.utils.logging import get_logger

logger = get_logger(__name__)


class DatabaseManager:
    """Manages async SQLAlchemy engine and session factory."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._engine: Optional[AsyncEngine] = None
        self._session_factory: Optional[async_sessionmaker[AsyncSession]] = None

    async def connect(self) -> None:
        """Create the async engine and session factory."""
        self._engine = create_async_engine(
            self._settings.database_url_str,
            pool_size=self._settings.db_pool_min,
            max_overflow=self._settings.db_pool_max - self._settings.db_pool_min,
            pool_pre_ping=True,
            pool_recycle=300,
            echo=self._settings.debug,
            connect_args={
                "timeout": self._settings.db_command_timeout,
                "command_timeout": self._settings.db_command_timeout,
            },
        )
        self._session_factory = async_sessionmaker(
            bind=self._engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )
        logger.info("database_connected", url=str(self._settings.database_url))

    async def disconnect(self) -> None:
        """Dispose of the engine and all connections."""
        if self._engine:
            await self._engine.dispose()
            logger.info("database_disconnected")

    @property
    def engine(self) -> AsyncEngine:
        if self._engine is None:
            raise RuntimeError("DatabaseManager not connected.")
        return self._engine

    @asynccontextmanager
    async def read_session(self) -> AsyncIterator[AsyncSession]:
        """Provide a read-only session (no commit)."""
        if self._session_factory is None:
            raise RuntimeError("DatabaseManager not connected.")
        async with self._session_factory() as session:
            yield session

    @asynccontextmanager
    async def write_session(self) -> AsyncIterator[AsyncSession]:
        """Provide a transactional session that auto-commits on success."""
        if self._session_factory is None:
            raise RuntimeError("DatabaseManager not connected.")
        async with self._session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    # Alias: session() behaves identically to write_session()
    session = write_session
