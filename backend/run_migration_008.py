#!/usr/bin/env python3
"""
Run 008_soft_deletes.sql to add soft delete support for data recovery and audit trail.
No psql required. From repo root: python3 backend/run_migration_008.py

Soft deletes add a deleted_at column to:
- sports, leagues, seasons, teams, players, matches

This allows data recovery and GDPR-compliant deletion without losing historical data.

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

from shared.config import get_settings


async def main():
    config = get_settings()
    engine = config.create_async_engine()
    async with engine.begin() as conn:
        migrations_file = os.path.join(_backend_dir, "migrations/008_soft_deletes.sql")
        with open(migrations_file) as f:
            sql = f.read()
        await conn.exec_driver_sql(sql)
        print("✓ Migration 008_soft_deletes.sql applied successfully!")
        print("  - Added deleted_at columns to: sports, leagues, seasons, teams, players, matches")
        print("  - Created soft_delete_entity() and restore_entity() helper functions")
        print("  - Added indices for efficient soft-delete queries")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as e:
        print(f"✗ Migration failed: {e}")
        sys.exit(1)
