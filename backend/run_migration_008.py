#!/usr/bin/env python3
"""
Run 008_soft_deletes.sql to add soft delete support for data recovery and audit trail.
No psql required. From repo root: python3 backend/run_migration_008.py

Soft deletes add a deleted_at column to:
- sports, leagues, seasons, teams, players, matches

This allows data recovery and GDPR-compliant deletion without losing historical data.

Requires LV_DATABASE_URL in the environment (or .env in backend/).
Use Railway's public Postgres URL (not postgres.railway.internal).
Install deps first: pip3 install -r backend/requirements.txt (or use a venv).
"""
import asyncio
import os
import sys

import asyncpg

# Backend dir on path so "shared" resolves (run from repo root or backend/)
_backend_dir = os.path.dirname(os.path.abspath(__file__))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)
os.chdir(_backend_dir)

from shared.config import get_settings


def to_asyncpg_dsn(database_url: str) -> str:
    if database_url.startswith("postgresql+asyncpg://"):
        return database_url.replace("postgresql+asyncpg://", "postgresql://", 1)
    if database_url.startswith("postgres+asyncpg://"):
        return database_url.replace("postgres+asyncpg://", "postgres://", 1)
    return database_url


async def main() -> None:
    config = get_settings()
    conn = await asyncpg.connect(
        to_asyncpg_dsn(config.database_url_str),
        timeout=config.db_command_timeout,
        command_timeout=config.db_command_timeout,
    )
    try:
        migrations_file = os.path.join(_backend_dir, "migrations/008_soft_deletes.sql")
        with open(migrations_file, encoding="utf-8") as f:
            sql = f.read()
        await conn.execute(sql)
        print("[ok] Migration 008_soft_deletes.sql applied successfully!")
        print("  - Added deleted_at columns to: sports, leagues, seasons, teams, players, matches")
        print("  - Created soft_delete_entity() and restore_entity() helper functions")
        print("  - Added indices for efficient soft-delete queries")
    finally:
        await conn.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as e:
        print(f"[error] Migration failed: {e}")
        sys.exit(1)
