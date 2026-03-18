"""Shared match-phase resolution helpers used across live refresh and verification."""
from __future__ import annotations

from shared.models.enums import MatchPhase

BASKETBALL_QUARTER_PHASE = {
    1: MatchPhase.LIVE_Q1,
    2: MatchPhase.LIVE_Q2,
    3: MatchPhase.LIVE_Q3,
    4: MatchPhase.LIVE_Q4,
}

BASKETBALL_HALF_PHASE = {
    1: MatchPhase.LIVE_H1,
    2: MatchPhase.LIVE_H2,
}

HOCKEY_PERIOD_PHASE = {
    1: MatchPhase.LIVE_P1,
    2: MatchPhase.LIVE_P2,
    3: MatchPhase.LIVE_P3,
}

HALVES_BASKETBALL_LEAGUES = {"mens-college-basketball"}


def resolve_espn_phase(
    espn_status: str,
    period_num: int,
    sport: str,
    espn_league_id: str = "",
) -> MatchPhase:
    """Map ESPN status + period + sport + league to the canonical MatchPhase."""
    if espn_status in ("STATUS_FINAL", "STATUS_FULL_TIME"):
        return MatchPhase.FINISHED
    if espn_status == "STATUS_SCHEDULED":
        return MatchPhase.SCHEDULED
    if espn_status in ("STATUS_POSTPONED",):
        return MatchPhase.POSTPONED
    if espn_status in ("STATUS_CANCELED",):
        return MatchPhase.CANCELLED
    if espn_status in ("STATUS_DELAYED", "STATUS_RAIN_DELAY"):
        return MatchPhase.SUSPENDED
    if espn_status == "STATUS_HALFTIME":
        return MatchPhase.LIVE_HALFTIME
    if espn_status == "STATUS_END_PERIOD":
        return MatchPhase.BREAK

    if sport == "basketball":
        if espn_league_id in HALVES_BASKETBALL_LEAGUES:
            if period_num > 2:
                return MatchPhase.LIVE_OT
            return BASKETBALL_HALF_PHASE.get(period_num, MatchPhase.LIVE_H1)
        if period_num > 4:
            return MatchPhase.LIVE_OT
        return BASKETBALL_QUARTER_PHASE.get(period_num, MatchPhase.LIVE_Q1)
    if sport == "hockey":
        if period_num > 3:
            return MatchPhase.LIVE_OT
        return HOCKEY_PERIOD_PHASE.get(period_num, MatchPhase.LIVE_P1)
    if sport == "football":
        if period_num > 4:
            return MatchPhase.LIVE_OT
        return BASKETBALL_QUARTER_PHASE.get(period_num, MatchPhase.LIVE_Q1)
    if sport == "baseball":
        return MatchPhase.LIVE_INNING
    if period_num == 1:
        return MatchPhase.LIVE_FIRST_HALF
    if period_num == 2:
        return MatchPhase.LIVE_SECOND_HALF
    if period_num == 3:
        return MatchPhase.LIVE_EXTRA_TIME
    return MatchPhase.LIVE_FIRST_HALF

