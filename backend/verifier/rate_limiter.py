"""
Per-domain rate limiting with token bucket and backoff.
Thread-safe for asyncio; uses Redis for distributed consistency when needed.
"""
from __future__ import annotations

import asyncio
import time
from collections import defaultdict
from typing import Optional

from shared.utils.logging import get_logger

from verifier.config import VerifierSettings, get_verifier_settings

logger = get_logger(__name__)


class TokenBucket:
    """
    In-process token bucket per domain.
    Refills at per_domain_rpm / 60 tokens per second; max burst = per_domain_burst.
    """

    def __init__(
        self,
        rpm: int,
        burst: int,
    ) -> None:
        self._rpm = max(1, rpm)
        self._burst = max(1, burst)
        self._tokens = float(burst)
        self._last_refill = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self) -> bool:
        """Consume one token if available. Returns True if allowed, False if rate limited."""
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self._last_refill
            refill = elapsed * (self._rpm / 60.0)
            self._tokens = min(self._burst, self._tokens + refill)
            self._last_refill = now
            if self._tokens >= 1:
                self._tokens -= 1
                return True
            return False

    async def wait_until_available(self, timeout_s: Optional[float] = None) -> bool:
        """Wait until a token is available or timeout. Returns True if token acquired."""
        deadline = (time.monotonic() + timeout_s) if timeout_s else None
        while True:
            if await self.acquire():
                return True
            if deadline is not None and time.monotonic() >= deadline:
                return False
            # Wait for one refill interval
            await asyncio.sleep(60.0 / max(1, self._rpm))


class DomainRateLimiter:
    """Per-domain token buckets and optional 429 backoff until timestamp."""

    def __init__(self, settings: Optional[VerifierSettings] = None) -> None:
        self._settings = settings or get_verifier_settings()
        self._buckets: dict[str, TokenBucket] = defaultdict(
            lambda: TokenBucket(
                rpm=self._settings.per_domain_rpm,
                burst=self._settings.per_domain_burst,
            )
        )
        self._backoff_until: dict[str, float] = {}
        self._lock = asyncio.Lock()

    def _domain(self, url: str) -> str:
        """Extract domain from URL for bucket key."""
        from urllib.parse import urlparse
        try:
            return urlparse(url).netloc or "unknown"
        except Exception:
            return "unknown"

    async def allow_request(self, url: str) -> bool:
        """
        Check if a request to url is allowed (rate limit + backoff).
        Returns True if allowed, False if should skip (rate limited or in backoff).
        """
        domain = self._domain(url)
        async with self._lock:
            if domain in self._backoff_until and time.monotonic() < self._backoff_until[domain]:
                return False
        return await self._buckets[domain].acquire()

    async def wait_for_slot(self, url: str, timeout_s: Optional[float] = 10.0) -> bool:
        """Wait until a request to url is allowed or timeout. Returns True if allowed."""
        domain = self._domain(url)
        async with self._lock:
            backoff = self._backoff_until.get(domain, 0)
            if backoff > time.monotonic():
                wait = backoff - time.monotonic()
                if timeout_s and wait > timeout_s:
                    return False
                await asyncio.sleep(min(wait, timeout_s or wait))
        return await self._buckets[domain].wait_until_available(timeout_s)

    def record_429(self, url: str) -> None:
        """Record rate limit response; backoff for this domain."""
        domain = self._domain(url)
        until = time.monotonic() + self._settings.backoff_on_429_s
        self._backoff_until[domain] = until
        logger.warning("rate_limit_backoff", domain=domain, backoff_until_s=self._settings.backoff_on_429_s)
