"""
Google-based verification (secondary reference).
Uses structured data or public APIs only; no aggressive scraping.
Placeholder: returns None until a compliant integration is defined.
"""
from __future__ import annotations

from typing import Optional

from shared.utils.logging import get_logger

from verifier.sources.base import CanonicalMatchState, VerificationSource

logger = get_logger(__name__)


class GoogleVerificationSource(VerificationSource):
    """Placeholder for Google sports structured data / Knowledge Graph. Degrades gracefully."""

    @property
    def source_name(self) -> str:
        return "google"

    @property
    def base_url(self) -> str:
        return "www.google.com"

    async def fetch_match_state(
        self,
        match_id: str,
        home_team_name: str,
        away_team_name: str,
        league_name: str,
        sport: str,
    ) -> Optional[CanonicalMatchState]:
        """Not implemented; use ESPN or official sources. Returns None to degrade gracefully."""
        return None
