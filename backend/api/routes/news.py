"""
News REST endpoints.

GET /v1/news — Paginated feed with optional filters
GET /v1/news/trending — Top 10 trending
GET /v1/news/breaking — Breaking news (last 6 hours)
GET /v1/news/{id} — Single article
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import String, cast, func, or_, select

from shared.models.orm import NewsArticleORM
from shared.utils.database import DatabaseManager

from api.dependencies import get_db

router = APIRouter(prefix="/v1", tags=["news"])


class NewsArticleResponse(BaseModel):
    id: str
    title: str
    summary: Optional[str]
    content_snippet: Optional[str]
    source: str
    source_url: str
    image_url: Optional[str]
    category: str
    sport: Optional[str]
    leagues: list[str]
    teams: list[str]
    published_at: str
    fetched_at: str
    trending_score: float
    is_breaking: bool

    class Config:
        from_attributes = True


class NewsListResponse(BaseModel):
    articles: list[NewsArticleResponse]
    total: int
    page: int
    pages: int
    has_next: bool


def _row_to_article(row: Any) -> NewsArticleResponse:
    leagues = row.leagues if isinstance(row.leagues, list) else (row.leagues or [])
    teams = row.teams if isinstance(row.teams, list) else (row.teams or [])
    return NewsArticleResponse(
        id=str(row.id),
        title=row.title,
        summary=row.summary,
        content_snippet=row.content_snippet,
        source=row.source,
        source_url=row.source_url,
        image_url=row.image_url,
        category=row.category,
        sport=row.sport,
        leagues=leagues,
        teams=teams,
        published_at=row.published_at.isoformat() if row.published_at else "",
        fetched_at=row.fetched_at.isoformat() if row.fetched_at else "",
        trending_score=float(row.trending_score or 0),
        is_breaking=bool(row.is_breaking),
    )


@router.get("/news", response_model=NewsListResponse)
async def get_news(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    category: Optional[str] = Query(None),
    sport: Optional[str] = Query(None),
    league: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    hours: Optional[int] = Query(None),
    db: DatabaseManager = Depends(get_db),
) -> NewsListResponse:
    """Paginated news feed with optional filters."""
    async with db.read_session() as session:
        base = select(NewsArticleORM).where(NewsArticleORM.is_active == True)
        if category:
            base = base.where(NewsArticleORM.category == category)
        if sport:
            base = base.where(NewsArticleORM.sport == sport)
        if league:
            base = base.where(
                NewsArticleORM.leagues.isnot(None),
                cast(NewsArticleORM.leagues, String).ilike(f"%{league}%"),
            )
        if q and q.strip():
            qp = f"%{q.strip()}%"
            base = base.where(
                or_(
                    NewsArticleORM.title.ilike(qp),
                    NewsArticleORM.summary.ilike(qp),
                )
            )
        if hours is not None and hours > 0:
            cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
            base = base.where(NewsArticleORM.published_at >= cutoff)

        count_stmt = select(func.count()).select_from(base.subquery())
        total = (await session.execute(count_stmt)).scalar() or 0

        stmt = base.order_by(NewsArticleORM.published_at.desc()).offset((page - 1) * limit).limit(limit)
        result = await session.execute(stmt)
        rows = result.scalars().all()

    pages = max(1, (total + limit - 1) // limit)
    articles = [_row_to_article(r) for r in rows]
    return NewsListResponse(
        articles=articles,
        total=total,
        page=page,
        pages=pages,
        has_next=page < pages,
    )


@router.get("/news/trending", response_model=list[NewsArticleResponse])
async def get_news_trending(
    db: DatabaseManager = Depends(get_db),
) -> list[NewsArticleResponse]:
    """Top 10 trending stories."""
    async with db.read_session() as session:
        stmt = (
            select(NewsArticleORM)
            .where(NewsArticleORM.is_active == True)
            .order_by(NewsArticleORM.trending_score.desc(), NewsArticleORM.published_at.desc())
            .limit(10)
        )
        result = await session.execute(stmt)
        rows = result.scalars().all()
    return [_row_to_article(r) for r in rows]


@router.get("/news/breaking", response_model=list[NewsArticleResponse])
async def get_news_breaking(
    db: DatabaseManager = Depends(get_db),
) -> list[NewsArticleResponse]:
    """Breaking news from the last 6 hours."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=6)
    async with db.read_session() as session:
        stmt = (
            select(NewsArticleORM)
            .where(
                NewsArticleORM.is_active == True,
                NewsArticleORM.is_breaking == True,
                NewsArticleORM.published_at >= cutoff,
            )
            .order_by(NewsArticleORM.published_at.desc())
        )
        result = await session.execute(stmt)
        rows = result.scalars().all()
    return [_row_to_article(r) for r in rows]


@router.get("/news/{article_id}", response_model=NewsArticleResponse)
async def get_news_article(
    article_id: UUID,
    db: DatabaseManager = Depends(get_db),
) -> NewsArticleResponse:
    """Single article by id."""
    async with db.read_session() as session:
        stmt = select(NewsArticleORM).where(
            NewsArticleORM.id == article_id,
            NewsArticleORM.is_active == True,
        )
        result = await session.execute(stmt)
        row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Article not found")
    return _row_to_article(row)
