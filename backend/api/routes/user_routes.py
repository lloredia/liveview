"""
User-scoped API: /v1/me, tracked-games, favorites, notification-prefs.
All require Authorization: Bearer <jwt> (NextAuth JWT).
"""
from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, select

from api.dependencies import get_db
from auth.deps import get_current_user_id
from auth.models import (
    UserFavoriteORM,
    UserNotificationPrefORM,
    UserORM,
    UserSavedArticleORM,
    UserTrackedGameORM,
)
from shared.utils.database import DatabaseManager
from shared.utils.logging import get_logger
from uuid import UUID

logger = get_logger(__name__)
router = APIRouter(prefix="/v1", tags=["user"])


# ── Me ────────────────────────────────────────────────────────

class MeResponse(BaseModel):
    id: str
    email: str
    name: Optional[str] = None


@router.get("/me", response_model=MeResponse)
async def get_me(
    user_id: UUID = Depends(get_current_user_id),
    db: DatabaseManager = Depends(get_db),
):
    """Return current user from JWT."""
    async with db.read_session() as session:
        user = (await session.execute(select(UserORM).where(UserORM.id == user_id))).scalar_one_or_none()
        if not user:
            raise HTTPException(404, "User not found")
        return MeResponse(id=str(user.id), email=user.email, name=user.name)


# ── Tracked games ──────────────────────────────────────────────

class UserTrackedGameResponse(BaseModel):
    game_id: str
    sport: Optional[str] = None
    league: Optional[str] = None
    notify_flags: dict
    created_at: str


class UserTrackedGameRequest(BaseModel):
    game_id: str
    sport: Optional[str] = None
    league: Optional[str] = None
    notify_flags: dict = Field(
        default_factory=lambda: {
            "score": True, "lead_change": True, "start": True,
            "halftime": False, "final": True, "ot": True, "major_events": True,
        }
    )


@router.get("/user/tracked-games", response_model=list[UserTrackedGameResponse])
async def list_tracked_games(
    user_id: UUID = Depends(get_current_user_id),
    db: DatabaseManager = Depends(get_db),
):
    async with db.read_session() as session:
        result = await session.execute(
            select(UserTrackedGameORM)
            .where(UserTrackedGameORM.user_id == user_id)
            .order_by(UserTrackedGameORM.created_at.desc())
        )
        rows = result.scalars().all()
    return [
        UserTrackedGameResponse(
            game_id=str(r.game_id),
            sport=r.sport,
            league=r.league,
            notify_flags=r.notify_flags or {},
            created_at=r.created_at.isoformat(),
        )
        for r in rows
    ]


@router.post("/user/tracked-games", response_model=UserTrackedGameResponse)
async def add_tracked_game(
    req: UserTrackedGameRequest,
    user_id: UUID = Depends(get_current_user_id),
    db: DatabaseManager = Depends(get_db),
):
    async with db.write_session() as session:
        game_uuid = UUID(req.game_id)
        existing = (
            await session.execute(
                select(UserTrackedGameORM).where(
                    UserTrackedGameORM.user_id == user_id,
                    UserTrackedGameORM.game_id == game_uuid,
                )
            )
        ).scalar_one_or_none()
        if existing:
            existing.notify_flags = req.notify_flags
            existing.sport = req.sport
            existing.league = req.league
            await session.flush()
            return UserTrackedGameResponse(
                game_id=req.game_id,
                sport=existing.sport,
                league=existing.league,
                notify_flags=existing.notify_flags,
                created_at=existing.created_at.isoformat(),
            )
        row = UserTrackedGameORM(
            user_id=user_id,
            game_id=game_uuid,
            sport=req.sport,
            league=req.league,
            notify_flags=req.notify_flags,
        )
        session.add(row)
        await session.flush()
        return UserTrackedGameResponse(
            game_id=req.game_id,
            sport=row.sport,
            league=row.league,
            notify_flags=row.notify_flags,
            created_at=row.created_at.isoformat(),
        )


