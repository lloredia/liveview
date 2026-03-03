"""Run migration 005: notification system tables."""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from shared.config import get_settings
from shared.utils.database import DatabaseManager


async def main():
    settings = get_settings()
    db = DatabaseManager(settings)
    await db.connect()

    sql = (Path(__file__).parent / "migrations" / "005_notifications.sql").read_text()

    async with db.write_session() as session:
        for statement in sql.split(";"):
            stmt = statement.strip()
            if stmt and not stmt.startswith("--") and stmt not in ("BEGIN", "COMMIT"):
                from sqlalchemy import text
                await session.execute(text(stmt))

    print("Migration 005 applied successfully.")
    await db.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
