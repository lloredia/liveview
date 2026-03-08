"""
Sports data provider infrastructure: router, circuit breaker, base types.
"""
from __future__ import annotations

from shared.utils.circuit_breaker import CircuitBreaker

from infra.providers.base import (
    MatchStatus,
    ProviderMatch,
    ProviderScore,
    ProviderTeam,
    ScheduleResult,
    SportsDataProvider,
)
from infra.providers.router import ProviderRouter

__all__ = [
    "CircuitBreaker",
    "MatchStatus",
    "ProviderMatch",
    "ProviderRouter",
    "ProviderScore",
    "ProviderTeam",
    "ScheduleResult",
    "SportsDataProvider",
]
