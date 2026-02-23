"""
RSS news aggregation for Live View.
Fetches feeds concurrently, normalizes articles, deduplicates by source_url,
categorizes, and stores in news_articles. Used by the API background task.
"""
from __future__ import annotations

import asyncio
import re
import uuid
from datetime import datetime, timedelta, timezone
from html import unescape
from typing import Any, Optional

import feedparser
import httpx
from sqlalchemy import select, text, update
from sqlalchemy.dialects.postgresql import insert

from shared.models.orm import NewsArticleORM
from shared.utils.database import DatabaseManager
from shared.utils.logging import get_logger

logger = get_logger(__name__)

NEWS_FEEDS: list[tuple[str, str]] = [
    ("ESPN", "https://www.espn.com/espn/rss/news"),
    ("ESPN Soccer", "https://www.espn.com/espn/rss/soccer/news"),
    ("ESPN NBA", "https://www.espn.com/espn/rss/nba/news"),
    ("ESPN NFL", "https://www.espn.com/espn/rss/nfl/news"),
    ("ESPN MLB", "https://www.espn.com/espn/rss/mlb/news"),
    ("ESPN NHL", "https://www.espn.com/espn/rss/nhl/news"),
    ("BBC Sport", "https://feeds.bbci.co.uk/sport/rss.xml"),
    ("BBC Football", "https://feeds.bbci.co.uk/sport/football/rss.xml"),
    ("Sky Sports", "https://www.skysports.com/rss/12040"),
    ("Sky Sports Football", "https://www.skysports.com/rss/11095"),
    ("The Guardian Football", "https://www.theguardian.com/football/rss"),
    ("The Guardian Sport", "https://www.theguardian.com/uk/sport/rss"),
    ("Bleacher Report", "https://bleacherreport.com/articles/feed"),
    ("CBS Sports", "https://www.cbssports.com/rss/headlines/"),
    ("Yahoo Sports", "https://sports.yahoo.com/rss/"),
    ("Marca", "https://e00-marca.uecdn.es/rss/en/football.xml"),
    ("Football Italia", "https://football-italia.net/feed/"),
    ("90min", "https://www.90min.com/rss"),
    ("Transfermarkt", "https://www.transfermarkt.com/rss/news"),
]

CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "transfer": [
        "transfer", "sign", "signing", "deal", "move", "loan", "fee", "bid",
        "target", "wants", "agrees",
    ],
    "trade": ["trade", "traded", "swap", "exchange", "deal"],
    "injury": [
        "injury", "injured", "hurt", "sidelined", "out for", "ACL", "hamstring",
        "ankle", "knee", "concussion", "IL", "disabled list",
    ],
    "draft": ["draft", "pick", "prospect", "combine", "selected", "lottery"],
    "result": ["win", "beat", "defeat", "draw", "loss", "score", "goals", "highlights"],
    "streak": [
        "streak", "consecutive", "unbeaten", "winning run",
        "losing streak", "form",
    ],
    "breaking": [
        "breaking", "just in", "official", "confirmed", "announced", "BREAKING",
    ],
    "rumor": ["rumor", "rumour", "reportedly", "linked", "interest", "could", "set to"],
    "club": [
        "manager", "coach", "sacked", "appointed", "contract",
        "extension", "resign",
    ],
    "analysis": [
        "analysis", "preview", "prediction", "tactical", "breakdown",
        "review", "opinion",
    ],
}

SPORT_FROM_SOURCE: dict[str, str] = {
    "ESPN Soccer": "soccer",
    "BBC Football": "soccer",
    "Sky Sports Football": "soccer",
    "The Guardian Football": "soccer",
    "Marca": "soccer",
    "Football Italia": "soccer",
    "90min": "soccer",
    "Transfermarkt": "soccer",
    "ESPN NBA": "basketball",
    "ESPN NFL": "football",
    "ESPN MLB": "baseball",
    "ESPN NHL": "hockey",
}

TAG_STRIP_RE = re.compile(r"<[^>]+>")


def _strip_html(raw: str) -> str:
    if not raw:
        return ""
    text = TAG_STRIP_RE.sub(" ", raw)
    text = unescape(text)
    return " ".join(text.split()).strip()[:2000]


