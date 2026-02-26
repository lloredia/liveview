"""
Canonical verification schema and base source interface.
All verification sources normalize to CanonicalMatchState for comparison.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional

from shared.utils.logging import get_logger

logger = get_logger(__name__)


@dataclass(frozen=True)
class CanonicalMatchState:
    """Normalized state from any verification source for comparison."""
    score_home: int
    score_away: int
    phase: str
    clock: Optional[str] = None
    period: Optional[str] = None
    source: str = ""
    fetched_at: float = 0.0  # Unix timestamp for freshness


class VerificationSource(ABC):
    """Base for ESPN, Google, official site fetchers."""

    @property
    @abstractmethod
    def source_name(self) -> str:
        pass

    @property
    @abstractmethod
    def base_url(self) -> str:
        """Base URL for rate limit domain."""
        pass

    @abstractmethod
    async def fetch_match_state(
        self,
        match_id: str,
        home_team_name: str,
        away_team_name: str,
        league_name: str,
        sport: str,
    ) -> Optional[CanonicalMatchState]:
        """
        Fetch current state from this source. Return None if not found or error.
        Implementations must handle timeouts and non-2xx; do not raise.
        """
        pass
