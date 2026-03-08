"""
SportRadar API client implementing SportsDataProvider.
"""
from __future__ import annotations

from datetime import date
from typing import Any, Optional

import aiohttp
from shared.utils.logging import get_logger

from infra.providers.base import ScheduleResult, SportsDataProvider
from infra.providers.sportradar.endpoints import LEAGUE_CONFIGS, schedule_url
from infra.providers.sportradar.normalizer import normalize_schedule

logger = get_logger(__name__)


class SportRadarClient(SportsDataProvider):
    """SportRadar API client with daily schedule fetch and optional Redis quota."""

    def __init__(
        self,
        api_key: str,
        access_level: str = "trial",
        daily_limit: int = 1000,
        redis_client: Optional[Any] = None,
        include_raw: bool = False,
    ) -> None:
        if not (api_key and str(api_key).strip()):
            raise ValueError("SportRadar api_key is required")
        self._api_key = api_key.strip()
        self._access_level = access_level
        self._daily_limit = daily_limit
        self._redis = redis_client
        self._include_raw = include_raw
        self._session: Optional[aiohttp.ClientSession] = None

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=15.0),
            )
        return self._session

    async def fetch_daily_schedule(
        self,
        league_slug: str,
        fetch_date: date,
    ) -> ScheduleResult:
        """Fetch daily schedule from SportRadar; return normalized ProviderMatch list."""
        config = LEAGUE_CONFIGS.get(league_slug)
        if not config:
            logger.warning("sportradar_unknown_league", league_slug=league_slug)
            return ScheduleResult(matches=[], from_fallback=False)

        sport_prefix, league_id = config
        date_str = fetch_date.isoformat()
        url = schedule_url(
            "https://api.sportradar.com",
            sport_prefix,
            self._access_level,
            league_id,
            date_str,
            self._api_key,
        )

        session = await self._get_session()
        async with session.get(url) as resp:
            resp.raise_for_status()
            raw_data: dict = await resp.json()

        matches = normalize_schedule(
            raw_data,
            league_slug,
            provider_name="sportradar",
            include_raw=self._include_raw,
        )
        return ScheduleResult(matches=matches, from_fallback=False)

    async def close(self) -> None:
        """Close the HTTP session."""
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None