def _absolute_image_url(url: str, base: str) -> str:
    """Resolve relative image URL using entry link as base."""
    if not url or url.startswith("http://") or url.startswith("https://"):
        return url
    try:
        from urllib.parse import urljoin
        return urljoin(base, url)
    except Exception:
        return url


def _extract_image(entry: Any, source: str) -> Optional[str]:
    entry_link = getattr(entry, "link", "") or ""
    raw: Optional[str] = None

    # media:content
    media = getattr(entry, "media_content", []) or []
    if media and len(media) > 0:
        m = media[0]
        if getattr(m, "get", None):
            raw = m.get("url") if callable(m.get) else getattr(m, "url", None)
        else:
            raw = getattr(m, "url", None)

    # media:thumbnail (very common in RSS)
    if not raw:
        thumb = getattr(entry, "media_thumbnail", []) or []
        if thumb and len(thumb) > 0:
            t = thumb[0]
            raw = t.get("url") if isinstance(t, dict) and t.get("url") else getattr(t, "url", None)

    # enclosure
    if not raw:
        enclosures = getattr(entry, "enclosures", []) or []
        for enc in enclosures:
            href = getattr(enc, "href", None) or (enc.get("href") if isinstance(enc, dict) else None)
            if not href or not str(href).startswith("http"):
                continue
            enc_type = (enc.get("type") or getattr(enc, "type", "") or "").lower()
            if "/image" in enc_type or href.endswith(".jpg") or href.endswith(".jpeg") or href.endswith(".png") or ".webp" in href:
                raw = href
                break

    # first img in description/summary
    if not raw:
        summary = getattr(entry, "summary", "") or getattr(entry, "description", "") or ""
        if summary:
            match = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', summary, re.I)
            if match:
                raw = match.group(1)

    if not raw or not str(raw).strip():
        return None
    raw = str(raw).strip()
    if not raw.startswith("http"):
        raw = _absolute_image_url(raw, entry_link or "https://example.com/")
    return raw if raw.startswith("http") else None


def _categorize(text_block: str) -> tuple[str, bool]:
    combined = (text_block or "").lower()
    category = "general"
    is_breaking = "breaking" in combined or "just in" in combined
    best_count = 0
    for cat, keywords in CATEGORY_KEYWORDS.items():
        if cat == "breaking":
            continue
        count = sum(1 for k in keywords if k in combined)
        if count > best_count:
            best_count = count
            category = cat
    return category, is_breaking


def _infer_sport(source: str, title: str, summary: str) -> Optional[str]:
    sport = SPORT_FROM_SOURCE.get(source)
    if sport:
        return sport
    combined = (title + " " + (summary or "")).lower()
    if "nba" in combined or "basketball" in combined or "ncaa" in combined:
        return "basketball"
    if "nfl" in combined or "football" in combined and "soccer" not in combined:
        return "football"
    if "mlb" in combined or "baseball" in combined:
        return "baseball"
    if "nhl" in combined or "hockey" in combined:
        return "hockey"
    if "soccer" in combined or "premier league" in combined or "la liga" in combined:
        return "soccer"
    return None


def _parse_published(entry: Any) -> datetime:
    published = getattr(entry, "published_parsed", None) or getattr(entry, "updated_parsed", None)
    if published:
        try:
            from time import mktime
            from datetime import datetime as dt
            return dt.fromtimestamp(mktime(published), tz=timezone.utc)
        except (TypeError, ValueError, OSError):
            pass
    return datetime.now(timezone.utc)


def _content_snippet(summary: str, max_len: int = 300) -> str:
    plain = _strip_html(summary or "")
    if len(plain) <= max_len:
        return plain
    return plain[: max_len - 3].rsplit(" ", 1)[0] + "..."


def calculate_trending_score(published_at: datetime, duplicate_count: int, is_breaking: bool) -> float:
    hours_old = (datetime.now(timezone.utc) - published_at).total_seconds() / 3600
    recency = max(0.0, 10.0 * (1 - hours_old / 24))
    source_bonus = min(duplicate_count * 2.0, 10.0)
    breaking = 5.0 if is_breaking else 0.0
    return round(recency + source_bonus + breaking, 2)


