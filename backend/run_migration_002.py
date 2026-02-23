#!/usr/bin/env python3
"""
Run 002_add_football_sport.sql so the Football (NFL) sport exists.
No psql required. From repo root: python3 backend/run_migration_002.py
Requires LV_DATABASE_URL in the environment (or .env in backend/).
Use Railway's *public* Postgres URL (not postgres.railway.internal).
Install deps first: pip3 install -r backend/requirements.txt (or use a venv).
"""
import asyncio
import os
import sys

# Backend dir on path so "shared" resolves (run from repo root or backend/)
_backend_dir = os.path.dirname(os.path.abspath(__file__))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)
os.chdir(_backend_dir)

# Use asyncpg (backend driver). Config only rewrites DATABASE_URL, not LV_DATABASE_URL.
_url = os.environ.get("LV_DATABASE_URL") or ""
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
    if not settings.database_url_str:
        print("LV_DATABASE_URL is not set. Set it or run from backend with .env.")
        sys.exit(1)
    db = DatabaseManager(settings)
    await db.connect()
    try:
        async with db.write_session() as session:
            await session.execute(
                text("""
                INSERT INTO sports (id, name, sport_type) VALUES
                    ('a0000000-0000-0000-0000-000000000005', 'Football', 'football')
                ON CONFLICT (name) DO NOTHING
                """)
            )
        print("Migration 002 applied: Football (NFL) sport added (or already existed).")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
    finally:
        await db.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
