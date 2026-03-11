"""
Auth API: register (email/password), login (returns user for NextAuth Credentials),
oauth-ensure (get-or-create user for OAuth, called by NextAuth server).
"""
from __future__ import annotations

import os
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select

from api.dependencies import get_db
from auth.models import AuthIdentityORM, PasswordCredentialORM, UserORM
from shared.utils.database import DatabaseManager
from shared.utils.logging import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/v1", tags=["auth"])
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

def _get_oauth_secret() -> str:
    return (os.environ.get("OAUTH_ENSURE_SECRET") or "").strip()


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
