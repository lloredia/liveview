"""
Sportradar provider connector.
Implements the BaseProvider interface for Sportradar's REST APIs.
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

_SR_SPORT_PREFIXES: dict[Sport, str] = {
    Sport.SOCCER: "soccer",
    Sport.BASKETBALL: "basketball",
    Sport.HOCKEY: "ice_hockey",
    Sport.BASEBALL: "baseball",
}


def _map_sr_phase(status: str, sport: Sport) -> MatchPhase:
    """Map Sportradar status string to canonical MatchPhase."""
    s = status.lower()
    phase_map: dict[str, MatchPhase] = {
        "not_started": MatchPhase.SCHEDULED,
        "scheduled": MatchPhase.SCHEDULED,
        "created": MatchPhase.SCHEDULED,
        "closed": MatchPhase.FINISHED,
        "ended": MatchPhase.FINISHED,
        "complete": MatchPhase.FINISHED,
        "postponed": MatchPhase.POSTPONED,
        "cancelled": MatchPhase.CANCELLED,
        "abandoned": MatchPhase.CANCELLED,
        "suspended": MatchPhase.SUSPENDED,
        "halftime": MatchPhase.LIVE_HALFTIME,
        "1st_half": MatchPhase.LIVE_FIRST_HALF,
        "2nd_half": MatchPhase.LIVE_SECOND_HALF,
        "extra_time": MatchPhase.LIVE_EXTRA_TIME,
        "penalties": MatchPhase.LIVE_PENALTIES,
        "1st_quarter": MatchPhase.LIVE_Q1,
        "2nd_quarter": MatchPhase.LIVE_Q2,
        "3rd_quarter": MatchPhase.LIVE_Q3,
        "4th_quarter": MatchPhase.LIVE_Q4,
        "overtime": MatchPhase.LIVE_OT,
        "1st_period": MatchPhase.LIVE_P1,
        "2nd_period": MatchPhase.LIVE_P2,
        "3rd_period": MatchPhase.LIVE_P3,
        "inning": MatchPhase.LIVE_INNING,
        "break": MatchPhase.BREAK,
        "live": MatchPhase.LIVE_FIRST_HALF,
        "in_progress": MatchPhase.LIVE_FIRST_HALF,
    }
    return phase_map.get(s, MatchPhase.SCHEDULED)


def _map_sr_event_type(event_type: str) -> EventType:
    """Map Sportradar event type to canonical EventType."""
    et = event_type.lower()
    mapping: dict[str, EventType] = {
        "score_change": EventType.GOAL,
        "goal": EventType.GOAL,
        "yellow_card": EventType.YELLOW_CARD,
        "red_card": EventType.RED_CARD,
        "yellow_red_card": EventType.RED_CARD,
        "substitution": EventType.SUBSTITUTION,
        "penalty_kick": EventType.PENALTY,
        "penalty_missed": EventType.PENALTY_MISS,
        "own_goal": EventType.OWN_GOAL,
        "period_start": EventType.PERIOD_START,
        "period_end": EventType.PERIOD_END,
        "match_started": EventType.MATCH_START,
        "match_ended": EventType.MATCH_END,
        "shot_on_target": EventType.SHOT,
        "shot_off_target": EventType.SHOT,
        "corner_kick": EventType.CORNER,
        "offside": EventType.OFFSIDE,
        "free_kick": EventType.FREE_KICK,
        "throw_in": EventType.THROW_IN,
        "foul": EventType.FOUL,
        "timeout": EventType.TIMEOUT,
    }
    for key, val in mapping.items():
        if key in et:
            return val
    return EventType.GENERIC


class SportradarProvider(BaseProvider):
    """Sportradar data provider connector."""

    SR_BASE_URL = "https://api.sportradar.com"

    def __init__(self, redis: RedisManager, api_key: str = "", rpm_limit: int = 1000) -> None:
        http_client = ProviderHTTPClient(
            provider_name="sportradar",
            base_url=self.SR_BASE_URL,
            api_key=api_key,
            headers={"Accept": "application/json"},
            timeout_s=10.0,
            max_retries=2,
        )
        self._api_key = api_key
        super().__init__(
            name=ProviderName.SPORTRADAR,
            http_client=http_client,
            redis=redis,
            supported_sports={Sport.SOCCER, Sport.BASKETBALL, Sport.HOCKEY, Sport.BASEBALL},
            rpm_limit=rpm_limit,
        )

    def _auth_params(self) -> dict[str, str]:
        return {"api_key": self._api_key} if self._api_key else {}

    async def _fetch_scoreboard(
        self, sport: Sport, league_provider_id: str, match_provider_id: str
    ) -> ProviderResult:
        """Fetch match summary from Sportradar for scoreboard data."""
        sport_prefix = _SR_SPORT_PREFIXES.get(sport, "soccer")
        path = f"/{sport_prefix}/trial/v4/en/sport_events/{match_provider_id}/summary.json"

        resp = await self._http.get(
            path, params=self._auth_params(), sport=sport.value, tier="scoreboard"
        )
        if resp.status_code == 429:
            return ProviderResult(
                provider=self._name, tier=Tier.SCOREBOARD,
                success=False, latency_ms=0, rate_limited=True, error="Rate limited",
            )
        data = resp.json()
        scoreboard = self._parse_summary_to_scoreboard(data, sport)
        return ProviderResult(
            provider=self._name, tier=Tier.SCOREBOARD,
            success=True, latency_ms=0, scoreboard=scoreboard, raw=data,
        )

    async def _fetch_events(
        self, sport: Sport, league_provider_id: str, match_provider_id: str
    ) -> ProviderResult:
        """Fetch timeline events from Sportradar."""
        sport_prefix = _SR_SPORT_PREFIXES.get(sport, "soccer")
        path = f"/{sport_prefix}/trial/v4/en/sport_events/{match_provider_id}/timeline.json"

        resp = await self._http.get(
            path, params=self._auth_params(), sport=sport.value, tier="events"
        )
        data = resp.json()
        events = self._parse_timeline(data, match_provider_id, sport)
        return ProviderResult(
            provider=self._name, tier=Tier.EVENTS,
            success=True, latency_ms=0, events=events, raw=data,
        )

    async def _fetch_stats(
        self, sport: Sport, league_provider_id: str, match_provider_id: str
    ) -> ProviderResult:
        """Fetch match statistics from Sportradar summary."""
        sport_prefix = _SR_SPORT_PREFIXES.get(sport, "soccer")
        path = f"/{sport_prefix}/trial/v4/en/sport_events/{match_provider_id}/summary.json"

        resp = await self._http.get(
            path, params=self._auth_params(), sport=sport.value, tier="stats"
        )
        data = resp.json()
        stats = self._parse_stats(data, match_provider_id, sport)
        return ProviderResult(
            provider=self._name, tier=Tier.STATS,
            success=True, latency_ms=0, stats=stats, raw=data,
        )

    async def fetch_league_schedule(
        self, sport: Sport, league_provider_id: str, date_str: str
    ) -> list[dict[str, Any]]:
        """Fetch daily schedule from Sportradar."""
        sport_prefix = _SR_SPORT_PREFIXES.get(sport, "soccer")
        path = f"/{sport_prefix}/trial/v4/en/schedules/{date_str}/schedule.json"

        resp = await self._http.get(
            path, params=self._auth_params(), sport=sport.value, tier="schedule"
        )
        data = resp.json()
        results: list[dict[str, Any]] = []
        for event in data.get("sport_events", []):
            competitors = event.get("competitors", [])
            home = next((c for c in competitors if c.get("qualifier") == "home"), None)
            away = next((c for c in competitors if c.get("qualifier") == "away"), None)
            if not home or not away:
                continue

            status = event.get("sport_event_status", {}).get("status", "not_started")
            results.append({
                "provider_match_id": event.get("id", ""),
                "home_team_provider_id": home.get("id", ""),
                "away_team_provider_id": away.get("id", ""),
                "home_team_name": home.get("name", ""),
                "away_team_name": away.get("name", ""),
                "start_time": event.get("scheduled", ""),
                "phase": _map_sr_phase(status, sport).value,
                "venue": event.get("venue", {}).get("name", ""),
            })
        return results

    # ── Parsing helpers ─────────────────────────────────────────────────

    def _parse_summary_to_scoreboard(
        self, data: dict[str, Any], sport: Sport
    ) -> MatchScoreboard:
        """Parse Sportradar summary JSON into MatchScoreboard."""
        se = data.get("sport_event", {})
        ses = data.get("sport_event_status", {})

        match_sr_id = se.get("id", "")
        match_id = uuid.uuid5(uuid.NAMESPACE_URL, f"sr:match:{match_sr_id}")

        competitors = se.get("competitors", [])
        home_data = next((c for c in competitors if c.get("qualifier") == "home"), {})
        away_data = next((c for c in competitors if c.get("qualifier") == "away"), {})

        home_score = int(ses.get("home_score", 0))
        away_score = int(ses.get("away_score", 0))

        breakdown: list[ScoreBreakdown] = []
        period_scores = ses.get("period_scores", [])
        for ps in period_scores:
            breakdown.append(ScoreBreakdown(
                period=str(ps.get("number", ps.get("type", ""))),
                home=int(ps.get("home_score", 0)),
                away=int(ps.get("away_score", 0)),
            ))

        status = ses.get("status", "not_started")
        phase = _map_sr_phase(status, sport)
        clock = ses.get("clock", {})
        clock_display = ""
        if isinstance(clock, dict):
            played = clock.get("played", clock.get("match_time", ""))
            clock_display = str(played)
        elif isinstance(clock, str):
            clock_display = clock

        scheduled = se.get("scheduled", "")
        try:
            start_time = datetime.fromisoformat(scheduled.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            start_time = datetime.now(timezone.utc)

        season = se.get("season", se.get("tournament", {}))
        league_name = season.get("name", "")
        league_id_raw = season.get("id", se.get("tournament", {}).get("id", ""))

        return MatchScoreboard(
            match_id=match_id,
            league=LeagueRef(
                id=uuid.uuid5(uuid.NAMESPACE_URL, f"sr:league:{league_id_raw}"),
                name=league_name,
                sport=sport,
                country="",
            ),
            home_team=TeamRef(
                id=uuid.uuid5(uuid.NAMESPACE_URL, f"sr:team:{home_data.get('id', '')}"),
                name=home_data.get("name", ""),
                short_name=home_data.get("abbreviation", home_data.get("name", "")[:3].upper()),
            ),
            away_team=TeamRef(
                id=uuid.uuid5(uuid.NAMESPACE_URL, f"sr:team:{away_data.get('id', '')}"),
                name=away_data.get("name", ""),
                short_name=away_data.get("abbreviation", away_data.get("name", "")[:3].upper()),
            ),
            score=Score(home=home_score, away=away_score, breakdown=breakdown),
            phase=phase,
            clock=clock_display if clock_display else None,
            start_time=start_time,
        )

    def _parse_timeline(
        self, data: dict[str, Any], match_provider_id: str, sport: Sport
    ) -> list[MatchEvent]:
        """Parse Sportradar timeline events."""
        match_id = uuid.uuid5(uuid.NAMESPACE_URL, f"sr:match:{match_provider_id}")
        events: list[MatchEvent] = []
        timeline = data.get("timeline", [])

        for idx, entry in enumerate(timeline):
            et = entry.get("type", "")
            if not et:
                continue

            minute = entry.get("match_time", entry.get("time"))
            if isinstance(minute, str) and ":" in minute:
                parts = minute.split(":")
                try:
                    minute = int(parts[0])
                except ValueError:
                    minute = None
            elif isinstance(minute, (int, float)):
                minute = int(minute)
            else:
                minute = None

            team_data = entry.get("team", entry.get("competitor", {}))
            team_id = None
            if team_data and team_data.get("id"):
                team_id = uuid.uuid5(uuid.NAMESPACE_URL, f"sr:team:{team_data['id']}")

            players = entry.get("players", entry.get("participants", []))
            player_name = None
            if players and isinstance(players, list) and len(players) > 0:
                p = players[0]
                player_name = p.get("name", p.get("full_name", ""))

            events.append(MatchEvent(
                match_id=match_id,
                event_type=_map_sr_event_type(et),
                minute=minute,
                period=str(entry.get("period", "")),
                team_id=team_id,
                player_name=player_name,
                detail=entry.get("commentary", entry.get("description", et)),
                score_home=entry.get("home_score"),
                score_away=entry.get("away_score"),
                synthetic=False,
                source_provider=ProviderName.SPORTRADAR,
                provider_event_id=str(entry.get("id", idx)),
                seq=idx,
            ))

        return events

    def _parse_stats(
        self, data: dict[str, Any], match_provider_id: str, sport: Sport
    ) -> MatchStats:
        """Parse team statistics from Sportradar summary."""
        match_id = uuid.uuid5(uuid.NAMESPACE_URL, f"sr:match:{match_provider_id}")

        statistics = data.get("statistics", {})
        totals = statistics.get("totals", {})
        competitors = totals.get("competitors", [])

        home_stats = TeamStats()
        away_stats = TeamStats()

        for comp in competitors:
            qualifier = comp.get("qualifier", "")
            stats = comp.get("statistics", {})

            ts = TeamStats(
                possession=stats.get("ball_possession"),
                shots=stats.get("total_shots", stats.get("shots_total")),
                shots_on_target=stats.get("shots_on_target"),
                corners=stats.get("corner_kicks"),
                fouls=stats.get("fouls"),
                offsides=stats.get("offsides"),
                yellow_cards=stats.get("yellow_cards"),
                red_cards=stats.get("red_cards"),
                rebounds=stats.get("rebounds"),
                assists=stats.get("assists"),
                turnovers=stats.get("turnovers"),
                steals=stats.get("steals"),
                blocks=stats.get("blocked_shots", stats.get("blocks")),
                extra=stats,
            )
            if qualifier == "home":
                home_stats = ts
            else:
                away_stats = ts

        return MatchStats(match_id=match_id, home_stats=home_stats, away_stats=away_stats)
