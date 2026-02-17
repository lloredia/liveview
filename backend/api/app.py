"""
FastAPI application factory for the Live View API service.

Creates the app with:
- REST routes (leagues, matches)
- WebSocket endpoint
- Middleware stack
- Health check endpoints
- Lifespan management (startup/shutdown)
"""
from __future__ import annotations

import asyncio
import signal
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, WebSocket
from sqlalchemy import text

from shared.config import get_settings
from shared.utils.database import DatabaseManager
from shared.utils.logging import get_logger, setup_logging
from shared.utils.metrics import start_metrics_server
from shared.utils.redis_manager import RedisManager

from api.dependencies import get_db, get_redis, init_dependencies
from api.middleware import setup_middleware
from api.routes.leagues import router as leagues_router
from api.routes.matches import router as matches_router
from api.ws.manager import WebSocketManager

logger = get_logger(__name__)

# Module-level reference for the WS manager (accessed by the ws endpoint)
_ws_manager: WebSocketManager | None = None


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Application lifespan manager.
    Handles startup (connect to Redis/Postgres, start WS manager) and
    shutdown (graceful cleanup).
    """
    global _ws_manager

    settings = get_settings()
    setup_logging("api")
    start_metrics_server(9090)

    # Initialize infrastructure
    redis = RedisManager(settings)
    db = DatabaseManager(settings)

    await redis.connect()
    await db.connect()

    # Initialize dependency injection
    init_dependencies(redis, db)

    # Start WebSocket manager
    _ws_manager = WebSocketManager(redis, settings)
    await _ws_manager.start()

    logger.info(
        "api_service_started",
        host=settings.api_host,
        port=settings.api_port,
    )

    yield

    # Shutdown
    if _ws_manager:
        await _ws_manager.stop()
    await db.disconnect()
    await redis.disconnect()
    logger.info("api_service_stopped")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()

    app = FastAPI(
        title="Live View API",
        description="Real-time sports tracking platform",
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # Middleware
    setup_middleware(app)

    # REST routes
    app.include_router(leagues_router)
    app.include_router(matches_router)

    # Health check
    @app.get("/health", tags=["system"])
    async def health() -> dict[str, str]:
        return {"status": "ok", "service": "api"}

    @app.get("/ready", tags=["system"])
    async def readiness() -> dict[str, str | bool]:
        """Readiness probe — checks downstream dependencies."""
        redis = get_redis()
        db = get_db()

        redis_ok = False
        db_ok = False

        try:
            await redis.client.ping()
            redis_ok = True
        except Exception:
            pass

        try:
            async with db.read_session() as session:
                await session.execute(text("SELECT 1"))
                db_ok = True
        except Exception:
            pass

        status = "ok" if (redis_ok and db_ok) else "degraded"
        return {
            "status": status,
            "redis": redis_ok,
            "database": db_ok,
        }

    # WebSocket endpoint
    @app.websocket("/v1/ws")
    async def websocket_endpoint(ws: WebSocket) -> None:
        """
        WebSocket endpoint for real-time match updates.

        Client operations:
        - subscribe: {"op": "subscribe", "match_id": "...", "tiers": [0, 1]}
        - unsubscribe: {"op": "unsubscribe", "match_id": "..."}
        - ping: {"op": "ping"}

        Server messages:
        - snapshot: Full state replay on subscribe
        - delta: Incremental update from live match
        - pong: Response to ping
        - error: Error notification
        - state: Connection state update
        """
        if _ws_manager is None:
            await ws.close(code=1013, reason="service_unavailable")
            return
        await _ws_manager.handle_connection(ws)

    return app


# For running with uvicorn directly
app = create_app()
