"""
Auth API: register (email/password), login (returns user for NextAuth Credentials),
oauth-ensure (get-or-create user for OAuth, called by NextAuth server).
"""
from __future__ import annotations

import hashlib
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select

from api.dependencies import get_db
from auth.models import (
    AuthIdentityORM,
    PasswordCredentialORM,
    PasswordResetTokenORM,
    UserORM,
)
from shared.utils.database import DatabaseManager
from shared.utils.logging import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/v1", tags=["auth"])
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

def _get_oauth_secret() -> str:
    return (
        os.environ.get("LV_OAUTH_ENSURE_SECRET")
        or os.environ.get("OAUTH_ENSURE_SECRET")
        or ""
    ).strip()


def _require_ajax(x_requested_with: Optional[str] = Header(None, alias="X-Requested-With")) -> None:
    """CSRF mitigation: require X-Requested-With: XMLHttpRequest on state-changing auth endpoints."""
    if x_requested_with != "XMLHttpRequest":
        raise HTTPException(403, detail="CSRF check failed: X-Requested-With header required")


def _require_oauth_secret(x_oauth_secret: Optional[str] = Header(None, alias="X-OAuth-Secret")) -> None:
    secret = _get_oauth_secret()
    if not secret:
        raise HTTPException(503, detail="OAuth not configured")
    if x_oauth_secret != secret:
        raise HTTPException(401, detail="Unauthorized")


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    name: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: str
    email: str
    name: Optional[str] = None


@router.post("/auth/register", response_model=UserResponse)
async def register(
    req: RegisterRequest,
    db: DatabaseManager = Depends(get_db),
    _csrf: None = Depends(_require_ajax),
):
    """Create a new user with email/password. Used by frontend signup."""
    async with db.write_session() as session:
        existing = (
            await session.execute(select(UserORM).where(UserORM.email == req.email))
        ).scalar_one_or_none()
        if existing:
            raise HTTPException(400, "Email already registered")
        user = UserORM(
            id=uuid.uuid4(),
            email=req.email,
            name=req.name or None,
        )
        session.add(user)
        await session.flush()
        pw_hash = pwd_ctx.hash(req.password)
        cred = PasswordCredentialORM(
            user_id=user.id,
            email=user.email,
            password_hash=pw_hash,
        )
        session.add(cred)
        await session.flush()
        return UserResponse(
            id=str(user.id),
            email=user.email,
            name=user.name,
        )


@router.post("/auth/login", response_model=UserResponse)
async def login(
    req: LoginRequest,
    db: DatabaseManager = Depends(get_db),
    _csrf: None = Depends(_require_ajax),
):
    """Validate email/password and return user. Used by NextAuth Credentials provider."""
    async with db.read_session() as session:
        cred = (
            await session.execute(
                select(PasswordCredentialORM).where(
                    PasswordCredentialORM.email == req.email
                )
            )
        ).scalar_one_or_none()
        if not cred or not pwd_ctx.verify(req.password, cred.password_hash):
            raise HTTPException(401, "Invalid email or password")
        user = (
            await session.execute(select(UserORM).where(UserORM.id == cred.user_id))
        ).scalar_one()
        return UserResponse(
            id=str(user.id),
            email=user.email,
            name=user.name,
        )


# ── Password Reset ──────────────────────────────────────────────────

RESET_TOKEN_TTL = timedelta(hours=1)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _reset_link_base() -> str:
    """Base URL for the reset link shown in the email. Env-configurable."""
    return (
        os.environ.get("LV_APP_URL")
        or os.environ.get("APP_URL")
        or "https://www.liveview-tracker.com"
    ).rstrip("/")


async def _send_reset_email(to_email: str, reset_url: str) -> bool:
    """Send reset email via Resend HTTP API when RESEND_API_KEY is set.
    Returns True if an email was dispatched, False otherwise."""
    api_key = (os.environ.get("RESEND_API_KEY") or "").strip()
    if not api_key:
        return False
    from_addr = (
        os.environ.get("RESEND_FROM")
        or "LiveView <noreply@liveview-tracker.com>"
    )
    body_html = f"""<p>We received a request to reset your LiveView password.</p>
<p><a href=\"{reset_url}\">Reset your password</a></p>
<p>This link expires in 1 hour. If you didn't ask for this, you can ignore this email.</p>
"""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": from_addr,
                    "to": [to_email],
                    "subject": "Reset your LiveView password",
                    "html": body_html,
                },
            )
            if resp.status_code >= 400:
                logger.warning(
                    "resend email failed status=%s body=%s",
                    resp.status_code,
                    resp.text[:200],
                )
                return False
            return True
    except Exception as exc:
        logger.warning("resend email error: %s", exc)
        return False


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetRequestResponse(BaseModel):
    """Always returns ok=True regardless of whether the email exists,
    to avoid leaking account existence. In non-production, `debug_url` is
    populated so manual testing doesn't require SMTP."""

    ok: bool = True
    debug_url: Optional[str] = None


