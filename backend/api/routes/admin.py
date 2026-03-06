"""
Admin-only routes for manual ingest triggers and operational actions.
All endpoints require X-Admin-Key header matching LV_ADMIN_KEY.
"""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from shared.config import get_settings
from shared.utils.logging import get_logger
from shared.utils.redis_manager import RedisManager

from api.dependencies import get_redis

logger = get_logger(__name__)

router = APIRouter(tags=["admin"])

# Channel the ingest service can subscribe to for manual league ingest triggers
INGEST_MANUAL_TRIGGER_CHANNEL = "ingest:manual_trigger"


def _require_admin_key(x_admin_key: str | None = Header(None, alias="X-Admin-Key")) -> str:
    """Verify X-Admin-Key header; return 403 if missing or wrong."""
    settings = get_settings()
    if not settings.admin_key:
        logger.warning("admin.ingest_trigger_skipped", reason="LV_ADMIN_KEY not set")
        raise HTTPException(status_code=403, detail="Admin key not configured")
    if not x_admin_key or x_admin_key != settings.admin_key:
        logger.warning("admin.ingest_trigger_denied", reason="invalid or missing key")
        raise HTTPException(status_code=403, detail="Invalid or missing X-Admin-Key")


@router.post(
    "/v1/admin/ingest/{league_slug}",
    include_in_schema=False,
)
async def trigger_manual_ingest(
    league_slug: str,
    request: Request,
    redis: RedisManager = Depends(get_redis),
    _: str = Depends(_require_admin_key),
) -> dict[str, Any]:
    """
    Publish a manual ingest trigger for the given league to Redis.
    The ingest service may subscribe to ingest:manual_trigger and run a league fetch when it receives this message.
    Requires X-Admin-Key header to match LV_ADMIN_KEY.
    """
    client_ip = request.client.host if request.client else ""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
    logger.info(
        "admin.ingest_trigger",
        league_slug=league_slug,
        source_ip=client_ip,
    )
    try:
        payload = json.dumps({"league_slug": league_slug})
        await redis.client.publish(INGEST_MANUAL_TRIGGER_CHANNEL, payload)
        return {
            "ok": True,
            "message": f"Trigger published for league {league_slug}",
            "channel": INGEST_MANUAL_TRIGGER_CHANNEL,
        }
    except Exception as exc:
        logger.error(
            "admin.ingest_trigger_error",
            league_slug=league_slug,
            error=str(exc),
        )
        raise HTTPException(status_code=500, detail="Failed to publish trigger") from exc
