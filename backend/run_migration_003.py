#!/usr/bin/env python3
"""
Run 003_news.sql to create the news_articles table.
No psql required. From repo root: python3 backend/run_migration_003.py
Requires LV_DATABASE_URL in the environment (or .env in backend/).
"""
import asyncio
import os
import sys

_backend_dir = os.path.dirname(os.path.abspath(__file__))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)
os.chdir(_backend_dir)

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
        print("LV_DATABASE_URL is not set.")
        sys.exit(1)
    db = DatabaseManager(settings)
    await db.connect()
    try:
        async with db.write_session() as session:
            await session.execute(text("""
                CREATE TABLE IF NOT EXISTS news_articles (
                    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    title           VARCHAR(500)  NOT NULL,
                    summary         TEXT,
                    content_snippet TEXT,
                    source          VARCHAR(100)  NOT NULL,
                    source_url      VARCHAR(1000) NOT NULL UNIQUE,
                    image_url       VARCHAR(1000),
                    category        VARCHAR(50)  NOT NULL DEFAULT 'general',
                    sport           VARCHAR(50),
                    leagues         JSONB,
                    teams           JSONB,
                    players         JSONB,
                    published_at    TIMESTAMPTZ   NOT NULL,
                    fetched_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
                    trending_score  DOUBLE PRECISION NOT NULL DEFAULT 0,
                    is_breaking     BOOLEAN       NOT NULL DEFAULT FALSE,
                    is_active       BOOLEAN       NOT NULL DEFAULT TRUE
                )
            """))
            await session.execute(text("CREATE INDEX IF NOT EXISTS ix_news_published ON news_articles(published_at)"))
            await session.execute(text("CREATE INDEX IF NOT EXISTS ix_news_category ON news_articles(category)"))
            await session.execute(text("CREATE INDEX IF NOT EXISTS ix_news_sport ON news_articles(sport)"))
            await session.execute(text("CREATE INDEX IF NOT EXISTS ix_news_trending ON news_articles(trending_score)"))
        print("Migration 003 applied: news_articles table ready.")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
    finally:
        await db.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
