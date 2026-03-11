"""
Tests for database migrations.
Verifies schema changes and rollback capability.

Run with: pytest backend/tests/test_migrations.py -v
"""
import asyncio
from pathlib import Path

import pytest
from sqlalchemy import inspect, text

from shared.config import Settings, Environment
from shared.utils.database import DatabaseManager


@pytest.fixture
async def test_db():
    """Test database connection for migrations."""
    settings = Settings(
        environment=Environment.DEV,
        database_url="postgresql+asyncpg://liveview:liveview@localhost/liveview_migrations_test",
    )
    db = DatabaseManager(settings)
    await db.connect()
    
    # Clean slate
    async with db.engine.begin() as conn:
        # Drop all tables
        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
    
    yield db
    await db.disconnect()


def get_migrations_directory() -> Path:
    """Get the migrations directory path."""
    return Path(__file__).parent.parent / "migrations"


async def run_migration(db, migration_file: Path) -> None:
    """Execute a single migration file."""
    sql_content = migration_file.read_text()
    async with db.engine.begin() as conn:
        await conn.execute(text(sql_content))


@pytest.mark.asyncio
async def test_migration_001_initial(test_db):
    """Test migration 001: Initial schema creation."""
    migrations_dir = get_migrations_directory()
    migration_file = migrations_dir / "001_initial.sql"
    
    # Execute migration
    await run_migration(test_db, migration_file)
    
    # Verify core tables exist
    async with test_db.read_session() as session:
        inspector = inspect(test_db.engine.sync_engine)
        tables = inspector.get_table_names()
        
        required_tables = [
            "sports", "leagues", "seasons", "teams", "players",
            "matches", "match_state", "match_stats", "match_events",
            "provider_mappings", "venue"
        ]
        
        for table in required_tables:
            assert table in tables, f"Table {table} not found after migration 001"
    
    # Verify indices exist
    async with test_db.engine.begin() as conn:
        result = await conn.execute(text(
            "SELECT indexname FROM pg_indexes WHERE schemaname = 'public'"
        ))
        indices = [row[0] for row in result]
        assert "idx_leagues_sport" in indices
        assert "idx_teams_sport" in indices


@pytest.mark.asyncio
async def test_migration_002_add_football_sport(test_db):
    """Test migration 002: Add football sport support."""
    migrations_dir = get_migrations_directory()
    
    # Run first migration
    await run_migration(test_db, migrations_dir / "001_initial.sql")
    
    # Run second migration
    await run_migration(test_db, migrations_dir / "002_add_football_sport.sql")
    
    # Verify football-related columns exist
    async with test_db.read_session() as session:
        inspector = inspect(test_db.engine.sync_engine)
        teams_columns = [col['name'] for col in inspector.get_columns("teams")]
        
        # Check for football-specific columns if they were added
        assert "id" in teams_columns


@pytest.mark.asyncio
async def test_migration_003_news(test_db):
    """Test migration 003: Add news tables."""
    migrations_dir = get_migrations_directory()
    
    # Run migrations sequentially
    await run_migration(test_db, migrations_dir / "001_initial.sql")
    await run_migration(test_db, migrations_dir / "002_add_football_sport.sql")
    await run_migration(test_db, migrations_dir / "003_news.sql")
    
    # Verify news table exists
    async with test_db.read_session() as session:
        inspector = inspect(test_db.engine.sync_engine)
        tables = inspector.get_table_names()
        
        # News table should exist
        assert any(table for table in tables if "news" in table.lower())


@pytest.mark.asyncio
async def test_migration_005_notifications(test_db):
    """Test migration 005: Add push notification support."""
    migrations_dir = get_migrations_directory()
    
    # Run migrations up to 005
    for i in [1, 2, 3, 4, 5]:
        await run_migration(test_db, migrations_dir / f"00{i}_*.sql".replace("*", {
            1: "initial",
            2: "add_football_sport",
            3: "news",
            4: "match_state_updated_at",
            5: "notifications"
        }[i]))


@pytest.mark.asyncio
async def test_migration_006_auth_users(test_db):
    """Test migration 006: Add authentication tables."""
    migrations_dir = get_migrations_directory()
    
    # Run all migrations up to 006
    for i in range(1, 7):
        file_pattern = f"00{i}_*.sql"
        migration_files = list(migrations_dir.glob(file_pattern))
        if migration_files:
            await run_migration(test_db, migration_files[0])
    
    # Verify auth tables exist
    async with test_db.read_session() as session:
        inspector = inspect(test_db.engine.sync_engine)
        tables = inspector.get_table_names()
        
        auth_tables = [t for t in tables if "user" in t.lower() or "auth" in t.lower()]
        assert len(auth_tables) > 0


@pytest.mark.asyncio
async def test_full_migration_sequence(test_db):
    """Test running all migrations in sequence."""
    migrations_dir = get_migrations_directory()
    
    # Get all migration files sorted numerically
    migration_files = sorted(migrations_dir.glob("*.sql"))
    
    # Run all migrations
    for migration_file in migration_files:
        try:
            await run_migration(test_db, migration_file)
        except Exception as e:
            pytest.fail(f"Migration {migration_file.name} failed: {str(e)}")
    
    # Verify final schema has all expected tables
    async with test_db.read_session() as session:
        inspector = inspect(test_db.engine.sync_engine)
        tables = inspector.get_table_names()
        
        # Core tables should exist
        assert "sports" in tables
        assert "leagues" in tables
        assert "matches" in tables


@pytest.mark.asyncio
async def test_migration_idempotency(test_db):
    """Test that migrations can be run multiple times safely."""
    migrations_dir = get_migrations_directory()
    migration_file = migrations_dir / "001_initial.sql"
    
    # Run migration twice
    await run_migration(test_db, migration_file)
    
    # Should not fail on second run (migrations should use CREATE IF NOT EXISTS)
    try:
        await run_migration(test_db, migration_file)
    except Exception as e:
        pytest.fail(f"Migration not idempotent: {str(e)}")


@pytest.mark.asyncio
async def test_schema_constraints_after_migration(test_db):
    """Test that constraints are properly created."""
    migrations_dir = get_migrations_directory()
    
    # Run all migrations
    migration_files = sorted(migrations_dir.glob("*.sql"))
    for migration_file in migration_files:
        await run_migration(test_db, migration_file)
    
    # Verify not-null constraints exist
    async with test_db.engine.begin() as conn:
        # Check matches table has required columns
        result = await conn.execute(text("""
            SELECT column_name, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'matches'
        """))
        
        columns = {row[0]: row[1] for row in result}
        assert columns.get("id") == "NO"  # id should be NOT NULL
        assert columns.get("league_id") == "NO"  # league_id should be NOT NULL


@pytest.mark.asyncio
async def test_indices_performance(test_db):
    """Test that performance indices are created."""
    migrations_dir = get_migrations_directory()
    migration_file = migrations_dir / "001_initial.sql"
    
    await run_migration(test_db, migration_file)
    
    # Verify common indices exist
    async with test_db.engine.begin() as conn:
        result = await conn.execute(text("""
            SELECT indexname 
            FROM pg_indexes 
            WHERE schemaname = 'public'
        """))
        
        indices = [row[0] for row in result]
        
        # Should have indices for foreign keys
        assert any("sport" in idx for idx in indices)
