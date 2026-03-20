"""
Web Push delivery adapter using pywebpush + VAPID.

Environment variables:
  VAPID_PRIVATE_KEY / LV_VAPID_PRIVATE_KEY
  VAPID_PUBLIC_KEY / LV_VAPID_PUBLIC_KEY
  VAPID_CLAIM_EMAIL / LV_VAPID_CLAIM_EMAIL
"""
from __future__ import annotations

import json
import os
from typing import Any, Optional

from shared.utils.logging import get_logger

logger = get_logger(__name__)

# Lazy-loaded to avoid import errors when pywebpush is not installed
_pywebpush = None


def _get_pywebpush():
    global _pywebpush
    if _pywebpush is None:
        try:
            import pywebpush
            _pywebpush = pywebpush
        except ImportError:
            logger.error("pywebpush_not_installed", hint="pip install pywebpush")
            raise
    return _pywebpush


def _get_vapid_config() -> dict[str, str]:
    private_key = (
        os.environ.get("VAPID_PRIVATE_KEY")
        or os.environ.get("LV_VAPID_PRIVATE_KEY")
        or ""
    )
    claim_email = (
        os.environ.get("VAPID_CLAIM_EMAIL")
        or os.environ.get("LV_VAPID_CLAIM_EMAIL")
        or "mailto:admin@liveview.app"
    )
    if not private_key:
        raise RuntimeError("VAPID_PRIVATE_KEY (or LV_VAPID_PRIVATE_KEY) is not set")
    return {
        "private_key": private_key,
        "claims": {"sub": claim_email},
    }


def send_web_push(
    endpoint: str,
    p256dh: str,
    auth: str,
    payload: dict[str, Any],
) -> bool:
    """
    Send a web push notification. Returns True on success.
    Returns False if subscription is invalid (should be cleaned up).
    Raises on transient errors.
    """
    pywebpush = _get_pywebpush()
    vapid = _get_vapid_config()

    subscription_info = {
        "endpoint": endpoint,
        "keys": {
            "p256dh": p256dh,
            "auth": auth,
        },
    }

    try:
        pywebpush.webpush(
            subscription_info=subscription_info,
            data=json.dumps(payload),
            vapid_private_key=vapid["private_key"],
            vapid_claims=vapid["claims"],
            ttl=3600,
        )
        logger.debug("webpush_sent", endpoint=endpoint[:60])
        return True
    except pywebpush.WebPushException as exc:
        status_code = getattr(exc, "response", None)
        if status_code is not None:
            status_code = getattr(status_code, "status_code", None)
        if status_code in (404, 410):
            logger.info("webpush_subscription_expired", endpoint=endpoint[:60])
            return False
        logger.warning(
            "webpush_failed",
            endpoint=endpoint[:60],
            status=status_code,
            error=str(exc),
        )
        raise


def build_push_payload(
    title: str,
    body: str,
    data: Optional[dict[str, Any]] = None,
    icon: str = "/icons/icon-192.png",
    badge: str = "/icons/icon-192.png",
    tag: Optional[str] = None,
) -> dict[str, Any]:
    """Build a standardized push notification payload."""
    payload: dict[str, Any] = {
        "title": title,
        "body": body,
        "icon": icon,
        "badge": badge,
    }
    if tag:
        payload["tag"] = tag
    if data:
        payload["data"] = data
    return payload
