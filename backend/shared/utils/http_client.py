"""
Async HTTP client wrapper for provider requests.
Includes retry logic, timeout management, and metrics collection.
"""
from __future__ import annotations

import time
from typing import Any, Optional

import httpx

from shared.config import get_settings
from shared.utils.logging import get_logger
from shared.utils.metrics import PROVIDER_LATENCY, PROVIDER_REQUESTS

logger = get_logger(__name__)


class ProviderHTTPClient:
    """
    Async HTTP client tailored for sports data provider APIs.
    Handles timeouts, retries, and records metrics per request.
    """

    def __init__(
        self,
        provider_name: str,
        base_url: str,
        api_key: str = "",
        headers: dict[str, str] | None = None,
        timeout_s: float | None = None,
        max_retries: int = 2,
    ) -> None:
        settings = get_settings()
        self._provider = provider_name
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._timeout = timeout_s or settings.provider_request_timeout_s
        self._max_retries = max_retries
        self._default_headers = headers or {}
        self._client: Optional[httpx.AsyncClient] = None

    async def start(self) -> None:
        """Initialize the underlying httpx client."""
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            headers=self._default_headers,
            timeout=httpx.Timeout(self._timeout, connect=5.0),
            follow_redirects=True,
            limits=httpx.Limits(max_connections=50, max_keepalive_connections=20),
        )

    async def close(self) -> None:
        """Close the underlying httpx client."""
        if self._client:
            await self._client.aclose()

    async def get(
        self,
        path: str,
        params: dict[str, Any] | None = None,
        extra_headers: dict[str, str] | None = None,
        sport: str = "unknown",
        tier: str = "unknown",
    ) -> httpx.Response:
        """
        Perform a GET request with retry, metrics, and structured logging.

        Args:
            path: API path relative to base_url.
            params: Query parameters.
            extra_headers: Request-specific headers.
            sport: Sport label for metrics.
            tier: Tier label for metrics.

        Returns:
            httpx.Response

        Raises:
            httpx.HTTPStatusError: On non-retryable HTTP errors.
            httpx.TimeoutException: If all retries are exhausted.
        """
        if not self._client:
            raise RuntimeError("ProviderHTTPClient not started. Call start() first.")

        last_exc: Optional[Exception] = None
        merged_headers = {**self._default_headers}
        if extra_headers:
            merged_headers.update(extra_headers)

        for attempt in range(1, self._max_retries + 1):
            start_time = time.perf_counter()
            is_error = False
            is_rate_limited = False
            status = "unknown"

            try:
                resp = await self._client.get(path, params=params, headers=merged_headers)
                elapsed_ms = (time.perf_counter() - start_time) * 1000
                status = str(resp.status_code)

                if resp.status_code == 429:
                    is_rate_limited = True
                    is_error = True
                    logger.warning(
                        "provider_rate_limited",
                        provider=self._provider,
                        path=path,
                        attempt=attempt,
                    )
                    if attempt < self._max_retries:
                        retry_after = float(resp.headers.get("Retry-After", "2"))
                        import asyncio
                        await asyncio.sleep(min(retry_after, 10.0))
                        continue
                    resp.raise_for_status()

                if resp.status_code >= 500 and attempt < self._max_retries:
                    is_error = True
                    logger.warning(
                        "provider_server_error",
                        provider=self._provider,
                        path=path,
                        status=resp.status_code,
                        attempt=attempt,
                    )
                    import asyncio
                    await asyncio.sleep(1.0 * attempt)
                    continue

                resp.raise_for_status()

                PROVIDER_LATENCY.labels(provider=self._provider).observe(
                    (time.perf_counter() - start_time)
                )
                PROVIDER_REQUESTS.labels(
                    provider=self._provider, sport=sport, tier=tier, status=status
                ).inc()

                logger.debug(
                    "provider_request_success",
                    provider=self._provider,
                    path=path,
                    status=resp.status_code,
                    latency_ms=round(elapsed_ms, 2),
                )
                return resp

            except httpx.TimeoutException as exc:
                is_error = True
                status = "timeout"
                last_exc = exc
                logger.warning(
                    "provider_timeout",
                    provider=self._provider,
                    path=path,
                    attempt=attempt,
                )
                if attempt < self._max_retries:
                    import asyncio
                    await asyncio.sleep(1.0 * attempt)
                    continue

            except httpx.HTTPStatusError as exc:
                is_error = True
                status = str(exc.response.status_code)
                last_exc = exc
                logger.error(
                    "provider_http_error",
                    provider=self._provider,
                    path=path,
                    status=exc.response.status_code,
                    attempt=attempt,
                )
                # Don't retry client errors (4xx except 429)
                if 400 <= exc.response.status_code < 500 and exc.response.status_code != 429:
                    raise

            except Exception as exc:
                is_error = True
                status = "error"
                last_exc = exc
                logger.error(
                    "provider_request_error",
                    provider=self._provider,
                    path=path,
                    error=str(exc),
                    attempt=attempt,
                )

            finally:
                elapsed_s = time.perf_counter() - start_time
                PROVIDER_REQUESTS.labels(
                    provider=self._provider, sport=sport, tier=tier, status=status
                ).inc()
                if is_error:
                    PROVIDER_LATENCY.labels(provider=self._provider).observe(elapsed_s)

        # All retries exhausted
        if last_exc:
            raise last_exc
        raise RuntimeError(f"Provider request failed after {self._max_retries} attempts")