@router.post("/auth/password/request-reset", response_model=PasswordResetRequestResponse)
async def request_password_reset(
    req: PasswordResetRequest,
    db: DatabaseManager = Depends(get_db),
    _csrf: None = Depends(_require_ajax),
):
    """Issue a single-use, 1-hour reset token. Emails the user if
    RESEND_API_KEY is configured; otherwise logs the reset URL so an
    operator can retrieve it from Railway logs. Always returns 200."""
    email_norm = req.email.strip().lower()
    debug_url: Optional[str] = None
    async with db.write_session() as session:
        cred = (
            await session.execute(
                select(PasswordCredentialORM).where(
                    PasswordCredentialORM.email == email_norm
                )
            )
        ).scalar_one_or_none()
        if cred:
            token = secrets.token_urlsafe(32)
            token_hash = _hash_token(token)
            expires_at = datetime.now(timezone.utc) + RESET_TOKEN_TTL
            row = PasswordResetTokenORM(
                user_id=cred.user_id,
                token_hash=token_hash,
                expires_at=expires_at,
            )
            session.add(row)
            await session.flush()

            reset_url = f"{_reset_link_base()}/reset-password?token={token}"
            emailed = await _send_reset_email(email_norm, reset_url)
            if emailed:
                logger.info("password reset emailed user=%s", cred.user_id)
            else:
                logger.info(
                    "password reset (no email configured) user=%s url=%s",
                    cred.user_id,
                    reset_url,
                )
            if not _is_production():
                debug_url = reset_url
        else:
            logger.info("password reset requested for unknown email")

    return PasswordResetRequestResponse(ok=True, debug_url=debug_url)


class PasswordResetConfirm(BaseModel):
    token: str = Field(..., min_length=16, max_length=256)
    password: str = Field(..., min_length=8, max_length=128)


class PasswordResetConfirmResponse(BaseModel):
    ok: bool = True


def _is_production() -> bool:
    return (
        os.environ.get("LV_ENV")
        or os.environ.get("ENVIRONMENT")
        or ""
    ).lower() in ("production", "prod")


@router.post("/auth/password/reset", response_model=PasswordResetConfirmResponse)
async def confirm_password_reset(
    req: PasswordResetConfirm,
    db: DatabaseManager = Depends(get_db),
    _csrf: None = Depends(_require_ajax),
):
    """Verify token, update password, mark token used."""
    token_hash = _hash_token(req.token)
    async with db.write_session() as session:
        row = (
            await session.execute(
                select(PasswordResetTokenORM).where(
                    PasswordResetTokenORM.token_hash == token_hash
                )
            )
        ).scalar_one_or_none()
        now = datetime.now(timezone.utc)
        if (
            not row
            or row.used_at is not None
            or row.expires_at < now
        ):
            raise HTTPException(400, "Invalid or expired reset link")

        cred = (
            await session.execute(
                select(PasswordCredentialORM).where(
                    PasswordCredentialORM.user_id == row.user_id
                )
            )
        ).scalar_one_or_none()
        if not cred:
            raise HTTPException(400, "Invalid or expired reset link")

        cred.password_hash = pwd_ctx.hash(req.password)
        row.used_at = now
        await session.flush()
        logger.info("password reset completed user=%s", row.user_id)

    return PasswordResetConfirmResponse(ok=True)


class OAuthEnsureRequest(BaseModel):
    provider: str = Field(..., min_length=1, max_length=50)
    provider_account_id: str = Field(..., min_length=1, max_length=255)
    email: Optional[str] = Field(None, max_length=255)
    name: Optional[str] = Field(None, max_length=255)


class OAuthEnsureResponse(BaseModel):
    id: str


@router.post("/auth/oauth-ensure", response_model=OAuthEnsureResponse)
async def oauth_ensure(
    req: OAuthEnsureRequest,
    db: DatabaseManager = Depends(get_db),
    _: None = Depends(_require_oauth_secret),
):
    """
    Get or create a user for OAuth sign-in. Called by NextAuth server only (X-OAuth-Secret).
    Returns user id to use as JWT sub so backend and frontend share the same user.
    """
    if not req.email and not req.provider_account_id:
        raise HTTPException(400, "email or provider_account_id required")
    async with db.write_session() as session:
        # 1) Existing auth identity for this provider + provider_account_id
        existing_identity = (
            await session.execute(
                select(AuthIdentityORM).where(
                    AuthIdentityORM.provider == req.provider,
                    AuthIdentityORM.provider_account_id == req.provider_account_id,
                )
            )
        ).scalar_one_or_none()
        if existing_identity:
            return OAuthEnsureResponse(id=str(existing_identity.user_id))

        # 2) Find by email and link this provider
        email = (req.email or "").strip().lower()
        if email:
            existing_user = (
                await session.execute(select(UserORM).where(UserORM.email == email))
            ).scalar_one_or_none()
            if existing_user:
                identity = AuthIdentityORM(
                    user_id=existing_user.id,
                    provider=req.provider,
                    provider_account_id=req.provider_account_id,
                )
                session.add(identity)
                await session.flush()
                return OAuthEnsureResponse(id=str(existing_user.id))

        # 3) Create new user (email from OAuth or placeholder)
        if not email:
            email = f"{req.provider}_{req.provider_account_id}@oauth.placeholder"
        new_user = UserORM(
            id=uuid.uuid4(),
            email=email,
            name=req.name or None,
        )
        session.add(new_user)
        await session.flush()
        identity = AuthIdentityORM(
            user_id=new_user.id,
            provider=req.provider,
            provider_account_id=req.provider_account_id,
        )
        session.add(identity)
        await session.flush()
        return OAuthEnsureResponse(id=str(new_user.id))
