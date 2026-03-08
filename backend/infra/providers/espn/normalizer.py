"""
Normalize ESPN API responses to ProviderMatch list.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from infra.providers.base import (
    MatchStatus,
    ProviderMatch,
    ProviderScore,
    ProviderTeam,
)

# ESPN status.type.name -> MatchStatus
ESPN_STATUS_MAP: Dict[str, MatchStatus] = {
    "STATUS_SCHEDULED": MatchStatus.SCHEDULED,
    "STATUS_PRE": MatchStatus.PRE_MATCH,
    "STATUS_IN_PROGRESS": MatchStatus.LIVE,
    "STATUS_2ND_HALF": MatchStatus.LIVE,
    "STATUS_OVERTIME": MatchStatus.LIVE,
    "STATUS_HALFTIME": MatchStatus.HALFTIME,
    "STATUS_END_PERIOD": MatchStatus.BREAK,
    "STATUS_RAIN_DELAY": MatchStatus.SUSPENDED,
    "STATUS_DELAYED": MatchStatus.SUSPENDED,
    "STATUS_FINAL": MatchStatus.FINISHED,
    "STATUS_FINAL_OT": MatchStatus.FINISHED,
    "STATUS_FINAL_PEN": MatchStatus.FINISHED,
    "STATUS_FULL_TIME": MatchStatus.FINISHED,
    "STATUS_POSTPONED": MatchStatus.POSTPONED,
    "STATUS_CANCELED": MatchStatus.CANCELLED,
    "STATUS_CANCELLED": MatchStatus.CANCELLED,
    "STATUS_SUSPENDED": MatchStatus.SUSPENDED,
    "STATUS_FORFEIT": MatchStatus.CANCELLED,
    "STATUS_POST": MatchStatus.FINISHED,
}


def _parse_scheduled(scheduled: Optional[str]) -> datetime:
    if not scheduled:
        return datetime.now(timezone.utc)
    try:
        return datetime.fromisoformat(scheduled.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return datetime.now(timezone.utc)


def _competitor_score(competitor: Dict[str, Any]) -> int:
    try:
        sc = int(competitor.get("score", 0))
    except (ValueError, TypeError):
        sc = 0
    if sc > 0:
        return sc
    for ls in competitor.get("linescores", []) or []:
        if isinstance(ls, dict):
            val = ls.get("displayValue", ls.get("value"))
            if val is not None:
                try:
                    sc += int(val)
                except (ValueError, TypeError):
                    pass
    return sc


def normalize_espn_events(
    events: List[Dict[str, Any]],
    provider_name: str = "espn",
) -> List[ProviderMatch]:
    """Convert ESPN scoreboard events array to list of ProviderMatch."""
    result: List[ProviderMatch] = []
    for event in events:
        if not isinstance(event, dict):
            continue
        event_id = event.get("id", "")
        if not event_id:
            continue

        competitions = event.get("competitions", [])
        if not isinstance(competitions, list) or not competitions:
            continue
        comp = competitions[0]
        competitors = comp.get("competitors", [])
        if len(competitors) < 2:
            continue

        home_c = next((c for c in competitors if c.get("homeAway") == "home"), competitors[0])
        away_c = next((c for c in competitors if c.get("homeAway") == "away"), competitors[1])
        home_team_data = home_c.get("team", home_c)
        away_team_data = away_c.get("team", away_c)

        home_name = home_team_data.get("displayName", home_team_data.get("name", "Home"))
        away_name = away_team_data.get("displayName", away_team_data.get("name", "Away"))
        home_short = home_team_data.get("shortDisplayName", home_team_data.get("abbreviation", str(home_name)[:3].upper()))
        away_short = away_team_data.get("shortDisplayName", away_team_data.get("abbreviation", str(away_name)[:3].upper()))

        score_home = _competitor_score(home_c)
        score_away = _competitor_score(away_c)

        status_obj = comp.get("status", event.get("status", {}))
        if not isinstance(status_obj, dict):
            status_obj = {}
        type_obj = status_obj.get("type", {})
        if not isinstance(type_obj, dict):
            type_obj = {}
        espn_status = type_obj.get("name", "STATUS_SCHEDULED")
        status = ESPN_STATUS_MAP.get(espn_status, MatchStatus.SCHEDULED)
        clock = status_obj.get("displayClock")
        period = status_obj.get("period")
        if period is not None:
            period = str(period)

        scheduled = event.get("date") or (comp.get("date", ""))
        scheduled_dt = _parse_scheduled(scheduled)

        match = ProviderMatch(
            provider_id=str(event_id),
            provider_name=provider_name,
            home_team=ProviderTeam(name=home_name, short_name=home_short),
            away_team=ProviderTeam(name=away_name, short_name=away_short),
            score=ProviderScore(home=score_home, away=score_away),
            status=status,
            clock=str(clock) if clock is not None else None,
            period=period,
            scheduled_at=scheduled_dt,
            raw=None,
        )
        result.append(match)

    return result
