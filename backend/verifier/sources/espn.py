"""
ESPN verification source using public scoreboard API.
Uses structured JSON endpoints; no HTML scraping.
"""
from __future__ import annotations

import time
from typing import Any, Optional

import httpx
from shared.utils.logging import get_logger

from verifier.sources.base import CanonicalMatchState, VerificationSource

logger = get_logger(__name__)

ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports"

# Map ESPN status to canonical phase string (aligned with MatchPhase)
ESPN_STATUS_TO_PHASE: dict[str, str] = {
    "STATUS_SCHEDULED": "scheduled",
    "STATUS_IN_PROGRESS": "live_first_half",
    "STATUS_HALFTIME": "live_halftime",
    "STATUS_END_PERIOD": "break",
    "STATUS_FINAL": "finished",
    "STATUS_FULL_TIME": "finished",
    "STATUS_POSTPONED": "postponed",
    "STATUS_CANCELED": "cancelled",
    "STATUS_DELAYED": "suspended",
    "STATUS_RAIN_DELAY": "suspended",
}


def _resolve_phase(espn_status: str, period: int, sport: str) -> str:
    if espn_status in ("STATUS_FINAL", "STATUS_FULL_TIME"):
        return "finished"
    if espn_status == "STATUS_SCHEDULED":
        return "scheduled"
    if espn_status in ("STATUS_POSTPONED",):
        return "postponed"
    if espn_status in ("STATUS_CANCELED",):
        return "cancelled"
    if espn_status in ("STATUS_DELAYED", "STATUS_RAIN_DELAY"):
        return "suspended"
    if espn_status == "STATUS_HALFTIME":
        return "live_halftime"
    if espn_status == "STATUS_END_PERIOD":
        return "break"
    if espn_status == "STATUS_IN_PROGRESS":
        if sport == "basketball":
            if period > 4:
                return "live_ot"
            return {1: "live_q1", 2: "live_q2", 3: "live_q3", 4: "live_q4"}.get(period, "live_q1")
        if sport == "hockey":
            if period > 3:
                return "live_ot"
            return {1: "live_p1", 2: "live_p2", 3: "live_p3"}.get(period, "live_p1")
        if sport == "baseball":
            return "live_inning"
        if period == 1:
            return "live_first_half"
        if period == 2:
            return "live_second_half"
        return "live_first_half"
    return "scheduled"


def _event_to_canonical(event: dict[str, Any], sport: str, fetched_at: float) -> Optional[CanonicalMatchState]:
    comp = event.get("competitions", [{}])[0]
    competitors = comp.get("competitors", [])
    if len(competitors) < 2:
        return None
    score_home = score_away = 0
    for c in competitors:
        try:
            sc = int(c.get("score", "0"))
        except (ValueError, TypeError):
            sc = 0
        if c.get("homeAway") == "home":
            score_home = sc
        else:
            score_away = sc
    status_obj = comp.get("status", event.get("status", {}))
    espn_status = status_obj.get("type", {}).get("name", "STATUS_SCHEDULED")
    period = int(status_obj.get("period", 0))
    phase = _resolve_phase(espn_status, period, sport)
    clock = status_obj.get("displayClock")
    return CanonicalMatchState(
        score_home=score_home,
        score_away=score_away,
        phase=phase,
        clock=clock,
        period=str(period) if period else None,
        source="espn",
        fetched_at=fetched_at,
    )


class ESPNVerificationSource(VerificationSource):
    """Fetches from ESPN scoreboard API; matches by event id or team names."""

    def __init__(self, timeout_s: float = 10.0) -> None:
        self._timeout = timeout_s

    @property
    def source_name(self) -> str:
        return "espn"

    @property
    def base_url(self) -> str:
        return "site.api.espn.com"

    def _scoreboard_url(self, sport_league_path: str) -> str:
        return f"{ESPN_BASE}/{sport_league_path}/scoreboard"

    async def fetch_match_state(
        self,
        match_id: str,
        home_team_name: str,
        away_team_name: str,
        league_name: str,
        sport: str,
    ) -> Optional[CanonicalMatchState]:
        """Fetch state by matching team names in scoreboard. league_espn_path must be passed via league_name convention or we try common paths."""
        return None  # Engine will call fetch_league_scoreboard and match by names

    async def fetch_league_scoreboard(
        self,
        sport_league_path: str,
        sport: str,
    ) -> list[tuple[str, str, str, CanonicalMatchState]]:
        """
        Fetch full scoreboard for a league. Returns list of (home_name, away_name, espn_event_id, state).
        Caller matches to our matches by team names or espn_event_id.
        """
        url = self._scoreboard_url(sport_league_path)
        fetched_at = time.time()
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.get(url)
                if resp.status_code == 429:
                    raise httpx.HTTPStatusError("Rate limited", request=resp.request, response=resp)
                resp.raise_for_status()
                data = resp.json()
        except Exception as e:
            logger.debug("espn_fetch_error", url=url, error=str(e))
            return []

        events = data.get("events", [])
        result: list[tuple[str, str, str, CanonicalMatchState]] = []
        for event in events:
            espn_id = str(event.get("id", ""))
            comp = event.get("competitions", [{}])[0]
            competitors = comp.get("competitors", [])
            names = []
            for c in competitors:
                name = (c.get("team", {}).get("displayName") or c.get("team", {}).get("name") or "").strip()
                names.append((name, c.get("homeAway", "")))
            home_name = next((n for n, ha in names if ha == "home"), "")
            away_name = next((n for n, ha in names if ha == "away"), "")
            state = _event_to_canonical(event, sport, fetched_at)
            if state:
                result.append((home_name, away_name, espn_id, state))
        return result
