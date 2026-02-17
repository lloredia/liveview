"""
TheSportsDB provider connector.
Free tier API with lower rate limits; used as final fallback.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from shared.models.domain import (
    LeagueRef,
    MatchEvent,
    MatchScoreboard,
    MatchStats,
    Score,
    ScoreBreakdown,
    TeamRef,
    TeamStats,
)
from shared.models.enums import EventType, MatchPhase, ProviderName, Sport, Tier
from shared.utils.http_client import ProviderHTTPClient
from shared.utils.logging import get_logger
from shared.utils.redis_manager import RedisManager

from ingest.providers.base import BaseProvider, ProviderResult

logger = get_logger(__name__)

_TSDB_SPORT_MAP: dict[Sport, str] = {
    Sport.SOCCER: "Soccer",
    Sport.BASKETBALL: "Basketball",
    Sport.HOCKEY: "Ice Hockey",
    Sport.BASEBALL: "Baseball",
}


def _map_tsdb_phase(status: str, sport: Sport) -> MatchPhase:
    """Map TheSportsDB event status to canonical MatchPhase."""
    s = status.strip().lower() if status else ""
    mapping: dict[str, MatchPhase] = {
        "not started": MatchPhase.SCHEDULED,
        "ns": MatchPhase.SCHEDULED,
        "match finished": MatchPhase.FINISHED,
        "ft": MatchPhase.FINISHED,
        "finished": MatchPhase.FINISHED,
        "aet": MatchPhase.FINISHED,
        "pen.": MatchPhase.FINISHED,
        "postponed": MatchPhase.POSTPONED,
        "cancelled": MatchPhase.CANCELLED,
        "suspended": MatchPhase.SUSPENDED,
        "1h": MatchPhase.LIVE_FIRST_HALF,
        "ht": MatchPhase.LIVE_HALFTIME,
        "2h": MatchPhase.LIVE_SECOND_HALF,
        "et": MatchPhase.LIVE_EXTRA_TIME,
        "p": MatchPhase.LIVE_PENALTIES,
        "live": MatchPhase.LIVE_FIRST_HALF,
    }
    return mapping.get(s, MatchPhase.SCHEDULED)


class TheSportsDBProvider(BaseProvider):
    """TheSportsDB data provider connector (free fallback)."""

    TSDB_BASE_URL = "https://www.thesportsdb.com/api/v1/json"

    def __init__(self, redis: RedisManager, api_key: str = "3", rpm_limit: int = 300) -> None:
        # TheSportsDB free tier uses key "3" or a patreon key
        http_client = ProviderHTTPClient(
            provider_name="thesportsdb",
            base_url=f"{self.TSDB_BASE_URL}/{api_key}",
            api_key=api_key,
            timeout_s=12.0,
            max_retries=2,
        )
        super().__init__(
            name=ProviderName.THESPORTSDB,
            http_client=http_client,
            redis=redis,
            supported_sports={Sport.SOCCER, Sport.BASKETBALL, Sport.HOCKEY, Sport.BASEBALL},
            rpm_limit=rpm_limit,
        )

    async def _fetch_scoreboard(
        self, sport: Sport, league_provider_id: str, match_provider_id: str
    ) -> ProviderResult:
        """Fetch event details for scoreboard data."""
        path = f"/lookupevent.php"
        resp = await self._http.get(
            path, params={"id": match_provider_id}, sport=sport.value, tier="scoreboard"
        )
        data = resp.json()
        events = data.get("events", [])
        if not events:
            return ProviderResult(
                provider=self._name, tier=Tier.SCOREBOARD,
                success=False, latency_ms=0, error="Event not found",
            )

        event = events[0]
        scoreboard = self._parse_event_to_scoreboard(event, sport)
        return ProviderResult(
            provider=self._name, tier=Tier.SCOREBOARD,
            success=True, latency_ms=0, scoreboard=scoreboard, raw=event,
        )

    async def _fetch_events(
        self, sport: Sport, league_provider_id: str, match_provider_id: str
    ) -> ProviderResult:
        """TheSportsDB has limited event/timeline support on free tier."""
        # TheSportsDB free tier doesn't provide detailed play-by-play
        # Return empty events list — the synthetic timeline builder handles this
        return ProviderResult(
            provider=self._name, tier=Tier.EVENTS,
            success=True, latency_ms=0, events=[],
            raw={"note": "TheSportsDB free tier: no play-by-play available"},
        )

    async def _fetch_stats(
        self, sport: Sport, league_provider_id: str, match_provider_id: str
    ) -> ProviderResult:
        """Fetch event statistics from TheSportsDB."""
        path = f"/lookupevent.php"
        resp = await self._http.get(
            path, params={"id": match_provider_id}, sport=sport.value, tier="stats"
        )
        data = resp.json()
        events = data.get("events", [])
        if not events:
            return ProviderResult(
                provider=self._name, tier=Tier.STATS,
                success=False, latency_ms=0, error="Event not found",
            )

        event = events[0]
        stats = self._parse_event_stats(event, match_provider_id, sport)
        return ProviderResult(
            provider=self._name, tier=Tier.STATS,
            success=True, latency_ms=0, stats=stats, raw=event,
        )

    async def fetch_league_schedule(
        self, sport: Sport, league_provider_id: str, date_str: str
    ) -> list[dict[str, Any]]:
        """Fetch events for a specific day."""
        path = f"/eventsday.php"
        resp = await self._http.get(
            path,
            params={"d": date_str, "l": league_provider_id},
            sport=sport.value,
            tier="schedule",
        )
        data = resp.json()
        results: list[dict[str, Any]] = []
        for event in (data.get("events") or []):
            status = event.get("strStatus", "Not Started")
            results.append({
                "provider_match_id": str(event.get("idEvent", "")),
                "home_team_provider_id": str(event.get("idHomeTeam", "")),
                "away_team_provider_id": str(event.get("idAwayTeam", "")),
                "home_team_name": event.get("strHomeTeam", ""),
                "away_team_name": event.get("strAwayTeam", ""),
                "start_time": f"{event.get('dateEvent', '')}T{event.get('strTime', '00:00:00')}",
                "phase": _map_tsdb_phase(status, sport).value,
                "venue": event.get("strVenue", ""),
            })
        return results

    # ── Parsing ─────────────────────────────────────────────────────────

    def _parse_event_to_scoreboard(
        self, event: dict[str, Any], sport: Sport
    ) -> MatchScoreboard:
        """Parse TheSportsDB event into MatchScoreboard."""
        match_id = uuid.uuid5(uuid.NAMESPACE_URL, f"tsdb:match:{event.get('idEvent', '')}")

        home_score = int(event.get("intHomeScore", 0) or 0)
        away_score = int(event.get("intAwayScore", 0) or 0)

        status = event.get("strStatus", "Not Started")
        phase = _map_tsdb_phase(status, sport)

        date_str = event.get("dateEvent", "")
        time_str = event.get("strTime", "00:00:00")
        try:
            start_time = datetime.fromisoformat(f"{date_str}T{time_str}+00:00")
        except (ValueError, AttributeError):
            start_time = datetime.now(timezone.utc)

        return MatchScoreboard(
            match_id=match_id,
            league=LeagueRef(
                id=uuid.uuid5(uuid.NAMESPACE_URL, f"tsdb:league:{event.get('idLeague', '')}"),
                name=event.get("strLeague", ""),
                sport=sport,
                country=event.get("strCountry", ""),
            ),
            home_team=TeamRef(
                id=uuid.uuid5(uuid.NAMESPACE_URL, f"tsdb:team:{event.get('idHomeTeam', '')}"),
                name=event.get("strHomeTeam", ""),
                short_name=(event.get("strHomeTeam", "") or "")[:3].upper(),
            ),
            away_team=TeamRef(
                id=uuid.uuid5(uuid.NAMESPACE_URL, f"tsdb:team:{event.get('idAwayTeam', '')}"),
                name=event.get("strAwayTeam", ""),
                short_name=(event.get("strAwayTeam", "") or "")[:3].upper(),
            ),
            score=Score(home=home_score, away=away_score),
            phase=phase,
            start_time=start_time,
        )

    def _parse_event_stats(
        self, event: dict[str, Any], match_provider_id: str, sport: Sport
    ) -> MatchStats:
        """Parse event-level statistics from TheSportsDB."""
        match_id = uuid.uuid5(uuid.NAMESPACE_URL, f"tsdb:match:{match_provider_id}")

        # TheSportsDB provides limited stats in event detail
        home_stats = TeamStats(
            shots=_safe_int(event.get("intHomeShots")),
            extra={k: v for k, v in event.items() if k.startswith("strHome") and v},
        )
        away_stats = TeamStats(
            shots=_safe_int(event.get("intAwayShots")),
            extra={k: v for k, v in event.items() if k.startswith("strAway") and v},
        )

        return MatchStats(match_id=match_id, home_stats=home_stats, away_stats=away_stats)


def _safe_int(val: Any) -> Optional[int]:
    if val is None:
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None
