"""
ESPN public API client implementing SportsDataProvider.
"""
from __future__ import annotations

from datetime import date
from typing import List

import aiohttp
from shared.utils.logging import get_logger

from infra.providers.base import ScheduleResult, SportsDataProvider
from infra.providers.espn.normalizer import normalize_espn_events

logger = get_logger(__name__)

ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports"

# League slug -> ESPN path (same 24 leagues as app.py SPORT_LEAGUE_ESPN_PATHS).
ESPN_LEAGUE_PATHS: dict[str, str] = {
    "eng.1": "soccer/eng.1",
    "eng.2": "soccer/eng.2",
    "eng.fa": "soccer/eng.fa",
    "eng.league_cup": "soccer/eng.league_cup",
    "usa.1": "soccer/usa.1",
    "esp.1": "soccer/esp.1",
    "ger.1": "soccer/ger.1",
    "ita.1": "soccer/ita.1",
    "fra.1": "soccer/fra.1",
    "ned.1": "soccer/ned.1",
    "por.1": "soccer/por.1",
    "tur.1": "soccer/tur.1",
    "sco.1": "soccer/sco.1",
    "sau.1": "soccer/sau.1",
    "uefa.champions": "soccer/uefa.champions",
    "uefa.europa": "soccer/uefa.europa",
    "uefa.europa.conf": "soccer/uefa.europa.conf",
    "nba": "basketball/nba",
    "wnba": "basketball/wnba",
    "mens-college-basketball": "basketball/mens-college-basketball",
    "womens-college-basketball": "basketball/womens-college-basketball",
    "nhl": "hockey/nhl",
    "mlb": "baseball/mlb",
    "nfl": "football/nfl",
}


class ESPNClient(SportsDataProvider):
    """ESPN public API client; used as fallback when SportRadar fails."""

    def __init__(self) -> None:
        self._session: aiohttp.ClientSession | None = None

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=12.0),
            )
        return self._session

    async def fetch_daily_schedule(
        self,
        league_slug: str,
        fetch_date: date,
    ) -> ScheduleResult:
        """Fetch scoreboard from ESPN for the given league/date; return normalized matches."""
        path = ESPN_LEAGUE_PATHS.get(league_slug)
        if not path:
            logger.warning("espn_unknown_league", league_slug=league_slug)
            return ScheduleResult(matches=[], from_fallback=False)

        date_str = fetch_date.strftime("%Y%m%d")
        url = f"{ESPN_BASE}/{path}/scoreboard?dates={date_str}"

        session = await self._get_session()
        async with session.get(url) as resp:
            resp.raise_for_status()
            data = await resp.json()

        events: List[dict] = data.get("events", [])
        matches = normalize_espn_events(events, provider_name="espn")
        return ScheduleResult(matches=matches, from_fallback=False)

    async def close(self) -> None:
        """Close the HTTP session."""
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None
