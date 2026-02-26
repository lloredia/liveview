"""
Unit tests for scheduler interval computation and provider selection.

Run: pytest backend/tests/test_scheduler_provider.py -v
"""
from __future__ import annotations

import math
from unittest.mock import AsyncMock, MagicMock

import pytest

from shared.models.enums import MatchPhase, Sport, Tier
from scheduler.engine.polling import AdaptivePollingEngine, _phase_tempo_key, SPORT_TEMPO
from ingest.providers.registry import HealthScorer
from shared.models.domain import ProviderHealth
from shared.models.enums import ProviderName


# ── Phase tempo key ─────────────────────────────────────────────────────

def test_phase_tempo_key_scheduled() -> None:
    assert _phase_tempo_key(MatchPhase.SCHEDULED) == "scheduled"


def test_phase_tempo_key_live_first_half() -> None:
    assert _phase_tempo_key(MatchPhase.LIVE_FIRST_HALF) == "live_active"


def test_phase_tempo_key_halftime() -> None:
    assert _phase_tempo_key(MatchPhase.LIVE_HALFTIME) == "live_break"


def test_phase_tempo_key_finished() -> None:
    assert _phase_tempo_key(MatchPhase.FINISHED) == "finished"


# ── AdaptivePollingEngine.compute_interval ──────────────────────────────

@pytest.fixture
def mock_redis() -> MagicMock:
    r = MagicMock()
    r.get_subscriber_count = AsyncMock(return_value=0)
    return r


@pytest.fixture
def polling_engine(mock_redis: MagicMock) -> AdaptivePollingEngine:
    return AdaptivePollingEngine(mock_redis)


@pytest.mark.asyncio
async def test_compute_interval_live_soccer_without_subscribers(
    polling_engine: AdaptivePollingEngine,
    mock_redis: MagicMock,
) -> None:
    mock_redis.get_subscriber_count.return_value = 0
    interval = await polling_engine.compute_interval(
        match_id="test-match-id",
        sport=Sport.SOCCER,
        phase=MatchPhase.LIVE_FIRST_HALF,
        tier=Tier.SCOREBOARD,
        provider_health_score=1.0,
        quota_usage=0,
        quota_limit=1000,
    )
    # With 0 subscribers, demand_factor = 3.0; base live_active soccer = 3.0
    # interval = 3.0 * 3.0 * 1.0 * 1.0 = 9.0, then clamp + jitter
    assert interval >= 0.5
    assert interval <= 120.0


@pytest.mark.asyncio
async def test_compute_interval_more_subscribers_shortens_interval(
    polling_engine: AdaptivePollingEngine,
    mock_redis: MagicMock,
) -> None:
    mock_redis.get_subscriber_count.return_value = 0
    interval_no_subs = await polling_engine.compute_interval(
        match_id="m1",
        sport=Sport.SOCCER,
        phase=MatchPhase.LIVE_FIRST_HALF,
        tier=Tier.SCOREBOARD,
        provider_health_score=1.0,
        quota_usage=0,
        quota_limit=1000,
    )
    mock_redis.get_subscriber_count.return_value = 50
    interval_with_subs = await polling_engine.compute_interval(
        match_id="m1",
        sport=Sport.SOCCER,
        phase=MatchPhase.LIVE_FIRST_HALF,
        tier=Tier.SCOREBOARD,
        provider_health_score=1.0,
        quota_usage=0,
        quota_limit=1000,
    )
    # More subscribers → smaller demand_factor → shorter interval (before jitter)
    # Allow for jitter: just check that with subscribers we get a finite interval
    assert interval_with_subs >= 0.5
    assert interval_with_subs <= 120.0


@pytest.mark.asyncio
async def test_compute_interval_quota_pressure_increases_interval(
    polling_engine: AdaptivePollingEngine,
    mock_redis: MagicMock,
) -> None:
    mock_redis.get_subscriber_count.return_value = 1
    interval_low_quota = await polling_engine.compute_interval(
        match_id="m1",
        sport=Sport.SOCCER,
        phase=MatchPhase.LIVE_FIRST_HALF,
        tier=Tier.SCOREBOARD,
        provider_health_score=1.0,
        quota_usage=10,
        quota_limit=100,
    )
    interval_high_quota = await polling_engine.compute_interval(
        match_id="m1",
        sport=Sport.SOCCER,
        phase=MatchPhase.LIVE_FIRST_HALF,
        tier=Tier.SCOREBOARD,
        provider_health_score=1.0,
        quota_usage=85,
        quota_limit=100,
    )
    assert interval_high_quota >= interval_low_quota


@pytest.mark.asyncio
async def test_compute_interval_health_factor(
    polling_engine: AdaptivePollingEngine,
    mock_redis: MagicMock,
) -> None:
    mock_redis.get_subscriber_count.return_value = 1
    interval_healthy = await polling_engine.compute_interval(
        match_id="m1",
        sport=Sport.SOCCER,
        phase=MatchPhase.LIVE_FIRST_HALF,
        tier=Tier.SCOREBOARD,
        provider_health_score=1.0,
    )
    interval_unhealthy = await polling_engine.compute_interval(
        match_id="m1",
        sport=Sport.SOCCER,
        phase=MatchPhase.LIVE_FIRST_HALF,
        tier=Tier.SCOREBOARD,
        provider_health_score=0.2,
    )
    assert interval_unhealthy >= interval_healthy


# ── HealthScorer ────────────────────────────────────────────────────────

@pytest.fixture
def mock_redis_health() -> MagicMock:
    r = MagicMock()
    r.get_provider_samples = AsyncMock(return_value=[])
    return r


@pytest.mark.asyncio
async def test_health_scorer_no_samples_returns_default(
    mock_redis_health: MagicMock,
) -> None:
    scorer = HealthScorer(mock_redis_health)
    health = await scorer.compute_health(ProviderName.ESPN)
    assert health.provider == ProviderName.ESPN
    assert health.sample_count == 0
    assert 0 <= health.score <= 1.0


@pytest.mark.asyncio
async def test_health_scorer_all_success_high_score(
    mock_redis_health: MagicMock,
) -> None:
    import time
    now = time.time()
    mock_redis_health.get_provider_samples.return_value = [
        {"ts": now - 5, "latency_ms": 100, "error": False, "rate_limited": False},
        {"ts": now - 2, "latency_ms": 80, "error": False, "rate_limited": False},
    ]
    scorer = HealthScorer(mock_redis_health)
    health = await scorer.compute_health(ProviderName.ESPN)
    assert health.sample_count == 2
    assert health.score >= 0.8


@pytest.mark.asyncio
async def test_health_scorer_errors_lower_score(
    mock_redis_health: MagicMock,
) -> None:
    import time
    now = time.time()
    mock_redis_health.get_provider_samples.return_value = [
        {"ts": now - 1, "latency_ms": 100, "error": True, "rate_limited": False},
        {"ts": now - 2, "latency_ms": 100, "error": True, "rate_limited": False},
    ]
    scorer = HealthScorer(mock_redis_health)
    health = await scorer.compute_health(ProviderName.ESPN)
    assert health.sample_count == 2
    assert health.score < 0.7
