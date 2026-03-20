"""
API service entrypoint.
Runs the FastAPI application via uvicorn with production settings.
Railway sets PORT dynamically; use it when present.
"""
from __future__ import annotations

import os

import uvicorn

from shared.config import get_settings


def _resolve_api_bind_port(default_port: int) -> int:
    port_str = (os.environ.get("PORT") or os.environ.get("LV_API_PORT") or "").strip()
    if not port_str:
        return default_port
    try:
        return int(port_str)
    except ValueError:
        return default_port


def main() -> None:
    """Start the API service."""
    settings = get_settings()
    port = _resolve_api_bind_port(settings.api_port)

    uvicorn.run(
        "api.app:app",
        host=settings.api_host,
        port=port,
        workers=settings.api_workers,
        log_level="info",
        access_log=False,  # We handle logging via middleware
        ws_ping_interval=30.0,
        ws_ping_timeout=10.0,
        timeout_keep_alive=30,
        limit_concurrency=1000,
    )


if __name__ == "__main__":
    main()
