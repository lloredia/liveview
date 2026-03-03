"""
API routes for the notification subsystem.
Handles device registration, game tracking, push subscriptions, and inbox.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select, update

from api.dependencies import get_db
from notifications.models import (
    DeviceORM,
    IOSPushTokenORM,
    NotificationInboxORM,
    NotificationLogORM,
    TrackedGameORM,
    WebPushSubscriptionORM,
)
from shared.utils.database import DatabaseManager
from shared.utils.logging import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/v1", tags=["notifications"])


# ── Request / Response schemas ────────────────────────────────────

class DeviceRegisterRequest(BaseModel):
    platform: str = Field(pattern="^(web|ios)$")
    device_id: Optional[str] = None
    user_agent: Optional[str] = None

class DeviceRegisterResponse(BaseModel):
    device_id: str

class TrackedGameRequest(BaseModel):
    device_id: str
    game_id: str
    sport: Optional[str] = None
    league: Optional[str] = None
    notify_flags: dict = Field(default_factory=lambda: {
        "score": True, "lead_change": True, "start": True,
        "halftime": False, "final": True, "ot": True, "major_events": True,
    })

class TrackedGameResponse(BaseModel):
    device_id: str
    game_id: str
    sport: Optional[str] = None
    league: Optional[str] = None
    notify_flags: dict
    created_at: str

class WebPushSubscribeRequest(BaseModel):
    device_id: str
    endpoint: str
    keys: dict  # { p256dh, auth }
    user_agent: Optional[str] = None

class WebPushUnsubscribeRequest(BaseModel):
    device_id: str
    endpoint: str

class IOSTokenRegisterRequest(BaseModel):
    device_id: str
    apns_token: str
    bundle_id: str = "com.liveview.tracker"

class MarkReadRequest(BaseModel):
    device_id: str
    notification_ids: Optional[list[str]] = None
    mark_all: bool = False

class InboxItemResponse(BaseModel):
    id: str
    game_id: str
    event_type: str
    title: str
    body: str
    data: dict
    is_read: bool
    created_at: str

class InboxResponse(BaseModel):
    items: list[InboxItemResponse]
    unread_count: int
    cursor: Optional[str] = None


# ── Device registration ───────────────────────────────────────────

@router.post("/devices/register", response_model=DeviceRegisterResponse)
async def register_device(
    req: DeviceRegisterRequest,
    db: DatabaseManager = Depends(get_db),
):
    """Register or re-register a device. Returns a stable device_id."""
    async with db.write_session() as session:
        if req.device_id:
            try:
                did = uuid.UUID(req.device_id)
            except ValueError:
                raise HTTPException(400, "Invalid device_id format")
            existing = (await session.execute(
                select(DeviceORM).where(DeviceORM.device_id == did)
            )).scalar_one_or_none()
            if existing:
                existing.last_seen_at = datetime.now(timezone.utc)
                if req.user_agent:
                    existing.user_agent = req.user_agent
                return DeviceRegisterResponse(device_id=str(existing.device_id))

        device = DeviceORM(
            platform=req.platform,
            user_agent=req.user_agent,
        )
        session.add(device)
        await session.flush()
        return DeviceRegisterResponse(device_id=str(device.device_id))


# ── Tracked games ─────────────────────────────────────────────────

@router.post("/tracked-games", response_model=TrackedGameResponse)
async def track_game(
    req: TrackedGameRequest,
    db: DatabaseManager = Depends(get_db),
):
    """Add or update game tracking for a device."""
    async with db.write_session() as session:
        device_uuid = uuid.UUID(req.device_id)
        game_uuid = uuid.UUID(req.game_id)

        existing = (await session.execute(
            select(TrackedGameORM).where(
                TrackedGameORM.device_id == device_uuid,
                TrackedGameORM.game_id == game_uuid,
            )
        )).scalar_one_or_none()

        if existing:
            existing.notify_flags = req.notify_flags
            existing.sport = req.sport
            existing.league = req.league
            await session.flush()
            return TrackedGameResponse(
                device_id=req.device_id,
                game_id=req.game_id,
                sport=existing.sport,
                league=existing.league,
                notify_flags=existing.notify_flags,
                created_at=existing.created_at.isoformat(),
            )

        tracked = TrackedGameORM(
            device_id=device_uuid,
            game_id=game_uuid,
            sport=req.sport,
            league=req.league,
            notify_flags=req.notify_flags,
        )
        session.add(tracked)
        await session.flush()
        return TrackedGameResponse(
            device_id=req.device_id,
            game_id=req.game_id,
            sport=tracked.sport,
            league=tracked.league,
            notify_flags=tracked.notify_flags,
            created_at=tracked.created_at.isoformat(),
        )


@router.delete("/tracked-games/{game_id}")
async def untrack_game(
    game_id: str,
    device_id: str = Query(...),
    db: DatabaseManager = Depends(get_db),
):
    """Remove game tracking for a device."""
    async with db.write_session() as session:
        stmt = delete(TrackedGameORM).where(
            TrackedGameORM.device_id == uuid.UUID(device_id),
            TrackedGameORM.game_id == uuid.UUID(game_id),
        )
        await session.execute(stmt)
    return {"ok": True}


@router.get("/tracked-games", response_model=list[TrackedGameResponse])
async def list_tracked_games(
    device_id: str = Query(...),
    db: DatabaseManager = Depends(get_db),
):
    """List all tracked games for a device."""
    async with db.read_session() as session:
        stmt = select(TrackedGameORM).where(
            TrackedGameORM.device_id == uuid.UUID(device_id)
        ).order_by(TrackedGameORM.created_at.desc())
        result = await session.execute(stmt)
        rows = result.scalars().all()
    return [
        TrackedGameResponse(
            device_id=str(r.device_id),
            game_id=str(r.game_id),
            sport=r.sport,
            league=r.league,
            notify_flags=r.notify_flags,
            created_at=r.created_at.isoformat(),
        )
        for r in rows
    ]


# ── Web push subscription ────────────────────────────────────────

@router.post("/notifications/webpush/subscribe")
async def webpush_subscribe(
    req: WebPushSubscribeRequest,
    db: DatabaseManager = Depends(get_db),
):
    """Store a web push subscription for a device."""
    async with db.write_session() as session:
        device_uuid = uuid.UUID(req.device_id)
        existing = (await session.execute(
            select(WebPushSubscriptionORM).where(
                WebPushSubscriptionORM.endpoint == req.endpoint
            )
        )).scalar_one_or_none()

        if existing:
            existing.device_id = device_uuid
            existing.p256dh = req.keys.get("p256dh", existing.p256dh)
            existing.auth = req.keys.get("auth", existing.auth)
            existing.user_agent = req.user_agent or existing.user_agent
            existing.updated_at = datetime.now(timezone.utc)
        else:
            session.add(WebPushSubscriptionORM(
                device_id=device_uuid,
                endpoint=req.endpoint,
                p256dh=req.keys["p256dh"],
                auth=req.keys["auth"],
                user_agent=req.user_agent,
            ))
    return {"ok": True}


@router.delete("/notifications/webpush/unsubscribe")
async def webpush_unsubscribe(
    req: WebPushUnsubscribeRequest,
    db: DatabaseManager = Depends(get_db),
):
    """Remove a web push subscription."""
    async with db.write_session() as session:
        stmt = delete(WebPushSubscriptionORM).where(
            WebPushSubscriptionORM.device_id == uuid.UUID(req.device_id),
            WebPushSubscriptionORM.endpoint == req.endpoint,
        )
        await session.execute(stmt)
    return {"ok": True}


# ── iOS APNs token ────────────────────────────────────────────────

@router.post("/notifications/ios/register-token")
async def ios_register_token(
    req: IOSTokenRegisterRequest,
    db: DatabaseManager = Depends(get_db),
):
    """Register an APNs device token."""
    async with db.write_session() as session:
        device_uuid = uuid.UUID(req.device_id)
        existing = (await session.execute(
            select(IOSPushTokenORM).where(
                IOSPushTokenORM.apns_token == req.apns_token
            )
        )).scalar_one_or_none()

        if existing:
            existing.device_id = device_uuid
            existing.bundle_id = req.bundle_id
            existing.updated_at = datetime.now(timezone.utc)
        else:
            session.add(IOSPushTokenORM(
                device_id=device_uuid,
                apns_token=req.apns_token,
                bundle_id=req.bundle_id,
            ))
    return {"ok": True}


# ── Notification inbox ────────────────────────────────────────────

@router.get("/notifications/inbox", response_model=InboxResponse)
async def get_inbox(
    device_id: str = Query(...),
    limit: int = Query(default=30, le=100),
    cursor: Optional[str] = Query(default=None),
    db: DatabaseManager = Depends(get_db),
):
    """Get notification inbox items for a device."""
    async with db.read_session() as session:
        device_uuid = uuid.UUID(device_id)

        stmt = (
            select(NotificationInboxORM)
            .where(NotificationInboxORM.device_id == device_uuid)
            .order_by(NotificationInboxORM.created_at.desc())
            .limit(limit)
        )
        if cursor:
            stmt = stmt.where(
                NotificationInboxORM.created_at < datetime.fromisoformat(cursor)
            )
        result = await session.execute(stmt)
        rows = result.scalars().all()

        unread_stmt = select(func.count()).where(
            NotificationInboxORM.device_id == device_uuid,
            NotificationInboxORM.is_read == False,
        )
        unread_count = (await session.execute(unread_stmt)).scalar() or 0

    items = [
        InboxItemResponse(
            id=str(r.id),
            game_id=str(r.game_id),
            event_type=r.event_type,
            title=r.title,
            body=r.body,
            data=r.data or {},
            is_read=r.is_read,
            created_at=r.created_at.isoformat(),
        )
        for r in rows
    ]

    next_cursor = items[-1].created_at if items else None
    return InboxResponse(items=items, unread_count=unread_count, cursor=next_cursor)


@router.post("/notifications/mark-read")
async def mark_read(
    req: MarkReadRequest,
    db: DatabaseManager = Depends(get_db),
):
    """Mark notifications as read."""
    async with db.write_session() as session:
        device_uuid = uuid.UUID(req.device_id)
        if req.mark_all:
            stmt = (
                update(NotificationInboxORM)
                .where(
                    NotificationInboxORM.device_id == device_uuid,
                    NotificationInboxORM.is_read == False,
                )
                .values(is_read=True)
            )
        elif req.notification_ids:
            ids = [uuid.UUID(nid) for nid in req.notification_ids]
            stmt = (
                update(NotificationInboxORM)
                .where(
                    NotificationInboxORM.device_id == device_uuid,
                    NotificationInboxORM.id.in_(ids),
                )
                .values(is_read=True)
            )
        else:
            return {"ok": True, "updated": 0}
        result = await session.execute(stmt)
    return {"ok": True, "updated": result.rowcount}
