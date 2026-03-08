#!/usr/bin/env python3
"""
Run 007_provider_columns.sql: add provider_name, provider_id to matches.
No psql required. From repo root: python backend/run_migration_007.py
Requires LV_DATABASE_URL (or DATABASE_URL) in the environment or .env in backend/.
"""
import asyncio
import os
import sys

_backend_dir = os.path.dirname(os.path.abspath(__file__))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)
os.chdir(_backend_dir)

_url = os.environ.get("LV_DATABASE_URL") or os.environ.get("DATABASE_URL") or ""
if _url and "+asyncpg" not in _url:
    if _url.startswith("postgres://"):
        _url = "postgresql+asyncpg://" + _url[len("postgres://") :]
    elif _url.startswith("postgresql://"):
        _url = _url.replace("postgresql://", "postgresql+asyncpg://", 1)
    os.environ["LV_DATABASE_URL"] = _url

from sqlalchemy import text

from shared.config import get_settings
from shared.utils.database import DatabaseManager


async def main() -> None:
    settings = get_settings()
    if not getattr(settings, "database_url", None):
        print("LV_DATABASE_URL or DATABASE_URL is not set.")
        sys.exit(1)
    db = DatabaseManager(settings)
    await db.connect()
    try:
        async with db.write_session() as session:
            await session.execute(text("""
                ALTER TABLE matches ADD COLUMN IF NOT EXISTS provider_name VARCHAR(32) NOT NULL DEFAULT 'espn'
            """))
            await session.execute(text("""
                ALTER TABLE matches ADD COLUMN IF NOT EXISTS provider_id VARCHAR(128)
            """))
            await session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_matches_provider ON matches(provider_name, provider_id)
            """))
        print("Migration 007 applied: matches.provider_name, provider_id and index ready.")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
    finally:
        await db.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
