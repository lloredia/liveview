#!/usr/bin/env python3
"""
Run all pending SQL migrations in order.
Safe to run multiple times — migrations use IF NOT EXISTS / IF EXISTS guards.
Called automatically by entrypoint.sh before starting any service.
"""
import asyncio
import os
import sys

_backend_dir = os.path.dirname(os.path.abspath(__file__))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)
os.chdir(_backend_dir)

MIGRATIONS_DIR = os.path.join(_backend_dir, "migrations")


async def main() -> None:
    from shared.config import get_settings

    config = get_settings()
    engine = config.create_async_engine()

    migration_files = sorted(
        f for f in os.listdir(MIGRATIONS_DIR) if f.endswith(".sql")
    )

    async with engine.begin() as conn:
        for filename in migration_files:
            path = os.path.join(MIGRATIONS_DIR, filename)
            with open(path) as f:
                sql = f.read()
            try:
                await conn.exec_driver_sql(sql)
                print(f"✓ {filename}")
            except Exception as exc:
                print(f"✗ {filename}: {exc}")
                raise

    await engine.dispose()
    print("All migrations applied.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as e:
        print(f"Migration failed: {e}")
        sys.exit(1)
