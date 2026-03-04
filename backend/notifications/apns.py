"""
APNs (Apple Push Notification Service) sender using token-based auth (.p8).

Environment variables:
  APNS_TEAM_ID                 — Apple Team ID (Membership)
  APNS_KEY_ID                  — 10-char key ID from Apple Developer Keys
  APNS_BUNDLE_ID               — e.g. com.liveview.tracker (must match App ID)
  APNS_P8_PRIVATE_KEY_BASE64   — base64-encoded .p8 file contents
  APNS_USE_SANDBOX             — true for TestFlight/development, false for production
"""
from __future__ import annotations

import base64
import os
import time
from typing import Any, Optional

from shared.utils.logging import get_logger

logger = get_logger(__name__)

APNS_PRODUCTION = "https://api.push.apple.com"
APNS_SANDBOX = "https://api.sandbox.push.apple.com"


def _get_config() -> dict[str, Any]:
    # Prefer APNS_* ; fall back to LV_* for backward compatibility
    team_id = (
        os.environ.get("APNS_TEAM_ID", "").strip()
        or os.environ.get("LV_APNS_TEAM_ID", "").strip()
    )
    key_id = (
        os.environ.get("APNS_KEY_ID", "").strip()
        or os.environ.get("LV_APNS_KEY_ID", "").strip()
    )
    bundle_id = (
        os.environ.get("APNS_BUNDLE_ID", "").strip()
        or os.environ.get("LV_APNS_BUNDLE_ID", "com.liveview.tracker").strip()
        or "com.liveview.tracker"
    )
    p8_b64 = (
        os.environ.get("APNS_P8_PRIVATE_KEY_BASE64", "").strip()
        or os.environ.get("LV_APNS_P8_PRIVATE_KEY", "").strip()
    )
    use_sandbox_raw = (
        os.environ.get("APNS_USE_SANDBOX", "").strip().lower()
        or os.environ.get("LV_APNS_USE_SANDBOX", "true").strip().lower()
    )
    use_sandbox = use_sandbox_raw in ("1", "true", "yes")

    if not all([team_id, key_id, p8_b64]):
        raise RuntimeError(
            "APNs not configured. Set APNS_TEAM_ID, APNS_KEY_ID, APNS_P8_PRIVATE_KEY_BASE64 "
            "(or LV_APNS_* equivalents)."
        )

    try:
        private_key = base64.b64decode(p8_b64).decode("utf-8")
    except Exception as e:
        raise RuntimeError(f"APNS_P8_PRIVATE_KEY_BASE64 is invalid base64: {e}") from e

    return {
        "team_id": team_id,
        "key_id": key_id,
        "bundle_id": bundle_id,
        "private_key": private_key,
        "use_sandbox": use_sandbox,
    }


def is_configured() -> bool:
    return bool(
        (os.environ.get("APNS_TEAM_ID") or os.environ.get("LV_APNS_TEAM_ID"))
        and (os.environ.get("APNS_KEY_ID") or os.environ.get("LV_APNS_KEY_ID"))
        and (
            os.environ.get("APNS_P8_PRIVATE_KEY_BASE64")
            or os.environ.get("LV_APNS_P8_PRIVATE_KEY")
        )
    )


def _build_jwt(team_id: str, key_id: str, private_key: str) -> str:
    try:
        import jwt as pyjwt
    except ImportError:
        raise RuntimeError("PyJWT required for APNs. pip install PyJWT cryptography")

    payload = {
        "iss": team_id,
        "iat": int(time.time()),
    }
    return pyjwt.encode(
        payload,
        private_key,
        algorithm="ES256",
        headers={"kid": key_id},
    )


async def send_apns_notification(
    device_token: str,
    title: str,
    body: str,
    data: Optional[dict[str, Any]] = None,
    *,
    badge_count: int = 1,
    sound: str = "default",
) -> bool:
    """
    Send an APNs notification to a single device.

    Payload includes title, body, and custom data (url, gameId) for deep linking.
    Returns True on success.
    Returns False if token is invalid (BadDeviceToken, Unregistered, ExpiredToken) — caller should remove token.
    Raises on transient/configuration errors.
    """
    if not is_configured():
        logger.warning("apns_not_configured", hint="Set APNS_* env vars to enable iOS push")
        return False

    try:
        import httpx
    except ImportError:
        logger.error("apns_dependencies_missing", hint="pip install httpx")
        return False

    config = _get_config()
    token = _build_jwt(config["team_id"], config["key_id"], config["private_key"])

    # APNs payload: aps (alert, badge, sound) + data dict for Capacitor deep link
    aps_payload: dict[str, Any] = {
        "aps": {
            "alert": {"title": title, "body": body},
            "badge": badge_count,
            "sound": sound,
        },
    }
    if data:
        url = data.get("url") or (f'/match/{data.get("game_id", "")}' if data.get("game_id") else None)
        game_id = data.get("game_id")
        if url or game_id is not None:
            aps_payload["data"] = {"url": url, "gameId": str(game_id) if game_id else ""}
        for k, v in data.items():
            if v is not None and k not in ("aps", "data"):
                aps_payload[k] = v

    base_url = APNS_SANDBOX if config["use_sandbox"] else APNS_PRODUCTION
    url = f"{base_url}/3/device/{device_token}"

    headers = {
        "authorization": f"bearer {token}",
        "apns-topic": config["bundle_id"],
        "apns-push-type": "alert",
        "apns-priority": "10",
    }

    try:
        async with httpx.AsyncClient(http2=True) as client:
            resp = await client.post(
                url,
                headers=headers,
                json=aps_payload,
                timeout=10.0,
            )
    except Exception as exc:
        logger.warning("apns_request_error", token=device_token[:12], error=str(exc))
        raise

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
        body=(resp.text or "")[:200],
    )
    return False
