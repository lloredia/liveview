"""
Notification dispatcher.

Orchestrates: event detection → filtering → dedupe → delivery → logging.
Called from the live_score_refresh_loop after state updates.
"""
from __future__ import annotations

import uuid
from typing import Any, Optional

from sqlalchemy import delete, select, func

from shared.utils.database import DatabaseManager
from shared.utils.logging import get_logger
from notifications.models import (
    TrackedGameORM,
    WebPushSubscriptionORM,
    IOSPushTokenORM,
    NotificationLogORM,
    NotificationInboxORM,
    DeviceORM,
)
from notifications.engine import (
    GameState,
    NotificationEvent,
    EventType,
    detect_events,
    should_rate_limit_score,
    passes_notify_flags,
    is_quiet_hours,
)
from notifications.deliver_webpush import send_web_push, build_push_payload

logger = get_logger(__name__)

# In-memory prev_state cache keyed by game_id
_prev_states: dict[str, GameState] = {}


def update_prev_state(game_id: str, state: GameState) -> Optional[GameState]:
    """Store current state and return previous state (or None if first seen)."""
    prev = _prev_states.get(game_id)
    _prev_states[game_id] = state
    return prev


async def process_game_update(
    db: DatabaseManager,
    game_id: str,
    state: GameState,
) -> int:
    """
    Process a single game state update: detect events, filter, deliver.
    Returns number of notifications sent.
    """
    prev = update_prev_state(game_id, state)
    events = detect_events(prev, state)
    if not events:
        return 0

    # Find all devices tracking this game
    async with db.read_session() as session:
        game_uuid = uuid.UUID(game_id) if isinstance(game_id, str) else game_id
        stmt = select(TrackedGameORM).where(TrackedGameORM.game_id == game_uuid)
        result = await session.execute(stmt)
        tracked = result.scalars().all()

    if not tracked:
        return 0

    sent = 0
    for tracking in tracked:
        device_id = str(tracking.device_id)
        flags = tracking.notify_flags or {}
        quiet = tracking.quiet_hours

        for event in events:
            # Filter by notify_flags
            if not passes_notify_flags(event, flags):
                continue

            # Quiet hours suppresses push but still stores inbox
            quiet_now = is_quiet_hours(quiet)

            # Rate limit score updates
            if event.event_type == EventType.SCORE_UPDATE:
                is_clutch = event.priority.value == "high"
                if should_rate_limit_score(device_id, game_id, is_clutch):
                    continue

            # Dedupe via notification_log
            already_sent = await _check_dedupe(db, device_id, event.event_hash)
            if already_sent:
                continue

            # Store in inbox (always, even during quiet hours)
            await _store_inbox(db, device_id, event)

            # Deliver push (unless quiet hours)
            if not quiet_now:
                delivered = await _deliver_to_device(db, device_id, event)
                if delivered:
                    sent += 1

    return sent


async def _check_dedupe(db: DatabaseManager, device_id: str, event_hash: str) -> bool:
    """Return True if this event was already sent to this device."""
    async with db.read_session() as session:
        stmt = select(NotificationLogORM.id).where(
            NotificationLogORM.device_id == uuid.UUID(device_id),
            NotificationLogORM.event_hash == event_hash,
        ).limit(1)
        result = await session.execute(stmt)
        return result.scalar_one_or_none() is not None


async def _store_inbox(db: DatabaseManager, device_id: str, event: NotificationEvent) -> None:
    """Store a notification event in the in-app inbox."""
    async with db.write_session() as session:
        session.add(NotificationInboxORM(
            device_id=uuid.UUID(device_id),
            game_id=uuid.UUID(event.game_id),
            event_type=event.event_type.value,
            title=event.title,
            body=event.body,
            data=event.data,
        ))


async def _deliver_to_device(
    db: DatabaseManager,
    device_id: str,
    event: NotificationEvent,
) -> bool:
    """Deliver push notification to a device's subscriptions. Returns True if any delivery succeeded."""
    delivered = False
    device_uuid = uuid.UUID(device_id)
    game_uuid = uuid.UUID(event.game_id)

    # Web push
    async with db.read_session() as session:
        stmt = select(WebPushSubscriptionORM).where(
            WebPushSubscriptionORM.device_id == device_uuid
        )
        result = await session.execute(stmt)
        subs = result.scalars().all()

    payload = build_push_payload(
        title=event.title,
        body=event.body,
        data=event.data,
        tag=f"lv-{event.game_id}-{event.event_type.value}",
    )

    expired_endpoints: list[str] = []
    for sub in subs:
        try:
            ok = send_web_push(sub.endpoint, sub.p256dh, sub.auth, payload)
            if ok:
                delivered = True
                await _log_delivery(db, device_id, event, "web_push")
            else:
                expired_endpoints.append(sub.endpoint)
        except Exception as exc:
            logger.warning("webpush_delivery_error", device=device_id[:8], error=str(exc))

    # Clean up expired web push subscriptions
    if expired_endpoints:
        async with db.write_session() as session:
            for ep in expired_endpoints:
                stmt = select(WebPushSubscriptionORM).where(
                    WebPushSubscriptionORM.endpoint == ep
                )
                result = await session.execute(stmt)
                sub = result.scalar_one_or_none()
                if sub:
                    await session.delete(sub)

    # iOS APNs (notifications.apns with APNS_* env; invalid tokens removed)
    async with db.read_session() as session:
        stmt = select(IOSPushTokenORM).where(
            IOSPushTokenORM.device_id == device_uuid
        )
        result = await session.execute(stmt)
        tokens = result.scalars().all()

    if tokens:
        try:
            from notifications.apns import send_apns_notification
            invalid_token_ids: list[uuid.UUID] = []
            for token_obj in tokens:
                ok = await send_apns_notification(
                    device_token=token_obj.apns_token,
                    title=event.title,
                    body=event.body,
                    data=event.data,
                )
                if ok:
                    delivered = True
                    await _log_delivery(db, device_id, event, "apns")
                else:
                    invalid_token_ids.append(token_obj.id)
            if invalid_token_ids:
                async with db.write_session() as session:
                    await session.execute(
                        delete(IOSPushTokenORM).where(
                            IOSPushTokenORM.id.in_(invalid_token_ids)
                        )
                    )
        except Exception as exc:
            logger.warning("apns_delivery_error", device=device_id[:8], error=str(exc))

    return delivered


async def _log_delivery(
    db: DatabaseManager,
    device_id: str,
    event: NotificationEvent,
    via: str,
) -> None:
    """Record delivery in notification_log for deduplication."""
    async with db.write_session() as session:
        session.add(NotificationLogORM(
            device_id=uuid.UUID(device_id),
            game_id=uuid.UUID(event.game_id),
            event_type=event.event_type.value,
            event_hash=event.event_hash,
            delivered_via=via,
        ))
