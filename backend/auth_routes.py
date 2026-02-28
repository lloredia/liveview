"""
Authentication & user management routes for LiveView.
Drop this file into the API container and import from main.
"""

import os
import hashlib
import hmac
import json
import time
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel, EmailStr, Field

logger = logging.getLogger("liveview.auth")

router = APIRouter(prefix="/v1/auth", tags=["auth"])
favorites_router = APIRouter(prefix="/v1/user", tags=["user"])

# ── Config ────────────────────────────────────────────────────────────
# Prefer LV_ prefix for consistency with rest of backend (see shared/config.py).

JWT_DEFAULT_DEV = "liveview-dev-secret-change-in-production"
JWT_SECRET = os.getenv("LV_JWT_SECRET") or os.getenv("JWT_SECRET") or JWT_DEFAULT_DEV


def _is_production() -> bool:
    return os.getenv("LV_ENV", "").lower() in ("production", "prod")


JWT_EXPIRY = 60 * 60 * 24 * 30  # 30 days


# ── Models ────────────────────────────────────────────────────────────

class SignupRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    username: str = Field(..., min_length=2, max_length=50, pattern=r"^[a-zA-Z0-9_]+$")
    password: str = Field(..., min_length=6, max_length=128)


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    token: str
    user: dict


class FavoriteRequest(BaseModel):
    favorite_type: str = Field(..., pattern=r"^(league|team)$")
    target_id: str = Field(..., min_length=1, max_length=255)


class PreferencesRequest(BaseModel):
    daily_digest: Optional[bool] = None
    digest_email: Optional[str] = None
    digest_hour: Optional[int] = Field(None, ge=0, le=23)
    timezone: Optional[str] = None


# ── Password Hashing ─────────────────────────────────────────────────

def hash_password(password: str) -> str:
    """Hash password with PBKDF2-SHA256, 100k iterations."""
    salt = os.urandom(32)
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)
    return f"{salt.hex()}:{key.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """Verify password against stored hash."""
    try:
        salt_hex, key_hex = stored.split(":")
        salt = bytes.fromhex(salt_hex)
        key = bytes.fromhex(key_hex)
        new_key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)
        return hmac.compare_digest(key, new_key)
    except Exception:
        return False


# ── JWT Tokens ───────────────────────────────────────────────────────

def create_token(user_id: str, email: str) -> str:
    """Create a simple HMAC-based JWT-like token."""
    if _is_production() and (not JWT_SECRET or JWT_SECRET == JWT_DEFAULT_DEV):
        raise RuntimeError("JWT_SECRET must be set explicitly in production (LV_ENV=production)")
    payload = {
        "sub": user_id,
        "email": email,
        "iat": int(time.time()),
        "exp": int(time.time()) + JWT_EXPIRY,
    }
    payload_b64 = _b64_encode(json.dumps(payload))
    header_b64 = _b64_encode(json.dumps({"alg": "HS256", "typ": "JWT"}))
    signing_input = f"{header_b64}.{payload_b64}"
    signature = hmac.new(JWT_SECRET.encode(), signing_input.encode(), hashlib.sha256).hexdigest()
    return f"{signing_input}.{signature}"


def decode_token(token: str) -> Optional[dict]:
    """Decode and verify token. Returns payload or None."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None

        signing_input = f"{parts[0]}.{parts[1]}"
        expected_sig = hmac.new(JWT_SECRET.encode(), signing_input.encode(), hashlib.sha256).hexdigest()

        if not hmac.compare_digest(expected_sig, parts[2]):
            return None

        payload = json.loads(_b64_decode(parts[1]))

        if payload.get("exp", 0) < time.time():
            return None

        return payload
    except Exception:
        return None


def _b64_encode(data: str) -> str:
    import base64
    return base64.urlsafe_b64encode(data.encode()).rstrip(b"=").decode()


def _b64_decode(data: str) -> str:
    import base64
    padding = 4 - len(data) % 4
    if padding != 4:
        data += "=" * padding
    return base64.urlsafe_b64decode(data).decode()


# ── Database dependency ──────────────────────────────────────────────

_pool: Optional[asyncpg.Pool] = None


def _get_database_url() -> str:
    """Database URL for asyncpg (no +asyncpg driver suffix). Prefers LV_DATABASE_URL."""
    raw = os.getenv("LV_DATABASE_URL") or os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL") or "postgresql://liveview:liveview@postgres:5432/liveview"
    if "+asyncpg" in raw:
        raw = raw.replace("postgresql+asyncpg://", "postgresql://", 1)
    elif raw.startswith("postgres://"):
        raw = "postgresql://" + raw[11:]
    return raw


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        database_url = _get_database_url()
        _pool = await asyncpg.create_pool(database_url, min_size=2, max_size=10)
    return _pool


