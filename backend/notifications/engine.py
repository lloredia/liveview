"""
Notification event detection engine.

Compares prev_state vs next_state for a game and produces NotificationEvent
objects. Handles dedupe, rate-limiting, bundling, and quiet-hours filtering.
"""
from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from shared.utils.logging import get_logger

logger = get_logger(__name__)


class EventType(str, Enum):
    SCORE_UPDATE = "score_update"
    LEAD_CHANGE = "lead_change"
    GAME_START = "game_start"
    HALFTIME = "halftime"
    OVERTIME_START = "overtime_start"
    FINAL = "final"
    MAJOR_EVENT = "major_event"


class Priority(str, Enum):
    LOW = "low"
    DEFAULT = "default"
    HIGH = "high"


@dataclass
class GameState:
    """Normalized game state snapshot for comparison."""
    game_id: str
    score_home: int = 0
    score_away: int = 0
    phase: str = "scheduled"
    clock: Optional[str] = None
    period: Optional[str] = None
    sport: str = "soccer"
    league: str = ""
    home_name: str = "Home"
    away_name: str = "Away"
    home_short: str = "HOM"
    away_short: str = "AWY"


@dataclass
class NotificationEvent:
    """A detected notification-worthy event."""
    event_type: EventType
    game_id: str
    title: str
    body: str
    priority: Priority = Priority.DEFAULT
    data: dict[str, Any] = field(default_factory=dict)
    event_hash: str = ""

    def __post_init__(self):
        if not self.event_hash:
            raw = f"{self.game_id}:{self.event_type.value}:{self.title}:{self.body}"
            self.event_hash = hashlib.sha256(raw.encode()).hexdigest()[:32]


def _is_live(phase: str) -> bool:
    p = phase.lower()
    return p.startswith("live") or p == "break"


def _is_finished(phase: str) -> bool:
    return phase.lower() in ("finished", "full_time")


def _is_halftime(phase: str) -> bool:
    return phase.lower() in ("live_halftime", "break")


def _is_overtime(phase: str) -> bool:
    return phase.lower() in ("live_ot", "live_extra_time")


def _period_label(phase: str) -> str:
    labels = {
        "live_first_half": "1H",
        "live_second_half": "2H",
        "live_q1": "Q1", "live_q2": "Q2", "live_q3": "Q3", "live_q4": "Q4",
        "live_h1": "1H", "live_h2": "2H",
        "live_p1": "P1", "live_p2": "P2", "live_p3": "P3",
        "live_ot": "OT", "live_extra_time": "ET",
        "live_halftime": "HT", "break": "HT",
        "live_inning": "LIVE",
    }
    return labels.get(phase.lower(), "LIVE")


def _score_line(state: GameState) -> str:
    return f"{state.home_short} {state.score_home} – {state.score_away} {state.away_short}"


def _is_clutch_time(state: GameState) -> bool:
    """True if the game is in a close, late-game situation."""
    margin = abs(state.score_home - state.score_away)
    phase = state.phase.lower()

    if state.sport == "soccer":
        if phase in ("live_second_half", "live_extra_time") and margin <= 1:
            return True

    if state.sport == "basketball":
        is_late = phase in ("live_q4", "live_h2", "live_ot")
        if is_late and margin <= 6:
            return True

    if state.sport == "hockey":
        is_late = phase in ("live_p3", "live_ot")
        if is_late and margin <= 1:
            return True

    return False


