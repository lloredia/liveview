from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest

from shared.match_resolution import (
    normalize_team_name,
    resolve_match_by_team_ids,
    resolve_match_by_team_names,
    team_names_match,
)


def test_normalize_team_name_strips_punctuation_and_case() -> None:
    assert normalize_team_name(" Manchester-City ") == "manchestercity"


def test_team_names_match_uses_name_or_short_name_overlap() -> None:
    assert team_names_match("Manchester City", "MCI", "Manchester City FC", "MCI")
    assert not team_names_match("Arsenal", "ARS", "Chelsea", "CHE")


@pytest.mark.asyncio
async def test_resolve_match_by_team_names_returns_none_when_ambiguous() -> None:
    match_a = uuid.uuid4()
    match_b = uuid.uuid4()

    class _FakeResult:
        def __init__(self, rows=None) -> None:
            self._rows = rows or []

        def fetchall(self):
            return self._rows

    class _FakeSession:
        async def execute(self, stmt, params=None):  # type: ignore[no-untyped-def]
            return _FakeResult(rows=[
                (match_a, "Arsenal", "ARS", "Chelsea", "CHE"),
                (match_b, "Arsenal", "ARS", "Chelsea", "CHE"),
            ])

    resolved = await resolve_match_by_team_names(
        _FakeSession(),
        provider="sportradar",
        provider_match_id="sr:1",
        league_id=uuid.uuid4(),
        scheduled_at=datetime.now(timezone.utc),
        home_name="Arsenal",
        home_short="ARS",
        away_name="Chelsea",
        away_short="CHE",
    )

    assert resolved is None


@pytest.mark.asyncio
async def test_resolve_match_by_team_ids_returns_unique_match() -> None:
    match_id = uuid.uuid4()

    class _FakeResult:
        def __init__(self, rows=None) -> None:
            self._rows = rows or []

        def fetchall(self):
            return self._rows

    class _FakeSession:
        async def execute(self, stmt, params=None):  # type: ignore[no-untyped-def]
            return _FakeResult(rows=[(match_id,)])

    resolved = await resolve_match_by_team_ids(
        _FakeSession(),
        provider="espn",
        provider_match_id="evt-1",
        league_id=uuid.uuid4(),
        home_team_id=uuid.uuid4(),
        away_team_id=uuid.uuid4(),
        scheduled_at=datetime.now(timezone.utc),
    )

    assert resolved == match_id
