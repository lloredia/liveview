"""
Confidence scoring for verification results.
Two sources agree -> HIGH; one agrees -> MEDIUM; all disagree -> DISPUTED.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

from verifier.sources.base import CanonicalMatchState


@dataclass
class CurrentState:
    """Current match state from our system (Redis/Postgres)."""
    score_home: int
    score_away: int
    phase: str
    clock: Optional[str] = None
    period: Optional[str] = None
    version: int = 0


def _normalize_phase(p: str) -> str:
    return (p or "").strip().lower()


def _phase_equivalent(a: str, b: str) -> bool:
    """Consider phases equivalent if both are live-ish or both terminal."""
    pa, pb = _normalize_phase(a), _normalize_phase(b)
    if pa == pb:
        return True
    live_a = pa.startswith("live_") or pa in ("break",)
    live_b = pb.startswith("live_") or pb in ("break",)
    if live_a and live_b:
        return True
    terminal = ("finished", "postponed", "cancelled")
    if pa in terminal and pb in terminal:
        return True
    return False


def _score_match(current: CurrentState, verified: CanonicalMatchState) -> bool:
    return (
        current.score_home == verified.score_home
        and current.score_away == verified.score_away
        and _phase_equivalent(current.phase, verified.phase)
    )


def compute_confidence(
    current: CurrentState,
    verified_list: List[CanonicalMatchState],
) -> tuple[float, str, Optional[CanonicalMatchState]]:
    """
    Compute confidence score and recommended state.

    Returns:
        (confidence 0.0-1.0, disposition "HIGH"|"MEDIUM"|"DISPUTED", recommended_state or None)
    """
    if not verified_list:
        return 0.0, "DISPUTED", None

    matching = [v for v in verified_list if _score_match(current, v)]
    n = len(verified_list)
    m = len(matching)

    if m >= 2:
        # Two or more independent sources agree -> HIGH
        best = matching[0]
        return 0.9, "HIGH", best
    if m == 1:
        # Only one matches current -> MEDIUM (could be lag)
        return 0.6, "MEDIUM", matching[0]
    # All disagree -> DISPUTED; pick most common if we had voting, else first by freshness
    best = max(verified_list, key=lambda v: v.fetched_at)
    return 0.3, "DISPUTED", best


def current_matches_recommended(current: CurrentState, recommended: CanonicalMatchState) -> bool:
    """True if current state matches recommended (no correction needed)."""
    return _score_match(current, recommended)


def delta(current: CurrentState, recommended: CanonicalMatchState) -> dict:
    """Produce delta dict for logging/apply."""
    return {
        "score_home": recommended.score_home - current.score_home,
        "score_away": recommended.score_away - current.score_away,
        "phase_changed": not _phase_equivalent(current.phase, recommended.phase),
        "phase_old": current.phase,
        "phase_new": recommended.phase,
        "clock": recommended.clock,
        "period": recommended.period,
    }
