"""
API service entrypoint.
Runs the FastAPI application via uvicorn with production settings.
Railway sets PORT dynamically; use it when present.
"""
from __future__ import annotations

import os

import uvicorn

from shared.config import get_settings


def main() -> None:
    """Start the API service."""
    settings = get_settings()
    port = int(os.environ.get("PORT", settings.api_port))

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
