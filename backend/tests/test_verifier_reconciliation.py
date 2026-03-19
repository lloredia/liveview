from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
import uuid

import pytest

from shared.models.domain import LeagueRef, TeamRef
from shared.models.enums import Sport
from verifier.reconciliation import apply_correction
from verifier.sources.base import CanonicalMatchState


class _FakeRedisClient:
    def __init__(self) -> None:
        self.deleted: list[tuple[str, ...]] = []
        self.scan_patterns: list[str] = []
        self.pattern_map: dict[str, list[str]] = {}

    async def delete(self, *keys: str) -> None:
        self.deleted.append(tuple(keys))

    async def scan_iter(self, match: str):
        self.scan_patterns.append(match)
        for key in self.pattern_map.get(match, []):
            yield key


class _FakeRedis:
    def __init__(self) -> None:
        self.client = _FakeRedisClient()
        self.snapshots: list[tuple[str, str, int]] = []
        self.published: list[tuple[str, int, str]] = []

    async def set_snapshot(self, key: str, data: str, ttl_s: int = 300) -> None:
        self.snapshots.append((key, data, ttl_s))

    async def publish_delta(self, match_id: str, tier: int, payload: str) -> None:
        self.published.append((match_id, tier, payload))


class _FakeSession:
    def __init__(self, state: object, match: object) -> None:
        self._state = state
        self._match = match
        self.flushed = False

    async def get(self, model: object, match_id: uuid.UUID):
        model_name = getattr(model, "__name__", "")
        if model_name == "MatchStateORM":
            return self._state
        if model_name == "MatchORM":
            return self._match
        return None

    async def flush(self) -> None:
        self.flushed = True


@pytest.mark.asyncio
async def test_apply_correction_invalidates_today_cache_band() -> None:
    match_id = uuid.uuid4()
    start_time = datetime(2026, 3, 18, 19, 0, tzinfo=timezone.utc)
    state = SimpleNamespace(
        score_home=0,
        score_away=0,
        phase="live_first_half",
        clock="12'",
        period="1",
        version=3,
        seq=8,
        updated_at=start_time,
    )
    match = SimpleNamespace(
        phase="live_first_half",
        version=3,
    )
    session = _FakeSession(state, match)
    redis = _FakeRedis()
    redis.client.pattern_map = {
        "today:2026-03-17:*": ["today:2026-03-17:300"],
        "today:2026-03-18:*": ["today:2026-03-18:300", "today:2026-03-18:360"],
        "today:2026-03-19:*": ["today:2026-03-19:300"],
    }

    league = LeagueRef(
        id=uuid.uuid4(),
        name="Premier League",
        sport=Sport.SOCCER,
        country="England",
        logo_url=None,
    )
    home_team = TeamRef(id=uuid.uuid4(), name="Arsenal", short_name="ARS", logo_url=None)
    away_team = TeamRef(id=uuid.uuid4(), name="Chelsea", short_name="CHE", logo_url=None)
    corrected = CanonicalMatchState(
        score_home=1,
        score_away=0,
        phase="finished",
        clock=None,
        period="2",
        source="espn",
    )

    applied = await apply_correction(
        session=session,  # type: ignore[arg-type]
        redis=redis,  # type: ignore[arg-type]
        match_id=match_id,
        league=league,
        home_team=home_team,
        away_team=away_team,
        start_time=start_time,
        corrected=corrected,
    )

    assert applied is True
    assert session.flushed is True
    assert redis.client.scan_patterns == [
        "today:2026-03-17:*",
        "today:2026-03-18:*",
        "today:2026-03-19:*",
    ]
    assert ("today:2026-03-17:300",) in redis.client.deleted
    assert ("today:2026-03-18:300", "today:2026-03-18:360") in redis.client.deleted
    assert ("today:2026-03-19:300",) in redis.client.deleted
