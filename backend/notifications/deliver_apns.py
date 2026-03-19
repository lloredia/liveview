"""
APNs (Apple Push Notification Service) delivery adapter.

Uses token-based authentication with a .p8 private key.
This is a stub implementation — wire credentials to activate.

Required environment variables:
  APNS_KEY_ID / LV_APNS_KEY_ID
  APNS_TEAM_ID / LV_APNS_TEAM_ID
  APNS_BUNDLE_ID / LV_APNS_BUNDLE_ID
  APNS_P8_PRIVATE_KEY_BASE64 / LV_APNS_P8_PRIVATE_KEY

To generate:
  1. Apple Developer -> Keys -> Create key with APNs
  2. Download .p8 file
  3. base64 encode: base64 -i AuthKey_XXXXXXXXXX.p8
  4. Store as APNS_P8_PRIVATE_KEY_BASE64 (or LV_APNS_P8_PRIVATE_KEY) in Railway secrets
"""
from __future__ import annotations

import json
import time
from typing import Any, Optional

from notifications.apns import _get_config as _get_runtime_apns_config
from notifications.apns import is_configured as _runtime_apns_is_configured
from shared.utils.logging import get_logger

logger = get_logger(__name__)

# APNs endpoints
APNS_PRODUCTION = "https://api.push.apple.com"
APNS_SANDBOX = "https://api.sandbox.push.apple.com"
def _is_configured() -> bool:
    return _runtime_apns_is_configured()


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

    config = _get_runtime_apns_config()

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

    base_url = APNS_SANDBOX if sandbox else (APNS_SANDBOX if config.get("use_sandbox") else APNS_PRODUCTION)
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
