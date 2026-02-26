"""
ESPN provider connector.
Fetches data from ESPN's public APIs and normalizes to canonical domain models.
"""
from __future__ import annotations

import re
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

# ESPN sport slug mapping
_SPORT_SLUGS: dict[Sport, str] = {
    Sport.SOCCER: "soccer",
    Sport.BASKETBALL: "basketball",
    Sport.HOCKEY: "hockey",
    Sport.BASEBALL: "baseball",
    Sport.FOOTBALL: "football",
}

_LEAGUE_SLUGS: dict[str, tuple[str, str]] = {
    # league_provider_id -> (sport_slug, league_slug)
    # Soccer
    "eng.1": ("soccer", "eng.1"),
    "eng.2": ("soccer", "eng.2"),
    "eng.fa": ("soccer", "eng.fa"),
    "eng.league_cup": ("soccer", "eng.league_cup"),
    "usa.1": ("soccer", "usa.1"),
    "esp.1": ("soccer", "esp.1"),
    "ger.1": ("soccer", "ger.1"),
    "ita.1": ("soccer", "ita.1"),
    "fra.1": ("soccer", "fra.1"),
    "ned.1": ("soccer", "ned.1"),
    "por.1": ("soccer", "por.1"),
    "tur.1": ("soccer", "tur.1"),
    "sco.1": ("soccer", "sco.1"),
    "sau.1": ("soccer", "sau.1"),
    "uefa.champions": ("soccer", "uefa.champions"),
    "uefa.europa": ("soccer", "uefa.europa"),
    "uefa.europa.conf": ("soccer", "uefa.europa.conf"),
    # Basketball
    "nba": ("basketball", "nba"),
    "wnba": ("basketball", "wnba"),
    "mens-college-basketball": ("basketball", "mens-college-basketball"),
    "womens-college-basketball": ("basketball", "womens-college-basketball"),
    # Hockey
    "nhl": ("hockey", "nhl"),
    # Baseball
    "mlb": ("baseball", "mlb"),
    # Football
    "nfl": ("football", "nfl"),
}


def _parse_soccer_clock_minute(clock: str) -> Optional[int]:
    """Parse minute from soccer clock (e.g. \"111'\", \"45+3'\"). Returns None if unparseable."""
    if not clock:
        return None
    s = clock.strip()
    plus = re.match(r"^(\d+)\s*\+\s*(\d+)\s*'?", s)
    if plus:
        return int(plus.group(1)) + int(plus.group(2))
    simple = re.search(r"(\d+)\s*'?", s)
    return int(simple.group(1)) if simple else None


def _parse_espn_phase(
    status_type: str, status_detail: str, sport: Sport, display_clock: Optional[str] = None
) -> MatchPhase:
    """Map ESPN status codes to canonical MatchPhase."""
    status_type = status_type.lower()
    detail = status_detail.lower()

    if status_type == "pre":
        return MatchPhase.SCHEDULED
    if status_type == "post":
        return MatchPhase.FINISHED
    if status_type == "postponed":
        return MatchPhase.POSTPONED
    if status_type == "cancelled":
        return MatchPhase.CANCELLED
    if status_type == "suspended":
        return MatchPhase.SUSPENDED

    # Live states by sport
    if status_type == "in":
        if sport == Sport.SOCCER:
            if "half" in detail and "2" in detail:
                return MatchPhase.LIVE_SECOND_HALF
            if "half" in detail:
                return MatchPhase.LIVE_HALFTIME if "time" in detail else MatchPhase.LIVE_FIRST_HALF
            if "extra" in detail:
                return MatchPhase.LIVE_EXTRA_TIME
            if "penal" in detail:
                return MatchPhase.LIVE_PENALTIES
            # Default first half only if clock does not indicate a later period
            minute = _parse_soccer_clock_minute(display_clock or status_detail)
            if minute is not None:
                if minute > 90:
                    return MatchPhase.LIVE_EXTRA_TIME
                if minute > 45:
                    return MatchPhase.LIVE_SECOND_HALF
            return MatchPhase.LIVE_FIRST_HALF

        if sport == Sport.BASKETBALL:
            if "1st" in detail:
                return MatchPhase.LIVE_Q1
            if "2nd" in detail:
                return MatchPhase.LIVE_Q2
            if "3rd" in detail:
                return MatchPhase.LIVE_Q3
            if "4th" in detail:
                return MatchPhase.LIVE_Q4
            if "ot" in detail or "overtime" in detail:
                return MatchPhase.LIVE_OT
            if "half" in detail:
                return MatchPhase.BREAK
            return MatchPhase.LIVE_Q1

        if sport == Sport.HOCKEY:
            if "1st" in detail:
                return MatchPhase.LIVE_P1
            if "2nd" in detail:
                return MatchPhase.LIVE_P2
            if "3rd" in detail:
                return MatchPhase.LIVE_P3
            if "ot" in detail:
                return MatchPhase.LIVE_OT
            return MatchPhase.LIVE_P1

        if sport == Sport.BASEBALL:
            return MatchPhase.LIVE_INNING

        if sport == Sport.FOOTBALL:
            if "1st" in detail:
                return MatchPhase.LIVE_Q1
            if "2nd" in detail:
                return MatchPhase.LIVE_Q2
            if "3rd" in detail:
                return MatchPhase.LIVE_Q3
            if "4th" in detail:
                return MatchPhase.LIVE_Q4
            if "ot" in detail or "overtime" in detail:
                return MatchPhase.LIVE_OT
            if "half" in detail:
                return MatchPhase.BREAK
            return MatchPhase.LIVE_Q1

    return MatchPhase.SCHEDULED


