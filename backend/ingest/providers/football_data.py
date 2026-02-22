"""
Football-Data.org (football-data.org) provider connector.
Soccer only: scoreboard, events (goals/cards), stats, lineups.
Uses v4 API with X-Auth-Token. Free tier: 10 requests/min.
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

FOOTBALL_DATA_BASE = "https://api.football-data.org/v4"


def _map_status(status: str) -> MatchPhase:
    """Map football-data.org status to MatchPhase."""
    s = (status or "").strip().upper()
    if s == "SCHEDULED":
        return MatchPhase.SCHEDULED
    if s in ("LIVE", "IN_PLAY"):
        return MatchPhase.LIVE_FIRST_HALF  # API doesn't distinguish half; minute can clarify
    if s == "PAUSED":
        return MatchPhase.LIVE_HALFTIME
    if s == "FINISHED":
        return MatchPhase.FINISHED
    if s == "POSTPONED":
        return MatchPhase.POSTPONED
    if s == "SUSPENDED":
        return MatchPhase.SUSPENDED
    if s == "CANCELLED":
        return MatchPhase.CANCELLED
    return MatchPhase.SCHEDULED


class FootballDataProvider(BaseProvider):
    """Football-Data.org v4 API (soccer only)."""

    def __init__(self, redis: RedisManager, api_key: str, rpm_limit: int = 60) -> None:
        headers: dict[str, str] = {}
        if api_key:
            headers["X-Auth-Token"] = api_key
        # Request lineups in match response
        headers["X-Unfold-Lineups"] = "true"
        http_client = ProviderHTTPClient(
            provider_name="football_data",
            base_url=FOOTBALL_DATA_BASE,
            api_key=api_key,
            headers=headers,
            timeout_s=10.0,
            max_retries=2,
        )
        super().__init__(
            name=ProviderName.FOOTBALL_DATA,
            http_client=http_client,
            redis=redis,
            supported_sports={Sport.SOCCER},
            rpm_limit=rpm_limit,
        )

    async def _fetch_scoreboard(
        self, sport: Sport, league_provider_id: str, match_provider_id: str
    ) -> ProviderResult:
        """GET /matches/{id} and parse to MatchScoreboard."""
        if sport != Sport.SOCCER:
            return ProviderResult(
                provider=self._name, tier=Tier.SCOREBOARD, success=False,
                latency_ms=0, error="football_data supports soccer only",
            )
        path = f"/matches/{match_provider_id}"
        resp = await self._http.get(path, sport=sport.value, tier="scoreboard")
        data = resp.json()
        try:
            scoreboard = self._parse_match_to_scoreboard(data, league_provider_id)
        except Exception as e:
            logger.warning("football_data_parse_scoreboard_error", error=str(e), match_id=match_provider_id)
            return ProviderResult(
                provider=self._name, tier=Tier.SCOREBOARD, success=False,
                latency_ms=0, error=str(e),
            )
        return ProviderResult(
            provider=self._name, tier=Tier.SCOREBOARD, success=True, latency_ms=0,
            scoreboard=scoreboard, raw=data,
        )

    async def _fetch_events(
        self, sport: Sport, league_provider_id: str, match_provider_id: str
    ) -> ProviderResult:
        """Parse goals and bookings from match response into MatchEvents."""
        if sport != Sport.SOCCER:
            return ProviderResult(
                provider=self._name, tier=Tier.EVENTS, success=False,
                latency_ms=0, error="football_data supports soccer only",
            )
        path = f"/matches/{match_provider_id}"
        resp = await self._http.get(path, sport=sport.value, tier="events")
        data = resp.json()
        events = self._parse_goals_and_bookings(data, match_provider_id)
        return ProviderResult(
            provider=self._name, tier=Tier.EVENTS, success=True, latency_ms=0,
            events=events, raw=data,
        )

    async def _fetch_stats(
        self, sport: Sport, league_provider_id: str, match_provider_id: str
    ) -> ProviderResult:
        """Parse team statistics from match response."""
        if sport != Sport.SOCCER:
            return ProviderResult(
                provider=self._name, tier=Tier.STATS, success=False,
                latency_ms=0, error="football_data supports soccer only",
            )
        path = f"/matches/{match_provider_id}"
        resp = await self._http.get(path, sport=sport.value, tier="stats")
        data = resp.json()
        stats = self._parse_team_stats(data, match_provider_id)
        return ProviderResult(
            provider=self._name, tier=Tier.STATS, success=True, latency_ms=0,
            stats=stats, raw=data,
        )

    def _parse_match_to_scoreboard(self, data: dict[str, Any], league_id: str) -> MatchScoreboard:
        """Build MatchScoreboard from football-data match JSON."""
        match_id = uuid.uuid5(uuid.NAMESPACE_URL, f"football_data:match:{data.get('id', '')}")
        comp = data.get("competition", {})
        league_uuid = uuid.uuid5(uuid.NAMESPACE_URL, f"football_data:league:{comp.get('id', league_id)}")
        home = data.get("homeTeam", {})
        away = data.get("awayTeam", {})
        score_obj = data.get("score", {}) or {}
        ft = score_obj.get("fullTime") or {}
        ht = score_obj.get("halfTime") or {}
        breakdown = [
            ScoreBreakdown(period="1", home=ht.get("home", 0), away=ht.get("away", 0)),
            ScoreBreakdown(period="2", home=ft.get("home", 0) - ht.get("home", 0), away=ft.get("away", 0) - ht.get("away", 0)),
        ]
        if data.get("minute"):
            clock = str(data.get("minute", ""))
            if data.get("injuryTime"):
                clock += f"+{data['injuryTime']}"
        else:
            clock = None
        utc_str = data.get("utcDate", "")
        try:
            start_time = datetime.fromisoformat(utc_str.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            start_time = datetime.now(timezone.utc)
        return MatchScoreboard(
            match_id=match_id,
            league=LeagueRef(
                id=league_uuid,
                name=comp.get("name", league_id),
                sport=Sport.SOCCER,
                country=(data.get("area") or {}).get("name", ""),
            ),
            home_team=TeamRef(
                id=uuid.uuid5(uuid.NAMESPACE_URL, f"football_data:team:{home.get('id', '')}"),
                name=home.get("name", ""),
                short_name=home.get("shortName", ""),
                logo_url=home.get("crest"),
            ),
            away_team=TeamRef(
                id=uuid.uuid5(uuid.NAMESPACE_URL, f"football_data:team:{away.get('id', '')}"),
                name=away.get("name", ""),
                short_name=away.get("shortName", ""),
                logo_url=away.get("crest"),
            ),
            score=Score(
                home=ft.get("home", 0),
                away=ft.get("away", 0),
                breakdown=breakdown,
            ),
            phase=_map_status(data.get("status", "")),
            clock=clock,
            start_time=start_time,
            version=0,
            seq=0,
        )

    def _parse_goals_and_bookings(
        self, data: dict[str, Any], match_provider_id: str
    ) -> list[MatchEvent]:
        """Build MatchEvents from goals and bookings arrays."""
        match_id = uuid.uuid5(uuid.NAMESPACE_URL, f"football_data:match:{data.get('id', '')}")
        events: list[MatchEvent] = []
        seq = 0
        for g in data.get("goals", []):
            ev_type = EventType.PENALTY if (g.get("type") or "").upper() == "PENALTY" else EventType.GOAL
            score = g.get("score") or {}
            events.append(MatchEvent(
                match_id=match_id,
                event_type=ev_type,
                minute=g.get("minute"),
                second=None,
                period=None,
                team_id=None,
                player_id=None,
                player_name=(g.get("scorer") or {}).get("name"),
                secondary_player_id=None,
                secondary_player_name=(g.get("assist") or {}).get("name") if g.get("assist") else None,
                detail=None,
                score_home=score.get("home"),
                score_away=score.get("away"),
                synthetic=False,
                source_provider=ProviderName.FOOTBALL_DATA,
                provider_event_id=f"goal:{g.get('minute')}:{(g.get('scorer') or {}).get('id')}",
                seq=seq,
            ))
            seq += 1
        for b in data.get("bookings", []):
            card = (b.get("card") or "").upper()
            ev_type = EventType.RED_CARD if "RED" in card else EventType.YELLOW_CARD
            events.append(MatchEvent(
                match_id=match_id,
                event_type=ev_type,
                minute=b.get("minute"),
                second=None,
                period=None,
                team_id=None,
                player_id=None,
                player_name=(b.get("player") or {}).get("name"),
                secondary_player_id=None,
                secondary_player_name=None,
                detail=None,
                score_home=None,
                score_away=None,
                synthetic=False,
                source_provider=ProviderName.FOOTBALL_DATA,
                provider_event_id=f"book:{b.get('minute')}:{(b.get('player') or {}).get('id')}",
                seq=seq,
            ))
            seq += 1
        events.sort(key=lambda e: (e.minute or 0, e.seq))
        for i, e in enumerate(events):
            e.seq = i
        return events

    def _parse_team_stats(self, data: dict[str, Any], match_provider_id: str) -> MatchStats:
        """Build MatchStats from homeTeam.statistics and awayTeam.statistics."""
        match_id = uuid.uuid5(uuid.NAMESPACE_URL, f"football_data:match:{data.get('id', '')}")

        def to_team_stats(raw: dict[str, Any]) -> TeamStats:
            if not raw:
                return TeamStats()
            return TeamStats(
                possession=raw.get("ball_possession"),
                shots=raw.get("shots"),
                shots_on_target=raw.get("shots_on_goal"),
                corners=raw.get("corner_kicks"),
                fouls=raw.get("fouls"),
                offsides=raw.get("offsides"),
                yellow_cards=raw.get("yellow_cards"),
                red_cards=raw.get("red_cards"),
                extra={
                    "free_kicks": raw.get("free_kicks"),
                    "throw_ins": raw.get("throw_ins"),
                    "goal_kicks": raw.get("goal_kicks"),
                    "saves": raw.get("saves"),
                },
            )

        home_stat = (data.get("homeTeam") or {}).get("statistics")
        away_stat = (data.get("awayTeam") or {}).get("statistics")
        return MatchStats(
            match_id=match_id,
            home_stats=to_team_stats(home_stat) if home_stat else TeamStats(),
            away_stats=to_team_stats(away_stat) if away_stat else TeamStats(),
            version=0,
            seq=0,
        )

    async def fetch_league_schedule(
        self, sport: Sport, league_provider_id: str, date_str: str
    ) -> list[dict[str, Any]]:
        """Fetch matches for a competition on a date. league_provider_id = competition code (PL, CL, etc.)."""
        if sport != Sport.SOCCER:
            return []
        path = f"/competitions/{league_provider_id}/matches"
        resp = await self._http.get(
            path,
            params={"dateFrom": date_str, "dateTo": date_str},
            sport=sport.value,
            tier="schedule",
        )
        data = resp.json()
        results: list[dict[str, Any]] = []
        for m in data.get("matches", []):
            home = m.get("homeTeam", {})
            away = m.get("awayTeam", {})
            score_obj = m.get("score", {}) or {}
            ft = score_obj.get("fullTime") or {}
            results.append({
                "provider_match_id": str(m.get("id", "")),
                "home_team_provider_id": str(home.get("id", "")),
                "away_team_provider_id": str(away.get("id", "")),
                "home_team_name": home.get("name", ""),
                "away_team_name": away.get("name", ""),
                "start_time": m.get("utcDate", ""),
                "phase": _map_status(m.get("status", "")).value,
                "venue": m.get("venue", ""),
            })
        return results