async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    """Extract and validate user from Authorization header."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = authorization[7:]
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return payload


# ── Auth Routes ──────────────────────────────────────────────────────

@router.post("/signup", response_model=AuthResponse)
async def signup(req: SignupRequest):
    """Create a new user account."""
    pool = await get_pool()

    # Check existing
    existing = await pool.fetchrow(
        "SELECT id FROM users WHERE email = $1 OR username = $2",
        req.email.lower(),
        req.username,
    )
    if existing:
        raise HTTPException(status_code=409, detail="Email or username already taken")

    pw_hash = hash_password(req.password)
    user_id = str(uuid.uuid4())

    await pool.execute(
        """INSERT INTO users (id, email, username, password_hash)
           VALUES ($1, $2, $3, $4)""",
        user_id,
        req.email.lower(),
        req.username,
        pw_hash,
    )

    # Create default preferences
    await pool.execute(
        "INSERT INTO user_preferences (user_id) VALUES ($1) ON CONFLICT DO NOTHING",
        user_id,
    )

    token = create_token(user_id, req.email.lower())
    logger.info(f"New signup: {req.username} ({req.email})")

    return AuthResponse(
        token=token,
        user={"id": user_id, "email": req.email.lower(), "username": req.username},
    )


@router.post("/login", response_model=AuthResponse)
async def login(req: LoginRequest):
    """Log in with email and password."""
    pool = await get_pool()

    row = await pool.fetchrow(
        "SELECT id, email, username, password_hash FROM users WHERE email = $1",
        req.email.lower(),
    )
    if not row or not verify_password(req.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_token(str(row["id"]), row["email"])
    logger.info(f"Login: {row['username']}")

    return AuthResponse(
        token=token,
        user={"id": str(row["id"]), "email": row["email"], "username": row["username"]},
    )


@router.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    """Get current user profile."""
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT id, email, username, created_at FROM users WHERE id = $1",
        user["sub"],
    )
    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "id": str(row["id"]),
        "email": row["email"],
        "username": row["username"],
        "created_at": row["created_at"].isoformat(),
    }


# ── Favorites Routes ─────────────────────────────────────────────────

@favorites_router.get("/favorites")
async def get_favorites(user: dict = Depends(get_current_user)):
    """Get all favorites for the current user."""
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT favorite_type, target_id, created_at FROM user_favorites WHERE user_id = $1 ORDER BY created_at",
        user["sub"],
    )
    return {
        "favorites": [
            {"type": r["favorite_type"], "target_id": r["target_id"], "created_at": r["created_at"].isoformat()}
            for r in rows
        ]
    }


@favorites_router.post("/favorites")
async def add_favorite(req: FavoriteRequest, user: dict = Depends(get_current_user)):
    """Add a favorite."""
    pool = await get_pool()
    try:
        await pool.execute(
            """INSERT INTO user_favorites (user_id, favorite_type, target_id)
               VALUES ($1, $2, $3) ON CONFLICT DO NOTHING""",
            user["sub"],
            req.favorite_type,
            req.target_id,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"status": "added", "type": req.favorite_type, "target_id": req.target_id}


@favorites_router.delete("/favorites/{favorite_type}/{target_id}")
async def remove_favorite(
    favorite_type: str,
    target_id: str,
    user: dict = Depends(get_current_user),
):
    """Remove a favorite."""
    pool = await get_pool()
    result = await pool.execute(
        "DELETE FROM user_favorites WHERE user_id = $1 AND favorite_type = $2 AND target_id = $3",
        user["sub"],
        favorite_type,
        target_id,
    )
    return {"status": "removed", "type": favorite_type, "target_id": target_id}


# ── Preferences Routes ───────────────────────────────────────────────

@favorites_router.get("/preferences")
async def get_preferences(user: dict = Depends(get_current_user)):
    """Get user preferences."""
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT daily_digest, digest_email, digest_hour, timezone FROM user_preferences WHERE user_id = $1",
        user["sub"],
    )
    if not row:
        return {"daily_digest": False, "digest_email": None, "digest_hour": 8, "timezone": "America/Chicago"}

    return dict(row)


@favorites_router.put("/preferences")
async def update_preferences(req: PreferencesRequest, user: dict = Depends(get_current_user)):
    """Update user preferences."""
    pool = await get_pool()

    # Build dynamic update
    updates = []
    params = [user["sub"]]
    idx = 2

    if req.daily_digest is not None:
        updates.append(f"daily_digest = ${idx}")
        params.append(req.daily_digest)
        idx += 1
    if req.digest_email is not None:
        updates.append(f"digest_email = ${idx}")
        params.append(req.digest_email)
        idx += 1
    if req.digest_hour is not None:
        updates.append(f"digest_hour = ${idx}")
        params.append(req.digest_hour)
        idx += 1
    if req.timezone is not None:
        updates.append(f"timezone = ${idx}")
        params.append(req.timezone)
        idx += 1

    if updates:
        updates.append("updated_at = now()")
        await pool.execute(
            f"UPDATE user_preferences SET {', '.join(updates)} WHERE user_id = $1",
            *params,
        )

    return {"status": "updated"}