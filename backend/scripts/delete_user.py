#!/usr/bin/env python3
"""
Permanently delete a user (and all associated data) by email.

Same cascade as DELETE /v1/me, but bypasses auth — for operator use only.
Run via:
    railway run python backend/scripts/delete_user.py <email>

If the user doesn't exist, exits 0 cleanly. Prints the user id deleted
plus row counts for each related table so you can audit what went away.
"""
from __future__ import annotations

import asyncio
import os
import sys

import asyncpg

EMAIL_NORM_TABLES = [
    "password_reset_tokens",
    "password_credentials",
    "auth_identities",
    "user_favorites",
    "user_tracked_games",
    "user_notification_prefs",
    "user_saved_articles",
]


def to_asyncpg_dsn(database_url: str) -> str:
    if database_url.startswith("postgresql+asyncpg://"):
        return database_url.replace("postgresql+asyncpg://", "postgresql://", 1)
    if database_url.startswith("postgres+asyncpg://"):
        return database_url.replace("postgres+asyncpg://", "postgres://", 1)
    return database_url


def resolve_database_url() -> str:
    """Find a usable Postgres URL from Railway-style env vars.

    Tries direct URL vars first, then assembles from PG*. Raises if
    nothing usable is set.
    """
    # Prefer PUBLIC_URL when running outside the Railway network (laptop /
    # CI), else fall back to internal URLs.
    for key in (
        "DATABASE_PUBLIC_URL",
        "POSTGRES_PUBLIC_URL",
        "DATABASE_URL",
        "POSTGRES_URL",
        "LV_DATABASE_URL",
        "PGURL",
    ):
        v = os.environ.get(key)
        if v:
            return v
    # Build from PG* parts
    user = os.environ.get("PGUSER") or os.environ.get("POSTGRES_USER")
    pw = os.environ.get("PGPASSWORD") or os.environ.get("POSTGRES_PASSWORD")
    host = os.environ.get("PGHOST") or os.environ.get("POSTGRES_HOST")
    port = os.environ.get("PGPORT") or os.environ.get("POSTGRES_PORT") or "5432"
    db = os.environ.get("PGDATABASE") or os.environ.get("POSTGRES_DB")
    if user and pw and host and db:
        return f"postgresql://{user}:{pw}@{host}:{port}/{db}"
    raise SystemExit(
        "No Postgres URL or PG* env vars found. If running outside the\n"
        "Postgres service, scope to it explicitly:\n"
        "  railway run --service Postgres python3 backend/scripts/delete_user.py <email>",
    )


async def delete_user(email: str) -> int:
    dsn = to_asyncpg_dsn(resolve_database_url())
    conn = await asyncpg.connect(dsn)
    try:
        async with conn.transaction():
            row = await conn.fetchrow(
                "SELECT id FROM users WHERE LOWER(email) = LOWER($1)",
                email,
            )
            if not row:
                print(f"No user with email={email}; nothing to delete.")
                return 0
            user_id = row["id"]
            print(f"Found user {user_id} for {email}. Deleting…")

            for table in EMAIL_NORM_TABLES:
                # Each table has a user_id FK to users.id
                count = await conn.execute(
                    f"DELETE FROM {table} WHERE user_id = $1",
                    user_id,
                )
                print(f"  {table}: {count}")

            count = await conn.execute(
                "DELETE FROM users WHERE id = $1",
                user_id,
            )
            print(f"  users: {count}")
            print("Done.")
            return 1
    finally:
        await conn.close()


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python delete_user.py <email>", file=sys.stderr)
        sys.exit(2)
    email = sys.argv[1].strip().lower()
    if "@" not in email:
        print(f"Not an email: {email}", file=sys.stderr)
        sys.exit(2)
    asyncio.run(delete_user(email))


if __name__ == "__main__":
    main()
