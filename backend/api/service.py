"""
API service entrypoint.
Runs the FastAPI application via uvicorn with production settings.
"""
from __future__ import annotations

import uvicorn

from shared.config import get_settings


def main() -> None:
    """Start the API service."""
    settings = get_settings()

    uvicorn.run(
        "api.app:app",
        host=settings.api_host,
        port=settings.api_port,
        workers=settings.api_workers,
        log_level="info",
        access_log=False,  # We handle logging via middleware
        ws_ping_interval=30.0,
        ws_ping_timeout=10.0,
        timeout_keep_alive=30,
        limit_concurrency=1000,
        limit_max_requests=50000,
    )


if __name__ == "__main__":
    main()