def _parse_espn_event_type(play_type: str, sport: Sport) -> EventType:
    """Map ESPN play type strings to canonical EventType."""
    pt = play_type.lower()
    mapping: dict[str, EventType] = {
        "goal": EventType.GOAL,
        "assist": EventType.ASSIST,
        "yellow card": EventType.YELLOW_CARD,
        "red card": EventType.RED_CARD,
        "substitution": EventType.SUBSTITUTION,
        "penalty - Loss": EventType.PENALTY,
        "penalty kick": EventType.PENALTY,
        "penalty - Loss - Loss": EventType.PENALTY_MISS,
        "own goal": EventType.OWN_GOAL,
        "var": EventType.VAR_DECISION,
        "shot": EventType.SHOT,
        "foul": EventType.FOUL,
        "corner kick": EventType.CORNER,
        "offside": EventType.OFFSIDE,
        "free kick": EventType.FREE_KICK,
        "throw in": EventType.THROW_IN,
        "timeout": EventType.TIMEOUT,
        "field goal": EventType.BASKET,
        "three point": EventType.THREE_POINTER,
        "free throw": EventType.FREE_THROW,
        "rebound": EventType.REBOUND,
        "turnover": EventType.TURNOVER,
        "steal": EventType.STEAL,
        "block": EventType.BLOCK,
        "home run": EventType.HOME_RUN,
        "strikeout": EventType.STRIKEOUT,
        "walk": EventType.WALK,
        "hit": EventType.HIT,
    }
    for key, val in mapping.items():
        if key in pt:
            return val
    return EventType.GENERIC


