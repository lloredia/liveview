"""
Provider router: primary provider with circuit breaker and fallback.
"""
from __future__ import annotations

from datetime import date
from typing import Any

from shared.utils.circuit_breaker import CircuitBreaker as _CircuitBreaker
from shared.utils.logging import get_logger

from infra.providers.base import ScheduleResult, SportsDataProvider

logger = get_logger(__name__)


class ProviderRouter:
    """Routes schedule requests to primary provider with circuit breaker; falls back on failure."""

    def __init__(
        self,
        primary: SportsDataProvider,
        fallback: SportsDataProvider,
        primary_circuit: _CircuitBreaker,
    ) -> None:
        self._primary = primary
        self._fallback = fallback
        self._circuit = primary_circuit

    async def fetch_daily_schedule(
        self,
        league_slug: str,
        fetch_date: date,
    ) -> ScheduleResult:
        """Fetch daily schedule from primary; on any exception use fallback and set from_fallback=True."""
        try:
            result: ScheduleResult = await self._circuit.call(
                self._primary.fetch_daily_schedule,
                league_slug,
                fetch_date,
            )
            return ScheduleResult(matches=result.matches, from_fallback=False)
        except Exception as exc:
            logger.warning(
                "serving_from_espn_fallback",
                extra={"league_slug": league_slug, "date": str(fetch_date), "error": str(exc)},
            )
            result = await self._fallback.fetch_daily_schedule(league_slug, fetch_date)
            return ScheduleResult(matches=result.matches, from_fallback=True)

    async def close(self) -> None:
        """Close both primary and fallback providers."""
        await self._primary.close()
        await self._fallback.close()
