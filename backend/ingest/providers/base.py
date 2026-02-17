"""
Abstract base class for all sports data providers.
Defines the contract that every provider connector must implement.
"""
from __future__ import annotations

import abc
import time
from typing import Any, Optional

from shared.models.domain import (
    MatchEvent,
    MatchScoreboard,
    MatchStats,
    ProviderHealth,
)
from shared.models.enums import ProviderName, Sport, Tier
from shared.utils.http_client import ProviderHTTPClient
from shared.utils.logging import get_logger
from shared.utils.redis_manager import RedisManager

logger = get_logger(__name__)


class ProviderResult:
    """Container for provider fetch results with metadata."""

    def __init__(
        self,
        provider: ProviderName,
        tier: Tier,
        success: bool,
        latency_ms: float,
        scoreboard: Optional[MatchScoreboard] = None,
        events: Optional[list[MatchEvent]] = None,
        stats: Optional[MatchStats] = None,
        raw: Optional[dict[str, Any]] = None,
        error: Optional[str] = None,
        rate_limited: bool = False,
    ) -> None:
        self.provider = provider
        self.tier = tier
        self.success = success
        self.latency_ms = latency_ms
        self.scoreboard = scoreboard
        self.events = events
        self.stats = stats
        self.raw = raw
        self.error = error
        self.rate_limited = rate_limited


class BaseProvider(abc.ABC):
    """
    Abstract base class for sports data providers.

    Each provider must implement fetch methods for each tier.
    The base class handles HTTP lifecycle, health recording, and quota tracking.
    """

    def __init__(
        self,
        name: ProviderName,
        http_client: ProviderHTTPClient,
        redis: RedisManager,
        supported_sports: set[Sport],
        rpm_limit: int = 1000,
    ) -> None:
        self._name = name
        self._http = http_client
        self._redis = redis
        self._supported_sports = supported_sports
        self._rpm_limit = rpm_limit

    @property
    def name(self) -> ProviderName:
        return self._name

    @property
    def supported_sports(self) -> set[Sport]:
        return self._supported_sports

    def supports(self, sport: Sport) -> bool:
        return sport in self._supported_sports

    async def start(self) -> None:
        """Initialize the provider HTTP client."""
        await self._http.start()

    async def close(self) -> None:
        """Shutdown the provider HTTP client."""
        await self._http.close()

    async def check_quota(self) -> bool:
        """
        Check if we're within rate limits for this provider.

        Returns:
            True if quota is available, False if we should back off.
        """
        usage = await self._redis.get_quota_usage(self._name.value)
        return usage < self._rpm_limit

    async def record_request(self, latency_ms: float, is_error: bool, is_rate_limited: bool) -> None:
        """Record a health sample and increment quota counter."""
        await self._redis.record_provider_sample(
            self._name.value, latency_ms, is_error, is_rate_limited
        )
        await self._redis.increment_quota(self._name.value)

    async def fetch_scoreboard(
        self, sport: Sport, league_provider_id: str, match_provider_id: str
    ) -> ProviderResult:
        """
        Fetch Tier 0 scoreboard data for a single match.

        Wraps the abstract _fetch_scoreboard with timing and health recording.
        """
        start = time.perf_counter()
        try:
            result = await self._fetch_scoreboard(sport, league_provider_id, match_provider_id)
            latency_ms = (time.perf_counter() - start) * 1000
            await self.record_request(latency_ms, not result.success, result.rate_limited)
            result.latency_ms = latency_ms
            return result
        except Exception as exc:
            latency_ms = (time.perf_counter() - start) * 1000
            await self.record_request(latency_ms, True, False)
            logger.error(
                "provider_fetch_scoreboard_error",
                provider=self._name.value,
                match_id=match_provider_id,
                error=str(exc),
            )
            return ProviderResult(
                provider=self._name,
                tier=Tier.SCOREBOARD,
                success=False,
                latency_ms=latency_ms,
                error=str(exc),
            )

    async def fetch_events(
        self, sport: Sport, league_provider_id: str, match_provider_id: str
    ) -> ProviderResult:
        """Fetch Tier 1 event data for a single match."""
        start = time.perf_counter()
        try:
            result = await self._fetch_events(sport, league_provider_id, match_provider_id)
            latency_ms = (time.perf_counter() - start) * 1000
            await self.record_request(latency_ms, not result.success, result.rate_limited)
            result.latency_ms = latency_ms
            return result
        except Exception as exc:
            latency_ms = (time.perf_counter() - start) * 1000
            await self.record_request(latency_ms, True, False)
            logger.error(
                "provider_fetch_events_error",
                provider=self._name.value,
                match_id=match_provider_id,
                error=str(exc),
            )
            return ProviderResult(
                provider=self._name,
                tier=Tier.EVENTS,
                success=False,
                latency_ms=latency_ms,
                error=str(exc),
            )

    async def fetch_stats(
        self, sport: Sport, league_provider_id: str, match_provider_id: str
    ) -> ProviderResult:
        """Fetch Tier 2 stats data for a single match."""
        start = time.perf_counter()
        try:
            result = await self._fetch_stats(sport, league_provider_id, match_provider_id)
            latency_ms = (time.perf_counter() - start) * 1000
            await self.record_request(latency_ms, not result.success, result.rate_limited)
            result.latency_ms = latency_ms
            return result
        except Exception as exc:
            latency_ms = (time.perf_counter() - start) * 1000
            await self.record_request(latency_ms, True, False)
            logger.error(
                "provider_fetch_stats_error",
                provider=self._name.value,
                match_id=match_provider_id,
                error=str(exc),
            )
            return ProviderResult(
                provider=self._name,
                tier=Tier.STATS,
                success=False,
                latency_ms=latency_ms,
                error=str(exc),
            )

    # ── Abstract methods (each provider implements these) ───────────────
    @abc.abstractmethod
    async def _fetch_scoreboard(
        self, sport: Sport, league_provider_id: str, match_provider_id: str
    ) -> ProviderResult:
        """Provider-specific scoreboard fetch logic."""
        ...

    @abc.abstractmethod
    async def _fetch_events(
        self, sport: Sport, league_provider_id: str, match_provider_id: str
    ) -> ProviderResult:
        """Provider-specific events fetch logic."""
        ...

    @abc.abstractmethod
    async def _fetch_stats(
        self, sport: Sport, league_provider_id: str, match_provider_id: str
    ) -> ProviderResult:
        """Provider-specific stats fetch logic."""
        ...

    @abc.abstractmethod
    async def fetch_league_schedule(
        self, sport: Sport, league_provider_id: str, date_str: str
    ) -> list[dict[str, Any]]:
        """
        Fetch the day's schedule for a league.

        Returns raw match data dicts with at minimum:
            provider_match_id, home_team_provider_id, away_team_provider_id,
            start_time, phase
        """
        ...
