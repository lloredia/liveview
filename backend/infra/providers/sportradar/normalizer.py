"""
Normalize SportRadar API responses to ProviderMatch list.
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

# SportRadar status -> MatchStatus
SR_STATUS_MAP: Dict[str, MatchStatus] = {
    "not_started": MatchStatus.SCHEDULED,
    "scheduled": MatchStatus.SCHEDULED,
    "live": MatchStatus.LIVE,
    "inprogress": MatchStatus.LIVE,
    "halftime": MatchStatus.HALFTIME,
    "break": MatchStatus.BREAK,
    "closed": MatchStatus.FINISHED,
    "ended": MatchStatus.FINISHED,
    "complete": MatchStatus.FINISHED,
    "postponed": MatchStatus.POSTPONED,
    "canceled": MatchStatus.CANCELLED,
    "cancelled": MatchStatus.CANCELLED,
    "suspended": MatchStatus.SUSPENDED,
    "delayed": MatchStatus.SUSPENDED,
}


def _parse_scheduled(scheduled: Optional[str]) -> datetime:
    if not scheduled:
        return datetime.now(timezone.utc)
    try:
        return datetime.fromisoformat(scheduled.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return datetime.now(timezone.utc)


def _status_to_match_status(sr_status: Optional[str]) -> MatchStatus:
    if not sr_status:
        return MatchStatus.SCHEDULED
    key = (sr_status or "").strip().lower()
    return SR_STATUS_MAP.get(key, MatchStatus.SCHEDULED)


def normalize_schedule(
    raw_data: Dict[str, Any],
    league_slug: str,
    provider_name: str = "sportradar",
    include_raw: bool = False,
) -> List[ProviderMatch]:
    """Convert SportRadar schedule JSON to list of ProviderMatch."""
    events = raw_data.get("sport_events", raw_data.get("games", []))
    if not isinstance(events, list):
        events = []

    result: List[ProviderMatch] = []
    for event in events:
        if not isinstance(event, dict):
            continue
        event_id = event.get("id", "")
        if not event_id:
            continue

        competitors = event.get("competitors", event.get("competitors", []))
        if not isinstance(competitors, list) or len(competitors) < 2:
            home_data: Dict[str, Any] = {}
            away_data: Dict[str, Any] = {}
        else:
            home_data = next(
                (c for c in competitors if c.get("qualifier") == "home" or c.get("home_away") == "home"),
                competitors[0],
            )
            away_data = next(
                (c for c in competitors if c.get("qualifier") == "away" or c.get("home_away") == "away"),
                competitors[1],
            )

        status_obj = event.get("sport_event_status", event.get("status", {}))
        if not isinstance(status_obj, dict):
            status_obj = {}
        sr_status = status_obj.get("status", status_obj.get("state", "not_started"))
        home_score = int(status_obj.get("home_score", status_obj.get("home", 0)))
        away_score = int(status_obj.get("away_score", status_obj.get("away", 0)))
        clock = status_obj.get("clock")
        if isinstance(clock, dict):
            clock = clock.get("played", clock.get("match_time", clock.get("display_clock")))
        period = status_obj.get("period", status_obj.get("inning", status_obj.get("quarter")))
        if period is not None:
            period = str(period)

        home_name = home_data.get("name", home_data.get("display_name", "Home"))
        away_name = away_data.get("name", away_data.get("display_name", "Away"))
        scheduled = event.get("scheduled", event.get("start_time", event.get("scheduled_time", "")))

        match = ProviderMatch(
            provider_id=str(event_id),
            provider_name=provider_name,
            home_team=ProviderTeam(
                name=home_name,
                short_name=home_data.get("abbreviation", home_name[:3].upper() if home_name else "HOM"),
                abbreviation=home_data.get("abbreviation"),
            ),
            away_team=ProviderTeam(
                name=away_name,
                short_name=away_data.get("abbreviation", away_name[:3].upper() if away_name else "AWY"),
                abbreviation=away_data.get("abbreviation"),
            ),
            score=ProviderScore(home=home_score, away=away_score),
            status=_status_to_match_status(sr_status),
            clock=str(clock) if clock is not None else None,
            period=period,
            scheduled_at=_parse_scheduled(scheduled),
            raw=event if include_raw else None,
        )
        result.append(match)

    return result