async def _fetch_feed(client: httpx.AsyncClient, source: str, url: str) -> tuple[str, list[dict[str, Any]]]:
    try:
        resp = await client.get(url, timeout=10.0)
        resp.raise_for_status()
        parsed = feedparser.parse(resp.content)
        articles = []
        for entry in getattr(parsed, "entries", []) or []:
            link = getattr(entry, "link", "") or ""
            if not link or not link.startswith("http"):
                continue
            title = _strip_html(getattr(entry, "title", "") or "")
            if not title:
                continue
            summary = getattr(entry, "summary", "") or getattr(entry, "description", "") or ""
            summary_plain = _strip_html(summary)
            category, is_breaking = _categorize(title + " " + summary_plain)
            sport = _infer_sport(source, title, summary_plain)
            image_url = _extract_image(entry, source)
            published_at = _parse_published(entry)
            content_snippet = _content_snippet(summary)
            articles.append({
                "title": title[:500],
                "summary": summary_plain[:5000] if summary_plain else None,
                "content_snippet": content_snippet or None,
                "source": source[:100],
                "source_url": link[:1000],
                "image_url": (image_url or "")[:1000] or None,
                "category": category,
                "sport": sport,
                "leagues": None,
                "teams": None,
                "players": None,
                "published_at": published_at,
                "is_breaking": is_breaking,
            })
        return source, articles
    except Exception as exc:
        logger.warning("news_feed_failed", source=source, url=url, error=str(exc))
        return source, []


async def fetch_and_store_news(db: DatabaseManager) -> None:
    sources_ok = 0
    errors = 0
    new_count = 0
    duplicate_count = 0
    by_url: dict[str, list[dict[str, Any]]] = {}

    async with httpx.AsyncClient(timeout=10.0) as client:
        tasks = [_fetch_feed(client, source, url) for source, url in NEWS_FEEDS]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    for i, result in enumerate(results):
        if isinstance(result, Exception):
            errors += 1
            logger.debug("news_feed_error", feed=NEWS_FEEDS[i][0], error=str(result))
            continue
        source, articles = result
        sources_ok += 1
        for a in articles:
            url_key = a["source_url"]
            if url_key not in by_url:
                by_url[url_key] = []
            by_url[url_key].append({**a, "source": source})

    now = datetime.now(timezone.utc)
    new_count = 0
    duplicate_count = 0

    async with db.write_session() as session:
        existing = await session.execute(
            select(NewsArticleORM.source_url).where(NewsArticleORM.is_active)
        )
        seen_urls = {row[0] for row in existing.fetchall()}

        for source_url, group in by_url.items():
            first = group[0]
            dup_count = len(group)
            score = calculate_trending_score(
                first["published_at"], dup_count - 1, first["is_breaking"]
            )
            if source_url in seen_urls:
                duplicate_count += 1
                # Backfill image_url for existing articles that don't have one
                if first.get("image_url"):
                    await session.execute(
                        update(NewsArticleORM)
                        .where(NewsArticleORM.source_url == source_url)
                        .where(NewsArticleORM.image_url.is_(None))
                        .values(image_url=first["image_url"])
                    )
                continue
            stmt = insert(NewsArticleORM).values(
                id=uuid.uuid4(),
                title=first["title"],
                summary=first["summary"],
                content_snippet=first["content_snippet"],
                source=first["source"],
                source_url=source_url,
                image_url=first["image_url"],
                category=first["category"],
                sport=first["sport"],
                leagues=first["leagues"],
                teams=first["teams"],
                players=first["players"],
                published_at=first["published_at"],
                fetched_at=now,
                trending_score=score,
                is_breaking=first["is_breaking"],
                is_active=True,
            ).on_conflict_do_nothing(index_elements=["source_url"])
            await session.execute(stmt)
            new_count += 1
            seen_urls.add(source_url)

        cutoff = now - timedelta(days=7)
        await session.execute(
            text("DELETE FROM news_articles WHERE published_at < :cutoff"),
            {"cutoff": cutoff},
        )

    logger.info(
        "news_fetch_completed",
        sources=sources_ok,
        new_articles=new_count,
        duplicates=duplicate_count,
        errors=errors,
    )