class ESPNProvider(BaseProvider):
    """ESPN data provider connector."""

    ESPN_BASE_URL = "https://site.api.espn.com/apis/site/v2/sports"

    def __init__(self, redis: RedisManager, api_key: str = "", rpm_limit: int = 600) -> None:
        http_client = ProviderHTTPClient(
            provider_name="espn",
            base_url=self.ESPN_BASE_URL,
            api_key=api_key,
            timeout_s=8.0,
            max_retries=2,
        )
        super().__init__(
            name=ProviderName.ESPN,
            http_client=http_client,
            redis=redis,
            supported_sports={Sport.SOCCER, Sport.BASKETBALL, Sport.HOCKEY, Sport.BASEBALL, Sport.FOOTBALL},
            rpm_limit=rpm_limit,
        )

    def _build_path(self, sport: Sport, league_id: str, suffix: str = "") -> str:
        """Build ESPN API path from sport and league identifiers."""
        slug_info = _LEAGUE_SLUGS.get(league_id)
        if slug_info:
            sport_slug, league_slug = slug_info
        else:
            sport_slug = _SPORT_SLUGS.get(sport, "soccer")
            league_slug = league_id
        path = f"/{sport_slug}/{league_slug}{suffix}"
        return path

    async def _fetch_scoreboard(
        self, sport: Sport, league_provider_id: str, match_provider_id: str
    ) -> ProviderResult:
        """Fetch scoreboard from ESPN scoreboard endpoint and extract the target match."""
        path = self._build_path(sport, league_provider_id, "/scoreboard")
        resp = await self._http.get(path, sport=sport.value, tier="scoreboard")
        data = resp.json()

        events = data.get("events", [])
        target = None
        for event in events:
            if str(event.get("id")) == match_provider_id:
                target = event
                break

        if not target:
            return ProviderResult(
                provider=self._name,
                tier=Tier.SCOREBOARD,
                success=False,
                latency_ms=0,
                error=f"Match {match_provider_id} not found in scoreboard",
            )

        scoreboard = self._parse_scoreboard_event(target, sport, league_provider_id)
        return ProviderResult(
            provider=self._name,
            tier=Tier.SCOREBOARD,
            success=True,
            latency_ms=0,
            scoreboard=scoreboard,
            raw=target,
        )

    async def _fetch_events(
        self, sport: Sport, league_provider_id: str, match_provider_id: str
    ) -> ProviderResult:
        """Fetch play-by-play events from ESPN event detail endpoint."""
        slug_info = _LEAGUE_SLUGS.get(league_provider_id)
        if slug_info:
            sport_slug, league_slug = slug_info
        else:
            sport_slug = _SPORT_SLUGS.get(sport, "soccer")
            league_slug = league_provider_id

        path = f"/{sport_slug}/{league_slug}/summary"
        resp = await self._http.get(
            path,
            params={"event": match_provider_id},
            sport=sport.value,
            tier="events",
        )
        data = resp.json()

        parsed_events: list[MatchEvent] = []
        plays = data.get("plays", data.get("keyEvents", []))
        for idx, play in enumerate(plays):
            evt = self._parse_play_to_event(play, match_provider_id, sport, idx)
            if evt:
                parsed_events.append(evt)

        return ProviderResult(
            provider=self._name,
            tier=Tier.EVENTS,
            success=True,
            latency_ms=0,
            events=parsed_events,
            raw=data,
        )

    async def _fetch_stats(
        self, sport: Sport, league_provider_id: str, match_provider_id: str
    ) -> ProviderResult:
        """Fetch match statistics from ESPN summary endpoint."""
        slug_info = _LEAGUE_SLUGS.get(league_provider_id)
        if slug_info:
            sport_slug, league_slug = slug_info
        else:
            sport_slug = _SPORT_SLUGS.get(sport, "soccer")
            league_slug = league_provider_id

        path = f"/{sport_slug}/{league_slug}/summary"
        resp = await self._http.get(
            path,
            params={"event": match_provider_id},
            sport=sport.value,
            tier="stats",
        )
        data = resp.json()

        stats = self._parse_team_stats(data, match_provider_id, sport)
        return ProviderResult(
            provider=self._name,
            tier=Tier.STATS,
            success=True,
            latency_ms=0,
            stats=stats,
            raw=data,
        )

    async def fetch_league_schedule(
        self, sport: Sport, league_provider_id: str, date_str: str
    ) -> list[dict[str, Any]]:
        """Fetch daily schedule from ESPN scoreboard endpoint."""
        path = self._build_path(sport, league_provider_id, "/scoreboard")
        resp = await self._http.get(
            path,
            params={"dates": date_str.replace("-", "")},
            sport=sport.value,
            tier="schedule",
        )
        data = resp.json()
        results: list[dict[str, Any]] = []
        for event in data.get("events", []):
            competitions = event.get("competitions", [])
            if not competitions:
                continue
            comp = competitions[0]
            competitors = comp.get("competitors", [])
            home = next((c for c in competitors if c.get("homeAway") == "home"), None)
            away = next((c for c in competitors if c.get("homeAway") == "away"), None)
            if not home or not away:
                continue

            status = comp.get("status", {})
            status_type = status.get("type", {}).get("name", "pre")
            status_detail = status.get("type", {}).get("detail", "")

            results.append({
                "provider_match_id": str(event.get("id")),
                "home_team_provider_id": str(home.get("id")),
                "away_team_provider_id": str(away.get("id")),
                "home_team_name": home.get("team", {}).get("displayName", ""),
                "away_team_name": away.get("team", {}).get("displayName", ""),
                "start_time": event.get("date", ""),
                "phase": _parse_espn_phase(status_type, status_detail, sport).value,
                "venue": comp.get("venue", {}).get("fullName", ""),
            })
        return results

    # ── Parsing helpers ─────────────────────────────────────────────────

    def _parse_scoreboard_event(
        self, event: dict[str, Any], sport: Sport, league_id: str
    ) -> MatchScoreboard:
        """Parse a single ESPN scoreboard event into a MatchScoreboard."""
        comp = event.get("competitions", [{}])[0]
        competitors = comp.get("competitors", [])
        home_data = next((c for c in competitors if c.get("homeAway") == "home"), {})
        away_data = next((c for c in competitors if c.get("homeAway") == "away"), {})

        home_score = int(home_data.get("score", "0"))
        away_score = int(away_data.get("score", "0"))

        # Parse period scores
        breakdown: list[ScoreBreakdown] = []
        for idx, ls in enumerate(home_data.get("linescores", [])):
            away_ls = away_data.get("linescores", [])
            away_val = int(away_ls[idx].get("value", 0)) if idx < len(away_ls) else 0
            breakdown.append(ScoreBreakdown(
                period=str(idx + 1),
                home=int(ls.get("value", 0)),
                away=away_val,
            ))

        status = comp.get("status", {})
        status_type = status.get("type", {}).get("name", "pre")
        status_detail = status.get("type", {}).get("detail", "")
        clock = status.get("displayClock", "")
        phase = _parse_espn_phase(status_type, status_detail, sport, display_clock=clock)

        start_str = event.get("date", "")
        try:
            start_time = datetime.fromisoformat(start_str.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            start_time = datetime.now(timezone.utc)

        # Use provider IDs as placeholders — the normalization layer maps to canonical UUIDs
        match_id = uuid.uuid5(uuid.NAMESPACE_URL, f"espn:match:{event.get('id')}")
        league_uuid = uuid.uuid5(uuid.NAMESPACE_URL, f"espn:league:{league_id}")

        home_team = home_data.get("team", {})
        away_team = away_data.get("team", {})

        return MatchScoreboard(
            match_id=match_id,
            league=LeagueRef(
                id=league_uuid,
                name=event.get("season", {}).get("type", {}).get("name", league_id),
                sport=sport,
                country="",
            ),
            home_team=TeamRef(
                id=uuid.uuid5(uuid.NAMESPACE_URL, f"espn:team:{home_team.get('id', '')}"),
                name=home_team.get("displayName", ""),
                short_name=home_team.get("shortDisplayName", ""),
                logo_url=home_team.get("logo", ""),
            ),
            away_team=TeamRef(
                id=uuid.uuid5(uuid.NAMESPACE_URL, f"espn:team:{away_team.get('id', '')}"),
                name=away_team.get("displayName", ""),
                short_name=away_team.get("shortDisplayName", ""),
                logo_url=away_team.get("logo", ""),
            ),
            score=Score(home=home_score, away=away_score, breakdown=breakdown),
            phase=phase,
            clock=clock if clock else None,
            start_time=start_time,
        )

    def _parse_play_to_event(
        self, play: dict[str, Any], match_provider_id: str, sport: Sport, seq: int
    ) -> Optional[MatchEvent]:
        """Parse a single ESPN play into a MatchEvent."""
        play_type = play.get("type", {}).get("text", "")
        if not play_type:
            return None

        match_id = uuid.uuid5(uuid.NAMESPACE_URL, f"espn:match:{match_provider_id}")
        play_id = play.get("id", str(seq))

        clock_val = play.get("clock", {})
        minute = None
        second = None
        if isinstance(clock_val, dict):
            display = clock_val.get("displayValue", "")
            if ":" in display:
                parts = display.split(":")
                try:
                    minute = int(parts[0])
                    second = int(parts[1]) if len(parts) > 1 else 0
                except ValueError:
                    pass
        elif isinstance(clock_val, (int, float)):
            total_seconds = int(clock_val)
            minute = total_seconds // 60
            second = total_seconds % 60

        period = play.get("period", {})
        period_str = str(period.get("number", "")) if isinstance(period, dict) else str(period)

        team_data = play.get("team", {})
        team_id = None
        if team_data and team_data.get("id"):
            team_id = uuid.uuid5(uuid.NAMESPACE_URL, f"espn:team:{team_data['id']}")

        athletes = play.get("participants", play.get("athletes", []))
        player_name = None
        if athletes and isinstance(athletes, list) and len(athletes) > 0:
            first = athletes[0]
            if isinstance(first, dict):
                athlete = first.get("athlete", first)
                player_name = athlete.get("displayName", athlete.get("fullName", ""))

        score_val = play.get("scoreValue", play.get("score", None))
        score_home = play.get("homeScore")
        score_away = play.get("awayScore")

        return MatchEvent(
            match_id=match_id,
            event_type=_parse_espn_event_type(play_type, sport),
            minute=minute,
            second=second,
            period=period_str if period_str else None,
            team_id=team_id,
            player_name=player_name,
            detail=play.get("text", play_type),
            score_home=score_home,
            score_away=score_away,
            synthetic=False,
            source_provider=ProviderName.ESPN,
            provider_event_id=str(play_id),
            seq=seq,
        )

    def _parse_team_stats(
        self, data: dict[str, Any], match_provider_id: str, sport: Sport
    ) -> MatchStats:
        """Parse team stats from ESPN summary data."""
        match_id = uuid.uuid5(uuid.NAMESPACE_URL, f"espn:match:{match_provider_id}")

        boxscore = data.get("boxscore", {})
        teams_data = boxscore.get("teams", [])

        home_stats = TeamStats()
        away_stats = TeamStats()

        for team_data in teams_data:
            is_home = team_data.get("homeAway", "") == "home"
            stats_list = team_data.get("statistics", [])
            stats_dict: dict[str, Any] = {}
            for stat in stats_list:
                name = stat.get("name", stat.get("label", "")).lower().replace(" ", "_")
                val = stat.get("displayValue", stat.get("value", "0"))
                try:
                    if "." in str(val):
                        stats_dict[name] = float(val.strip("%"))
                    else:
                        stats_dict[name] = int(val)
                except (ValueError, TypeError):
                    stats_dict[name] = val

            ts = TeamStats(
                possession=stats_dict.get("possession", stats_dict.get("ball_possession")),
                shots=stats_dict.get("shots", stats_dict.get("total_shots")),
                shots_on_target=stats_dict.get("shots_on_target", stats_dict.get("shots_on_goal")),
                corners=stats_dict.get("corner_kicks", stats_dict.get("corners")),
                fouls=stats_dict.get("fouls"),
                offsides=stats_dict.get("offsides"),
                passes=stats_dict.get("total_passes"),
                pass_accuracy=stats_dict.get("passing_accuracy"),
                yellow_cards=stats_dict.get("yellow_cards"),
                red_cards=stats_dict.get("red_cards"),
                field_goal_pct=stats_dict.get("field_goal_pct", stats_dict.get("fg%")),
                three_point_pct=stats_dict.get("three_point_pct", stats_dict.get("3pt%")),
                free_throw_pct=stats_dict.get("free_throw_pct", stats_dict.get("ft%")),
                rebounds=stats_dict.get("rebounds", stats_dict.get("total_rebounds")),
                assists=stats_dict.get("assists"),
                turnovers=stats_dict.get("turnovers"),
                steals=stats_dict.get("steals"),
                blocks=stats_dict.get("blocks", stats_dict.get("blocked_shots")),
                extra=stats_dict,
            )
            if is_home:
                home_stats = ts
            else:
                away_stats = ts

        return MatchStats(
            match_id=match_id,
            home_stats=home_stats,
            away_stats=away_stats,
        )
