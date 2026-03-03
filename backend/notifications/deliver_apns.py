"""
APNs (Apple Push Notification Service) delivery adapter.

Uses token-based authentication with a .p8 private key.
This is a stub implementation — wire credentials to activate.

Required environment variables:
  LV_APNS_KEY_ID         — 10-char key ID from Apple Developer
  LV_APNS_TEAM_ID        — 10-char team ID
  LV_APNS_BUNDLE_ID      — e.g. com.liveview.tracker
  LV_APNS_P8_PRIVATE_KEY — base64-encoded .p8 file contents

To generate:
  1. Apple Developer -> Keys -> Create key with APNs
  2. Download .p8 file
  3. base64 encode: base64 -i AuthKey_XXXXXXXXXX.p8
  4. Store as LV_APNS_P8_PRIVATE_KEY in Railway secrets
"""
from __future__ import annotations

import base64
import json
import os
import time
from typing import Any, Optional

from shared.utils.logging import get_logger

logger = get_logger(__name__)

# APNs endpoints
APNS_PRODUCTION = "https://api.push.apple.com"
APNS_SANDBOX = "https://api.sandbox.push.apple.com"


def _get_apns_config() -> dict[str, str]:
    key_id = os.environ.get("LV_APNS_KEY_ID", "")
    team_id = os.environ.get("LV_APNS_TEAM_ID", "")
    bundle_id = os.environ.get("LV_APNS_BUNDLE_ID", "com.liveview.tracker")
    p8_b64 = os.environ.get("LV_APNS_P8_PRIVATE_KEY", "")

    if not all([key_id, team_id, p8_b64]):
        raise RuntimeError(
            "APNs not configured. Set LV_APNS_KEY_ID, LV_APNS_TEAM_ID, "
            "LV_APNS_P8_PRIVATE_KEY in environment."
        )

    return {
        "key_id": key_id,
        "team_id": team_id,
        "bundle_id": bundle_id,
        "private_key": base64.b64decode(p8_b64).decode("utf-8"),
    }


def _is_configured() -> bool:
    return bool(
        os.environ.get("LV_APNS_KEY_ID")
        and os.environ.get("LV_APNS_TEAM_ID")
        and os.environ.get("LV_APNS_P8_PRIVATE_KEY")
    )


async def send_apns_notification(
    device_token: str,
    title: str,
    body: str,
    data: Optional[dict[str, Any]] = None,
    badge_count: int = 1,
    sound: str = "default",
    sandbox: bool = False,
) -> bool:
    """
    Send an APNs notification to a single device.
    Returns True on success, False if token is invalid (should be cleaned up).
    Raises on transient errors.

    NOTE: This requires `httpx` and `PyJWT` for token-based auth.
    Install with: pip install PyJWT cryptography
    """
    if not _is_configured():
        logger.warning("apns_not_configured", hint="Set APNs env vars to enable iOS push")
        return False

    try:
        import jwt as pyjwt
        import httpx
    except ImportError:
        logger.error("apns_dependencies_missing", hint="pip install PyJWT cryptography httpx")
        return False

    config = _get_apns_config()

    # Build JWT token for APNs
    token_payload = {
        "iss": config["team_id"],
        "iat": int(time.time()),
    }
    token = pyjwt.encode(
        token_payload,
        config["private_key"],
        algorithm="ES256",
        headers={"kid": config["key_id"]},
    )

    # Build APNs payload
    aps_payload: dict[str, Any] = {
        "aps": {
            "alert": {
                "title": title,
                "body": body,
            },
            "badge": badge_count,
            "sound": sound,
        },
    }
    if data:
        aps_payload["data"] = data

    base_url = APNS_SANDBOX if sandbox else APNS_PRODUCTION
    url = f"{base_url}/3/device/{device_token}"

    headers = {
        "authorization": f"bearer {token}",
        "apns-topic": config["bundle_id"],
        "apns-push-type": "alert",
        "apns-priority": "10",
    }

    async with httpx.AsyncClient(http2=True) as client:
        resp = await client.post(
            url,
            headers=headers,
            json=aps_payload,
            timeout=10.0,
        )

    if resp.status_code == 200:
        logger.debug("apns_sent", token=device_token[:12])
        return True

    if resp.status_code in (400, 410):
        reason = ""
        try:
            reason = resp.json().get("reason", "")
        except Exception:
            pass
        if reason in ("BadDeviceToken", "Unregistered", "ExpiredToken"):
            logger.info("apns_token_invalid", token=device_token[:12], reason=reason)
            return False

    logger.warning(
        "apns_failed",
        status=resp.status_code,
        token=device_token[:12],
        body=resp.text[:200],
    )
    return False
