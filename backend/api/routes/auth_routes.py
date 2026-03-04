"""
Auth API: register (email/password), login (returns user for NextAuth Credentials).
"""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select

from api.dependencies import get_db
from auth.models import PasswordCredentialORM, UserORM
from shared.utils.database import DatabaseManager
from shared.utils.logging import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/v1", tags=["auth"])
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


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
