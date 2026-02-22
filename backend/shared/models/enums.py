"""Domain enumerations for the Live View platform."""
from __future__ import annotations

from enum import Enum


class Sport(str, Enum):
    SOCCER = "soccer"
    BASKETBALL = "basketball"
    HOCKEY = "hockey"
    BASEBALL = "baseball"
    FOOTBALL = "football"


class MatchPhase(str, Enum):
    SCHEDULED = "scheduled"
    PRE_MATCH = "pre_match"
    LIVE_FIRST_HALF = "live_first_half"
    LIVE_HALFTIME = "live_halftime"
    LIVE_SECOND_HALF = "live_second_half"
    LIVE_EXTRA_TIME = "live_extra_time"
    LIVE_PENALTIES = "live_penalties"
    LIVE_Q1 = "live_q1"
    LIVE_Q2 = "live_q2"
    LIVE_Q3 = "live_q3"
    LIVE_Q4 = "live_q4"
    LIVE_OT = "live_ot"
    LIVE_P1 = "live_p1"
    LIVE_P2 = "live_p2"
    LIVE_P3 = "live_p3"
    LIVE_INNING = "live_inning"
    BREAK = "break"
    SUSPENDED = "suspended"
    FINISHED = "finished"
    POSTPONED = "postponed"
    CANCELLED = "cancelled"

    @property
    def is_live(self) -> bool:
        return self.value.startswith("live_") or self == MatchPhase.BREAK

    @property
    def is_terminal(self) -> bool:
        return self in (
            MatchPhase.FINISHED,
            MatchPhase.POSTPONED,
            MatchPhase.CANCELLED,
        )


class Tier(int, Enum):
    """Update tier controlling data granularity."""
    SCOREBOARD = 0
    EVENTS = 1
    STATS = 2


class ProviderName(str, Enum):
    SPORTRADAR = "sportradar"
    ESPN = "espn"
    THESPORTSDB = "thesportsdb"
    FOOTBALL_DATA = "football_data"


class EventType(str, Enum):
    GOAL = "goal"
    ASSIST = "assist"
    YELLOW_CARD = "yellow_card"
    RED_CARD = "red_card"
    SUBSTITUTION = "substitution"
    PENALTY = "penalty"
    PENALTY_MISS = "penalty_miss"
    OWN_GOAL = "own_goal"
    VAR_DECISION = "var_decision"
    PERIOD_START = "period_start"
    PERIOD_END = "period_end"
    MATCH_START = "match_start"
    MATCH_END = "match_end"
    SHOT = "shot"
    FOUL = "foul"
    CORNER = "corner"
    OFFSIDE = "offside"
    FREE_KICK = "free_kick"
    THROW_IN = "throw_in"
    BASKET = "basket"
    THREE_POINTER = "three_pointer"
    FREE_THROW = "free_throw"
    REBOUND = "rebound"
    TURNOVER = "turnover"
    STEAL = "steal"
    BLOCK = "block"
    HIT = "hit"
    RUN = "run"
    STRIKEOUT = "strikeout"
    HOME_RUN = "home_run"
    WALK = "walk"
    TIMEOUT = "timeout"
    GENERIC = "generic"


class WSClientOp(str, Enum):
    SUBSCRIBE = "subscribe"
    UNSUBSCRIBE = "unsubscribe"
    PING = "ping"


class WSServerMsgType(str, Enum):
    SNAPSHOT = "snapshot"
    DELTA = "delta"
    EVENT = "event"
    STATE = "state"
    PONG = "pong"
    ERROR = "error"
    SUBSCRIBED = "subscribed"
    UNSUBSCRIBED = "unsubscribed"
