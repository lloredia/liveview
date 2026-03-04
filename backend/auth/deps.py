"""
Auth dependencies: JWT verification for Bearer token (NextAuth-compatible).
Backend expects Authorization: Bearer <jwt> and validates with shared secret.
"""
from __future__ import annotations

import os
from typing import Optional
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

# Same secret as NextAuth (NEXTAUTH_SECRET or AUTH_JWT_SECRET)
def _get_jwt_secret() -> str:
    s = os.environ.get("AUTH_JWT_SECRET") or os.environ.get("NEXTAUTH_SECRET")
    if not s:
        raise RuntimeError("AUTH_JWT_SECRET or NEXTAUTH_SECRET must be set for auth")
    return s


security = HTTPBearer(auto_error=False)


async def get_current_user_id(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> UUID:
    """Extract and verify JWT; return user id (sub). Raises 401 if missing or invalid."""
    if not credentials or credentials.credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization",
        )
    token = credentials.credentials
    secret = _get_jwt_secret()
    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            options={"require": ["exp", "sub"]},
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )
    try:
        return UUID(str(sub))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user id in token",
        )
