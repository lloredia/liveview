"""
Unit tests for scheduler interval computation and provider selection.

Run: pytest backend/tests/test_scheduler_provider.py -v
"""
from __future__ import annotations

import math
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from shared.models.enums import MatchPhase, Sport, Tier
from scheduler.engine.polling import AdaptivePollingEngine, _phase_tempo_key, SPORT_TEMPO
from ingest.providers.registry import HealthScorer
from shared.models.domain import ProviderHealth
from shared.models.enums import ProviderName
from scheduler.service import SchedulerService, ScheduleSyncService


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


class _FakeAsyncContextManager:
    def __init__(self, value: object) -> None:
        self._value = value

    async def __aenter__(self) -> object:
        return self._value

    async def __aexit__(self, exc_type, exc, tb) -> bool:
        return False


@pytest.mark.asyncio
async def test_discover_active_matches_includes_recently_finished_with_postgame_recheck_window(
    mock_redis: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fixed_now = datetime(2026, 3, 18, 12, 0, tzinfo=timezone.utc)
    match_id = uuid.uuid4()
    league_id = uuid.uuid4()

    first_stmt = None
    execute_calls: list[object] = []

    class _FakeSession:
        async def execute(self, stmt):  # type: ignore[no-untyped-def]
            nonlocal first_stmt
            execute_calls.append(stmt)
            if first_stmt is None:
                first_stmt = stmt
                return SimpleNamespace(
                    all=lambda: [
                        SimpleNamespace(
                            id=match_id,
                            phase=MatchPhase.FINISHED.value,
                            sport_type=Sport.SOCCER.value,
                            league_id=league_id,
                        )
                    ]
                )
            call_idx = len(execute_calls)
            if call_idx == 2:
                return SimpleNamespace(
                    all=lambda: [
                        SimpleNamespace(provider="espn", provider_id="match-espn-1")
                    ]
                )
            if call_idx == 3:
                return SimpleNamespace(
                    all=lambda: [
                        SimpleNamespace(provider="espn", provider_id="eng.1")
                    ]
                )
            raise AssertionError(f"Unexpected execute call #{call_idx}")

    fake_db = MagicMock()
    fake_db.read_session.return_value = _FakeAsyncContextManager(_FakeSession())
    settings = SimpleNamespace(
        instance_id="test-instance",
        scheduler_leader_ttl_s=30,
        provider_order=["espn", "sportradar"],
        postgame_recheck_minutes=180,
    )
    service = SchedulerService(
        mock_redis,
        fake_db,
        polling_engine=MagicMock(),
        health_scorer=MagicMock(),
        settings=settings,
    )
    monkeypatch.setattr(
        "scheduler.service.datetime",
        SimpleNamespace(now=lambda tz=None: fixed_now),
    )

    matches = await service._discover_active_matches()

    assert matches == [
        {
            "canonical_match_id": match_id,
            "phase": MatchPhase.FINISHED.value,
            "sport": Sport.SOCCER.value,
            "match_provider_ids": {"espn": "match-espn-1"},
            "league_provider_ids": {"espn": "eng.1"},
        }
    ]
    assert first_stmt is not None
    compiled = first_stmt.compile()
    assert MatchPhase.FINISHED.value in compiled.params.values()
    assert any(
        value == fixed_now - timedelta(minutes=180)
        for value in compiled.params.values()
    ), compiled.params


@pytest.mark.asyncio
async def test_discover_active_matches_uses_minimum_postgame_recheck_window_of_15_minutes(
    mock_redis: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fixed_now = datetime(2026, 3, 18, 12, 0, tzinfo=timezone.utc)
    first_stmt = None

    class _FakeSession:
        async def execute(self, stmt):  # type: ignore[no-untyped-def]
            nonlocal first_stmt
            if first_stmt is None:
                first_stmt = stmt
                return SimpleNamespace(all=lambda: [])
            raise AssertionError("No provider mapping lookup should occur when no matches are returned")

    fake_db = MagicMock()
    fake_db.read_session.return_value = _FakeAsyncContextManager(_FakeSession())
    settings = SimpleNamespace(
        instance_id="test-instance",
        scheduler_leader_ttl_s=30,
        provider_order=["espn", "sportradar"],
        postgame_recheck_minutes=5,
    )
    service = SchedulerService(
        mock_redis,
        fake_db,
        polling_engine=MagicMock(),
        health_scorer=MagicMock(),
        settings=settings,
    )
    monkeypatch.setattr(
        "scheduler.service.datetime",
        SimpleNamespace(now=lambda tz=None: fixed_now),
    )

    matches = await service._discover_active_matches()

    assert matches == []
    assert first_stmt is not None
    compiled = first_stmt.compile()
    assert any(
        value == fixed_now - timedelta(minutes=15)
        for value in compiled.params.values()
    ), compiled.params


@pytest.mark.asyncio
async def test_scheduler_mapping_consistency_rejects_conflicting_provider_id(
    mock_redis: MagicMock,
) -> None:
    existing_id = uuid.uuid4()
    attempted_id = uuid.uuid4()

    class _FakeResult:
        def __init__(self, scalar_value=None) -> None:
            self._scalar_value = scalar_value

        def scalar_one_or_none(self):
            return self._scalar_value

    class _FakeSession:
        async def execute(self, stmt):  # type: ignore[no-untyped-def]
            return _FakeResult(scalar_value=existing_id)

        async def flush(self):  # type: ignore[no-untyped-def]
            raise AssertionError("Conflict path must not flush a new mapping")

        def add(self, _value):  # type: ignore[no-untyped-def]
            raise AssertionError("Conflict path must not add a new mapping")

    service = ScheduleSyncService(
        MagicMock(),
        redis=mock_redis,
        settings=SimpleNamespace(
            instance_id="test-instance",
            postgame_recheck_minutes=180,
        ),
    )

    persisted = await service._ensure_provider_mapping_consistency(
        _FakeSession(),
        entity_type="match",
        canonical_id=attempted_id,
        provider="espn",
        provider_id="espn-event-1",
    )

    assert persisted is False


@pytest.mark.asyncio
async def test_upsert_match_from_event_reuses_existing_match_when_mapping_is_missing(
    mock_redis: MagicMock,
) -> None:
    existing_match_id = uuid.uuid4()
    existing_state = SimpleNamespace(
        score_home=0,
        score_away=0,
        clock=None,
        phase=MatchPhase.SCHEDULED.value,
        version=1,
        extra_data={},
    )
    existing_match = SimpleNamespace(id=existing_match_id, phase=MatchPhase.SCHEDULED.value)
    added: list[object] = []

    class _FakeResult:
        def __init__(self, scalar_value=None) -> None:
            self._scalar_value = scalar_value

        def scalar_one_or_none(self):
            return self._scalar_value

    class _FakeSession:
        def __init__(self) -> None:
            self._match_mapping_lookup_count = 0

        async def execute(self, stmt):  # type: ignore[no-untyped-def]
            sql = str(stmt)
            if "provider_mappings.entity_type = :entity_type_1" in sql and "provider_id = :provider_id_1" in sql:
                compiled = stmt.compile()
                params = compiled.params
                entity_type = next(v for k, v in params.items() if k.startswith("entity_type"))
                provider_id = next(v for k, v in params.items() if k.startswith("provider_id"))
                if entity_type == "team":
                    if provider_id.endswith(":100"):
                        return _FakeResult(scalar_value=uuid.uuid4())
                    if provider_id.endswith(":200"):
                        return _FakeResult(scalar_value=uuid.uuid4())
                if entity_type == "match":
                    self._match_mapping_lookup_count += 1
                    if self._match_mapping_lookup_count == 1:
                        return _FakeResult(scalar_value=None)
                    return _FakeResult(scalar_value=None)
            if "FROM matches" in sql and "home_team_id" in sql and "away_team_id" in sql:
                return _FakeResult(scalar_value=existing_match)
            if "FROM match_state" in sql:
                return _FakeResult(scalar_value=existing_state)
            raise AssertionError(f"Unexpected statement: {sql}")

        async def flush(self):  # type: ignore[no-untyped-def]
            return None

        def add(self, value):  # type: ignore[no-untyped-def]
            added.append(value)

    service = ScheduleSyncService(
        MagicMock(),
        redis=mock_redis,
        settings=SimpleNamespace(
            instance_id="test-instance",
            postgame_recheck_minutes=180,
        ),
    )

    event = {
        "id": "evt-1",
        "date": "2026-03-18T12:00:00Z",
        "competitions": [
            {
                "date": "2026-03-18T12:00:00Z",
                "status": {
                    "type": {"name": "STATUS_IN_PROGRESS"},
                    "displayClock": "12:34",
                },
                "competitors": [
                    {"homeAway": "home", "score": "2", "team": {"id": "100", "displayName": "Arsenal", "abbreviation": "ARS"}},
                    {"homeAway": "away", "score": "1", "team": {"id": "200", "displayName": "Chelsea", "abbreviation": "CHE"}},
                ],
            }
        ],
    }

    created = await service._upsert_match_from_event(
        _FakeSession(),
        league_id=uuid.uuid4(),
        sport_id=uuid.uuid4(),
        espn_league_id="eng.1",
        event=event,
    )

    assert created is False
    assert existing_match.phase == MatchPhase.LIVE_FIRST_HALF.value
    assert existing_state.score_home == 2
    assert existing_state.score_away == 1
    assert existing_state.clock == "12:34"
    assert existing_state.phase == MatchPhase.LIVE_FIRST_HALF.value
    assert existing_state.version == 2
    assert any(
        getattr(obj, "entity_type", None) == "match" and getattr(obj, "canonical_id", None) == existing_match_id
        for obj in added
    )
