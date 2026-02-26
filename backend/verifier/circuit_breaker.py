"""
Circuit breaker per domain: open after N failures, half-open after recovery window.
"""
from __future__ import annotations

import asyncio
import time
from typing import Optional

from shared.utils.logging import get_logger

from verifier.config import VerifierSettings, get_verifier_settings

logger = get_logger(__name__)


class CircuitState:
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreaker:
    """Per-domain circuit breaker."""

    def __init__(self, settings: Optional[VerifierSettings] = None) -> None:
        self._settings = settings or get_verifier_settings()
        self._failures: dict[str, int] = {}
        self._state: dict[str, str] = {}
        self._opened_at: dict[str, float] = {}
        self._lock = asyncio.Lock()

    def _domain(self, url: str) -> str:
        from urllib.parse import urlparse
        try:
            return urlparse(url).netloc or "unknown"
        except Exception:
            return "unknown"

    async def allow_request(self, url: str) -> bool:
        """Return True if request is allowed (closed or half_open)."""
        domain = self._domain(url)
        async with self._lock:
            state = self._state.get(domain, CircuitState.CLOSED)
            if state == CircuitState.CLOSED:
                return True
            if state == CircuitState.HALF_OPEN:
                return True
            # OPEN: check recovery
            opened = self._opened_at.get(domain, 0)
            if time.monotonic() - opened >= self._settings.circuit_recovery_s:
                self._state[domain] = CircuitState.HALF_OPEN
                logger.info("circuit_half_open", domain=domain)
                return True
            return False

    async def record_success(self, url: str) -> None:
        """On success: close circuit if half_open; reset failures if closed."""
        domain = self._domain(url)
        async with self._lock:
            if self._state.get(domain) == CircuitState.HALF_OPEN:
                self._state[domain] = CircuitState.CLOSED
                self._failures[domain] = 0
                logger.info("circuit_closed", domain=domain)
            elif self._state.get(domain) == CircuitState.CLOSED:
                self._failures[domain] = 0

    async def record_failure(self, url: str) -> None:
        """On failure: increment count; open circuit if threshold reached."""
        domain = self._domain(url)
        async with self._lock:
            self._failures[domain] = self._failures.get(domain, 0) + 1
            if self._state.get(domain) == CircuitState.HALF_OPEN:
                self._state[domain] = CircuitState.OPEN
                self._opened_at[domain] = time.monotonic()
                logger.warning("circuit_open", domain=domain, reason="failure_in_half_open")
            elif self._failures[domain] >= self._settings.circuit_failure_threshold:
                self._state[domain] = CircuitState.OPEN
                self._opened_at[domain] = time.monotonic()
                logger.warning(
                    "circuit_open",
                    domain=domain,
                    failures=self._failures[domain],
                    threshold=self._settings.circuit_failure_threshold,
                )
