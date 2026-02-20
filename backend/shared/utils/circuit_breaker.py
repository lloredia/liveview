"""
Circuit breaker pattern for external service calls.

States:
  CLOSED   — normal operation, requests pass through
  OPEN     — too many failures, requests fail fast without calling the service
  HALF_OPEN — after cooldown, allow a single probe request to test recovery
"""
from __future__ import annotations

import asyncio
import time
from enum import Enum
from typing import Any, Callable, Coroutine, TypeVar

from shared.utils.logging import get_logger

logger = get_logger(__name__)

T = TypeVar("T")


class CircuitState(str, Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreakerOpen(Exception):
    """Raised when the circuit is open and calls are being rejected."""

    def __init__(self, name: str, retry_after: float):
        self.name = name
        self.retry_after = retry_after
        super().__init__(f"Circuit breaker '{name}' is OPEN. Retry after {retry_after:.0f}s.")


class CircuitBreaker:
    """
    Async circuit breaker.

    Args:
        name: Identifier for logging.
        failure_threshold: Consecutive failures before opening the circuit.
        recovery_timeout_s: Seconds to wait in OPEN state before probing.
        half_open_max: Max concurrent requests allowed in HALF_OPEN state.
    """

    def __init__(
        self,
        name: str,
        failure_threshold: int = 5,
        recovery_timeout_s: float = 60.0,
        half_open_max: int = 1,
    ) -> None:
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout_s = recovery_timeout_s
        self.half_open_max = half_open_max

        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._last_failure_time: float = 0.0
        self._half_open_calls = 0
        self._lock = asyncio.Lock()

    @property
    def state(self) -> CircuitState:
        if self._state == CircuitState.OPEN:
            if time.monotonic() - self._last_failure_time >= self.recovery_timeout_s:
                return CircuitState.HALF_OPEN
        return self._state

    @property
    def stats(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "state": self.state.value,
            "failure_count": self._failure_count,
            "success_count": self._success_count,
            "last_failure_ago_s": round(time.monotonic() - self._last_failure_time, 1)
            if self._last_failure_time > 0
            else None,
        }

    async def call(
        self, func: Callable[..., Coroutine[Any, Any, T]], *args: Any, **kwargs: Any
    ) -> T:
        current_state = self.state

        if current_state == CircuitState.OPEN:
            retry_after = self.recovery_timeout_s - (
                time.monotonic() - self._last_failure_time
            )
            raise CircuitBreakerOpen(self.name, max(retry_after, 1.0))

        if current_state == CircuitState.HALF_OPEN:
            async with self._lock:
                if self._half_open_calls >= self.half_open_max:
                    raise CircuitBreakerOpen(self.name, 5.0)
                self._half_open_calls += 1

        try:
            result = await func(*args, **kwargs)
            await self._on_success()
            return result
        except CircuitBreakerOpen:
            raise
        except Exception as exc:
            await self._on_failure(exc)
            raise

    async def _on_success(self) -> None:
        async with self._lock:
            if self._state in (CircuitState.HALF_OPEN, CircuitState.OPEN):
                logger.info("circuit_breaker_closed", name=self.name)
            self._state = CircuitState.CLOSED
            self._failure_count = 0
            self._half_open_calls = 0
            self._success_count += 1

    async def _on_failure(self, exc: Exception) -> None:
        async with self._lock:
            self._failure_count += 1
            self._last_failure_time = time.monotonic()

            if self._state == CircuitState.HALF_OPEN:
                self._state = CircuitState.OPEN
                self._half_open_calls = 0
                logger.warning(
                    "circuit_breaker_reopened",
                    name=self.name,
                    error=str(exc),
                )
            elif self._failure_count >= self.failure_threshold:
                self._state = CircuitState.OPEN
                logger.warning(
                    "circuit_breaker_opened",
                    name=self.name,
                    failures=self._failure_count,
                    error=str(exc),
                )
