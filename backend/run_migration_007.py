#!/usr/bin/env python3
"""
Run 007_provider_columns.sql: add provider_name, provider_id to matches.
No psql required. From repo root: python backend/run_migration_007.py
Requires DATABASE_URL or LV_DATABASE_URL in the environment or .env in backend/.
"""
import asyncio
import os
import sys

_backend_dir = os.path.dirname(os.path.abspath(__file__))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)
os.chdir(_backend_dir)

from sqlalchemy import text

from shared.config import get_settings
from shared.utils.database import DatabaseManager


async def main() -> None:
    settings = get_settings()
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
