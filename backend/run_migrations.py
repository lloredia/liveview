#!/usr/bin/env python3
"""
Run all pending SQL migrations in order.
Safe to run multiple times - migrations are tracked in schema_migrations.
Called automatically by entrypoint.sh before starting any service.
"""
import asyncio
import os
import sys

import asyncpg

_backend_dir = os.path.dirname(os.path.abspath(__file__))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)
os.chdir(_backend_dir)

MIGRATIONS_DIR = os.path.join(_backend_dir, "migrations")

MIGRATION_PRESENCE_CHECKS = {
    "001_initial.sql": """
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name IN ('sports', 'leagues', 'matches', 'match_state')
            GROUP BY table_schema
            HAVING COUNT(*) = 4
        )
    """,
    "002_add_football_sport.sql": """
        SELECT EXISTS (
            SELECT 1 FROM sports WHERE sport_type = 'football'
        )
    """,
    "003_news.sql": """
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'news_articles'
        )
    """,
    "004_match_state_updated_at.sql": """
        SELECT EXISTS (
            SELECT 1
            FROM pg_indexes
            WHERE schemaname = 'public' AND indexname = 'idx_match_state_updated_at'
        )
    """,
    "005_notifications.sql": """
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'notification_inbox'
        )
    """,
    "006_auth_users.sql": """
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'users'
        )
    """,
    "007_provider_columns.sql": """
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'matches'
              AND column_name = 'provider_name'
        )
    """,
    "008_soft_deletes.sql": """
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'matches'
              AND column_name = 'deleted_at'
        )
    """,
}


def to_asyncpg_dsn(database_url: str) -> str:
    if database_url.startswith("postgresql+asyncpg://"):
        return database_url.replace("postgresql+asyncpg://", "postgresql://", 1)
    if database_url.startswith("postgres+asyncpg://"):
        return database_url.replace("postgres+asyncpg://", "postgres://", 1)
    return database_url


async def ensure_migration_table(conn: asyncpg.Connection) -> None:
    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            filename TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )


async def is_recorded(conn: asyncpg.Connection, filename: str) -> bool:
    return bool(
        await conn.fetchval(
            "SELECT 1 FROM schema_migrations WHERE filename = $1",
            filename,
        )
    )


async def mark_applied(conn: asyncpg.Connection, filename: str) -> None:
    await conn.execute(
        """
        INSERT INTO schema_migrations (filename)
        VALUES ($1)
        ON CONFLICT (filename) DO NOTHING
        """,
        filename,
    )


async def is_already_present(conn: asyncpg.Connection, filename: str) -> bool:
    query = MIGRATION_PRESENCE_CHECKS.get(filename)
    if not query:
        return False
    return bool(await conn.fetchval(query))


async def main() -> None:
    from shared.config import get_settings

    config = get_settings()
    conn = await asyncpg.connect(
        to_asyncpg_dsn(config.database_url_str),
        timeout=config.db_command_timeout,
        command_timeout=config.db_command_timeout,
    )

    try:
        await ensure_migration_table(conn)

        migration_files = sorted(
            f for f in os.listdir(MIGRATIONS_DIR) if f.endswith(".sql")
        )

        for filename in migration_files:
            if await is_recorded(conn, filename):
                print(f"[skip] {filename} already recorded")
                continue

            if await is_already_present(conn, filename):
                await mark_applied(conn, filename)
                print(f"[skip] {filename} already present in database")
                continue

            path = os.path.join(MIGRATIONS_DIR, filename)
            with open(path, encoding="utf-8") as f:
                sql = f.read()

            try:
                async with conn.transaction():
                    await conn.execute(sql)
                    await mark_applied(conn, filename)
                print(f"[ok] {filename}")
            except Exception as exc:
                print(f"[error] {filename}: {exc}")
                raise

        print("All migrations applied.")
    finally:
        await conn.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as e:
        print(f"Migration failed: {e}")
        sys.exit(1)