def detect_events(
    prev: Optional[GameState],
    curr: GameState,
) -> list[NotificationEvent]:
    """
    Compare previous and current game state to produce notification events.
    Returns a list of events (may be empty).
    """
    events: list[NotificationEvent] = []

    # Game start: transition from non-live to live
    if prev and not _is_live(prev.phase) and _is_live(curr.phase):
        events.append(NotificationEvent(
            event_type=EventType.GAME_START,
            game_id=curr.game_id,
            title=f"KICKOFF: {curr.home_short} vs {curr.away_short}",
            body=f"{curr.home_name} vs {curr.away_name} has started • {curr.league}",
            priority=Priority.DEFAULT,
            data=_event_data(curr),
            event_hash=f"{curr.game_id}:game_start",
        ))

    # Score update
    if prev and _is_live(curr.phase):
        score_changed = (
            curr.score_home != prev.score_home
            or curr.score_away != prev.score_away
        )
        if score_changed:
            scoring_team = ""
            if curr.score_home > prev.score_home:
                scoring_team = curr.home_name
            elif curr.score_away > prev.score_away:
                scoring_team = curr.away_name

            period = _period_label(curr.phase)
            clock_str = f" • {curr.clock}" if curr.clock else ""

            events.append(NotificationEvent(
                event_type=EventType.SCORE_UPDATE,
                game_id=curr.game_id,
                title=f"GOAL: {_score_line(curr)}",
                body=f"{scoring_team} scores! {period}{clock_str}",
                priority=Priority.HIGH if _is_clutch_time(curr) else Priority.DEFAULT,
                data=_event_data(curr),
                event_hash=f"{curr.game_id}:score:{curr.score_home}:{curr.score_away}",
            ))

            # Lead change detection
            prev_leader = "home" if prev.score_home > prev.score_away else (
                "away" if prev.score_away > prev.score_home else "tied"
            )
            curr_leader = "home" if curr.score_home > curr.score_away else (
                "away" if curr.score_away > curr.score_home else "tied"
            )
            if prev_leader != curr_leader and prev_leader != "tied" and curr_leader != "tied":
                new_leader = curr.home_name if curr_leader == "home" else curr.away_name
                events.append(NotificationEvent(
                    event_type=EventType.LEAD_CHANGE,
                    game_id=curr.game_id,
                    title=f"LEAD CHANGE: {_score_line(curr)}",
                    body=f"{new_leader} takes the lead!",
                    priority=Priority.HIGH,
                    data=_event_data(curr),
                    event_hash=f"{curr.game_id}:lead:{curr_leader}:{curr.score_home}:{curr.score_away}",
                ))

    # Halftime
    if prev and not _is_halftime(prev.phase) and _is_halftime(curr.phase):
        events.append(NotificationEvent(
            event_type=EventType.HALFTIME,
            game_id=curr.game_id,
            title=f"HALFTIME: {_score_line(curr)}",
            body=f"{curr.home_name} vs {curr.away_name}",
            priority=Priority.LOW,
            data=_event_data(curr),
            event_hash=f"{curr.game_id}:halftime",
        ))

    # Overtime start
    if prev and not _is_overtime(prev.phase) and _is_overtime(curr.phase):
        events.append(NotificationEvent(
            event_type=EventType.OVERTIME_START,
            game_id=curr.game_id,
            title=f"OVERTIME: {_score_line(curr)}",
            body=f"{curr.home_name} vs {curr.away_name} goes to OT!",
            priority=Priority.HIGH,
            data=_event_data(curr),
            event_hash=f"{curr.game_id}:ot_start",
        ))

    # Final
    if prev and _is_live(prev.phase) and _is_finished(curr.phase):
        winner = ""
        if curr.score_home > curr.score_away:
            winner = f"{curr.home_name} wins!"
        elif curr.score_away > curr.score_home:
            winner = f"{curr.away_name} wins!"
        else:
            winner = "It's a draw!"

        events.append(NotificationEvent(
            event_type=EventType.FINAL,
            game_id=curr.game_id,
            title=f"FINAL: {_score_line(curr)}",
            body=winner,
            priority=Priority.HIGH,
            data=_event_data(curr),
            event_hash=f"{curr.game_id}:final",
        ))

    return events


def _event_data(state: GameState) -> dict[str, Any]:
    return {
        "game_id": state.game_id,
        "url": f"/match/{state.game_id}",
        "sport": state.sport,
        "league": state.league,
        "home": state.home_name,
        "away": state.away_name,
        "score_home": state.score_home,
        "score_away": state.score_away,
        "phase": state.phase,
    }


# ── Rate limiting helpers ────────────────────────────────────────

# Maps: (device_id, game_id) -> last send timestamp for score_update
_score_rate_cache: dict[str, float] = {}

SCORE_RATE_DEFAULT_S = 60.0
SCORE_RATE_CLUTCH_S = 20.0


def should_rate_limit_score(
    device_id: str,
    game_id: str,
    is_clutch: bool,
) -> bool:
    """Return True if this score update should be suppressed by rate limiting."""
    key = f"{device_id}:{game_id}:score"
    now = datetime.now(timezone.utc).timestamp()
    last = _score_rate_cache.get(key, 0.0)
    limit = SCORE_RATE_CLUTCH_S if is_clutch else SCORE_RATE_DEFAULT_S
    if now - last < limit:
        return True
    _score_rate_cache[key] = now
    return False


def passes_notify_flags(event: NotificationEvent, flags: dict) -> bool:
    """Check if the event type is enabled in the device's notify_flags."""
    mapping = {
        EventType.SCORE_UPDATE: "score",
        EventType.LEAD_CHANGE: "lead_change",
        EventType.GAME_START: "start",
        EventType.HALFTIME: "halftime",
        EventType.FINAL: "final",
        EventType.OVERTIME_START: "ot",
        EventType.MAJOR_EVENT: "major_events",
    }
    flag_key = mapping.get(event.event_type)
    if flag_key is None:
        return True
    return flags.get(flag_key, True)


def is_quiet_hours(quiet_cfg: Optional[dict]) -> bool:
    """Check if current time falls within the device's quiet hours window."""
    if not quiet_cfg:
        return False
    start_hour = quiet_cfg.get("start")
    end_hour = quiet_cfg.get("end")
    if start_hour is None or end_hour is None:
        return False
    now_hour = datetime.now(timezone.utc).hour
    if start_hour <= end_hour:
        return start_hour <= now_hour < end_hour
    # Wraps midnight (e.g. 23:00 to 07:00)
    return now_hour >= start_hour or now_hour < end_hour