@router.delete("/user/tracked-games/{game_id}")
async def remove_tracked_game(
    game_id: str,
    user_id: UUID = Depends(get_current_user_id),
    db: DatabaseManager = Depends(get_db),
):
    game_uuid = UUID(game_id)
    async with db.write_session() as session:
        await session.execute(
            delete(UserTrackedGameORM).where(
                UserTrackedGameORM.user_id == user_id,
                UserTrackedGameORM.game_id == game_uuid,
            )
        )
    return {"ok": True}


# ── Favorites ─────────────────────────────────────────────────

class FavoriteItem(BaseModel):
    favorite_type: str
    target_id: str


class FavoritesResponse(BaseModel):
    favorites: list[FavoriteItem]


class AddFavoriteRequest(BaseModel):
    favorite_type: str = Field(pattern="^(league|team)$")
    target_id: str


@router.get("/user/favorites", response_model=FavoritesResponse)
async def list_favorites(
    user_id: UUID = Depends(get_current_user_id),
    db: DatabaseManager = Depends(get_db),
):
    async with db.read_session() as session:
        result = await session.execute(
            select(UserFavoriteORM).where(UserFavoriteORM.user_id == user_id)
        )
        rows = result.scalars().all()
    return FavoritesResponse(
        favorites=[FavoriteItem(favorite_type=r.favorite_type, target_id=r.target_id) for r in rows]
    )


@router.post("/user/favorites")
async def add_favorite(
    req: AddFavoriteRequest,
    user_id: UUID = Depends(get_current_user_id),
    db: DatabaseManager = Depends(get_db),
):
    async with db.write_session() as session:
        row = UserFavoriteORM(
            user_id=user_id,
            favorite_type=req.favorite_type,
            target_id=req.target_id,
        )
        session.add(row)
        try:
            await session.flush()
        except Exception:
            pass  # duplicate ignored
    return {"ok": True}


@router.delete("/user/favorites/{favorite_type}/{target_id}")
async def remove_favorite(
    favorite_type: str,
    target_id: str,
    user_id: UUID = Depends(get_current_user_id),
    db: DatabaseManager = Depends(get_db),
):
    async with db.write_session() as session:
        await session.execute(
            delete(UserFavoriteORM).where(
                UserFavoriteORM.user_id == user_id,
                UserFavoriteORM.favorite_type == favorite_type,
                UserFavoriteORM.target_id == target_id,
            )
        )
    return {"ok": True}


# ── Notification prefs ──────────────────────────────────────────

class NotificationPrefsResponse(BaseModel):
    quiet_hours: Optional[dict] = None
    sound_enabled: bool = True


class NotificationPrefsRequest(BaseModel):
    quiet_hours: Optional[dict] = None
    sound_enabled: Optional[bool] = None


@router.get("/user/notification-prefs", response_model=NotificationPrefsResponse)
async def get_notification_prefs(
    user_id: UUID = Depends(get_current_user_id),
    db: DatabaseManager = Depends(get_db),
):
    async with db.read_session() as session:
        row = (
            await session.execute(
                select(UserNotificationPrefORM).where(
                    UserNotificationPrefORM.user_id == user_id
                )
            )
        ).scalar_one_or_none()
    if not row:
        return NotificationPrefsResponse(sound_enabled=True)
    return NotificationPrefsResponse(
        quiet_hours=row.quiet_hours,
        sound_enabled=row.sound_enabled,
    )


@router.post("/user/notification-prefs", response_model=NotificationPrefsResponse)
async def update_notification_prefs(
    req: NotificationPrefsRequest,
    user_id: UUID = Depends(get_current_user_id),
    db: DatabaseManager = Depends(get_db),
):
    async with db.write_session() as session:
        row = (
            await session.execute(
                select(UserNotificationPrefORM).where(
                    UserNotificationPrefORM.user_id == user_id
                )
            )
        ).scalar_one_or_none()
        if not row:
            row = UserNotificationPrefORM(user_id=user_id, sound_enabled=True)
            session.add(row)
            await session.flush()
        if req.quiet_hours is not None:
            row.quiet_hours = req.quiet_hours
        if req.sound_enabled is not None:
            row.sound_enabled = req.sound_enabled
        await session.flush()
        return NotificationPrefsResponse(
            quiet_hours=row.quiet_hours,
            sound_enabled=row.sound_enabled,
        )
