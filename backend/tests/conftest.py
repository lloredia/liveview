"""
Pytest configuration and fixtures for LiveView backend tests.

Provides:
- Database fixtures (test_db, db with cleanup)
- Redis fixtures (test_redis, redis with cleanup)
- Async test support
- Session and scope management
"""
import asyncio
import os
from typing import AsyncGenerator, Generator

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from shared.config import Settings, Environment, ServiceRole
from shared.models.orm import Base
from shared.utils.database import DatabaseManager
from shared.utils.redis_manager import RedisManager


# ──────────────────────────────────────────────────────────────
# Settings
# ──────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def test_settings() -> Settings:
    """Session-scoped test settings."""
    return Settings(
        environment=Environment.DEV,
        service_role=ServiceRole.API,
        database_url=os.getenv(
            "LV_DATABASE_URL",
            "postgresql+asyncpg://liveview:liveview@localhost:5432/liveview_test"
        ),
        redis_url=os.getenv("LV_REDIS_URL", "redis://localhost:6379/0"),
        debug=True,
        log_level="DEBUG",
    )


# ──────────────────────────────────────────────────────────────
# Database Fixtures
# ──────────────────────────────────────────────────────────────

@pytest.fixture
async def db(test_settings: Settings) -> AsyncGenerator[DatabaseManager, None]:
    """
    Function-scoped database fixture with automatic cleanup.
    
    Creates a new database session for each test and drops all tables after.
    """
    db_manager = DatabaseManager(test_settings)
    await db_manager.connect()
    
    # Create all tables
    async with db_manager.engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    yield db_manager
    
    # Cleanup: drop all tables
    async with db_manager.engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    
    await db_manager.disconnect()


@pytest.fixture
async def db_session(db: DatabaseManager) -> AsyncGenerator[AsyncSession, None]:
    """
    Provides an async SQLAlchemy session bound to test database.
    """
    async with db.write_session() as session:
        yield session


# ──────────────────────────────────────────────────────────────
# Redis Fixtures
# ──────────────────────────────────────────────────────────────

@pytest.fixture
async def redis(
    test_settings: Settings,
) -> AsyncGenerator[RedisManager, None]:
    """
    Function-scoped Redis fixture with automatic cleanup.
    
    Flushes all data before test (clean state) and after test (cleanup).
    """
    redis_manager = RedisManager(test_settings)
    await redis_manager.connect()
    
    # Clean slate
    await redis_manager.client.flushdb()
    
    yield redis_manager
    
    # Cleanup
    await redis_manager.client.flushdb()
    await redis_manager.disconnect()


# ──────────────────────────────────────────────────────────────
# Async Test Support
# ──────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def event_loop():
    """
    Create an instance of the default event loop for the test session.
    Needed for async tests.
    """
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


# Configure pytest to handle async
pytest_plugins = ("pytest_asyncio",)


# ──────────────────────────────────────────────────────────────
# Markers
# ──────────────────────────────────────────────────────────────

def pytest_configure(config):
    """Register custom pytest markers."""
    config.addinivalue_line(
        "markers", "asyncio: mark test as async (pytest-asyncio)"
    )
    config.addinivalue_line(
        "markers", "integration: mark test as integration test"
    )
    config.addinivalue_line(
        "markers", "security: mark test as security test"
    )
    config.addinivalue_line(
        "markers", "migration: mark test as migration test"
    )
    config.addinivalue_line(
        "markers", "slow: mark test as slow (> 1 second)"
    )
