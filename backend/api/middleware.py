"""
API middleware stack.

- Request ID injection (X-Request-ID header)
- Structured request/response logging
- Global exception handler
- CORS configuration
"""
from __future__ import annotations

import time
import uuid
from typing import Callable

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from shared.utils.logging import get_logger

logger = get_logger(__name__)


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Injects a unique X-Request-ID header into every request/response."""

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        request.state.request_id = request_id

        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Logs structured request/response information."""

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        start = time.monotonic()
        request_id = getattr(request.state, "request_id", "unknown")

        # Skip logging for health checks and metrics
        path = request.url.path
        if path in ("/health", "/healthz", "/metrics", "/ready"):
            return await call_next(request)

        try:
            response = await call_next(request)
            duration_ms = round((time.monotonic() - start) * 1000, 2)

            logger.info(
                "http_request",
                method=request.method,
                path=path,
                status=response.status_code,
                duration_ms=duration_ms,
                request_id=request_id,
                client=request.client.host if request.client else "unknown",
            )

            return response

        except Exception as exc:
            duration_ms = round((time.monotonic() - start) * 1000, 2)
            logger.error(
                "http_request_error",
                method=request.method,
                path=path,
                duration_ms=duration_ms,
                request_id=request_id,
                error=str(exc),
                exc_info=True,
            )
            raise


def setup_exception_handlers(app: FastAPI) -> None:
    """Register global exception handlers."""

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        request_id = getattr(request.state, "request_id", "unknown")
        logger.error(
            "unhandled_exception",
            path=request.url.path,
            error=str(exc),
            request_id=request_id,
            exc_info=True,
        )
        return JSONResponse(
            status_code=500,
            content={
                "error": "internal_server_error",
                "message": "An unexpected error occurred",
                "request_id": request_id,
            },
        )

    @app.exception_handler(404)
    async def not_found_handler(request: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=404,
            content={
                "error": "not_found",
                "message": str(exc) if str(exc) != "404" else "Resource not found",
            },
        )


def setup_cors(app: FastAPI) -> None:
    """Configure CORS middleware."""
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # In production, restrict to known origins
        allow_credentials=True,
        allow_methods=["GET", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["ETag", "X-Request-ID", "Cache-Control"],
    )


def setup_middleware(app: FastAPI) -> None:
    """Apply all middleware to the FastAPI app in the correct order."""
    # Order matters: outermost middleware first
    # 1. CORS (must be outermost for preflight)
    setup_cors(app)
    # 2. Request ID (runs early, sets state)
    app.add_middleware(RequestIDMiddleware)
    # 3. Request logging (uses request ID from state)
    app.add_middleware(RequestLoggingMiddleware)
    # 4. Exception handlers
    setup_exception_handlers(app)
