"""
Base types and abstract interface for sports data providers.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date, datetime
from enum import Enum
from typing import List, Optional


class MatchStatus(str, Enum):
    """Provider-agnostic match status; maps to existing phase strings."""

    SCHEDULED = "scheduled"
    PRE_MATCH = "pre_match"
    LIVE = "live"
    BREAK = "break"
    HALFTIME = "live_halftime"
    FINISHED = "finished"
    POSTPONED = "postponed"
    CANCELLED = "cancelled"
    SUSPENDED = "suspended"


@dataclass(frozen=True)
class ProviderTeam:
    """Minimal team info from a provider."""

    name: str
    short_name: Optional[str] = None
    abbreviation: Optional[str] = None


@dataclass(frozen=True)
class ProviderScore:
    """Home/away score from a provider."""

    home: int
    away: int


@dataclass
class ProviderMatch:
    """Normalized match from any provider for the daily schedule."""

    provider_id: str
    provider_name: str
    home_team: ProviderTeam
    away_team: ProviderTeam
    score: ProviderScore
    status: MatchStatus
    clock: Optional[str]
    period: Optional[str]
    scheduled_at: datetime
    raw: Optional[dict] = None


@dataclass
class ScheduleResult:
    """Result of fetch_daily_schedule."""

    matches: List[ProviderMatch]
    from_fallback: bool


class SportsDataProvider(ABC):
    """Abstract base for providers that can return a daily schedule."""

    @abstractmethod
    async def fetch_daily_schedule(
        self,
        league_slug: str,
        fetch_date: date,
    ) -> ScheduleResult:
        """Fetch all matches for the given league on the given date."""
        ...

    async def close(self) -> None:
        """Release resources (e.g. HTTP session). Override if needed."""
        pass
