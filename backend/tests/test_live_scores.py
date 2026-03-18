"""
Unit tests for live score pipeline: phase resolution, ESPN event parsing,
and the TheSportsDB fallback module.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import pytest
from types import SimpleNamespace
import uuid

from api.app import (
    _non_terminal_phase_values,
    _resolve_match_from_provider_match,
    _resolve_phase,
    phase_sync_loop,
)
from api.live_fallback import TSDB_STATUS_TO_PHASE, TSDB_LEAGUE_MAP, _safe_int
from shared.models.enums import MatchPhase
from shared.provider_mapping import ensure_provider_mapping_consistency


# ── _resolve_phase ──────────────────────────────────────────────────────

class TestResolvePhase:

    def test_final(self) -> None:
        assert _resolve_phase("STATUS_FINAL", 0, "soccer") == MatchPhase.FINISHED

    def test_full_time(self) -> None:
        assert _resolve_phase("STATUS_FULL_TIME", 0, "soccer") == MatchPhase.FINISHED

    def test_scheduled(self) -> None:
        assert _resolve_phase("STATUS_SCHEDULED", 0, "soccer") == MatchPhase.SCHEDULED

    def test_postponed(self) -> None:
        assert _resolve_phase("STATUS_POSTPONED", 0, "soccer") == MatchPhase.POSTPONED

    def test_cancelled(self) -> None:
        assert _resolve_phase("STATUS_CANCELED", 0, "soccer") == MatchPhase.CANCELLED

    def test_delayed(self) -> None:
        assert _resolve_phase("STATUS_DELAYED", 0, "baseball") == MatchPhase.SUSPENDED

    def test_rain_delay(self) -> None:
        assert _resolve_phase("STATUS_RAIN_DELAY", 0, "baseball") == MatchPhase.SUSPENDED

    def test_halftime(self) -> None:
        assert _resolve_phase("STATUS_HALFTIME", 0, "soccer") == MatchPhase.LIVE_HALFTIME

    def test_end_period(self) -> None:
        assert _resolve_phase("STATUS_END_PERIOD", 0, "hockey") == MatchPhase.BREAK

    # Basketball quarters
    def test_basketball_q1(self) -> None:
        assert _resolve_phase("STATUS_IN_PROGRESS", 1, "basketball") == MatchPhase.LIVE_Q1

    def test_basketball_q4(self) -> None:
        assert _resolve_phase("STATUS_IN_PROGRESS", 4, "basketball") == MatchPhase.LIVE_Q4

    def test_basketball_ot(self) -> None:
        assert _resolve_phase("STATUS_IN_PROGRESS", 5, "basketball") == MatchPhase.LIVE_OT

    # Hockey periods
    def test_hockey_p1(self) -> None:
        assert _resolve_phase("STATUS_IN_PROGRESS", 1, "hockey") == MatchPhase.LIVE_P1

    def test_hockey_p3(self) -> None:
        assert _resolve_phase("STATUS_IN_PROGRESS", 3, "hockey") == MatchPhase.LIVE_P3

    def test_hockey_ot(self) -> None:
        assert _resolve_phase("STATUS_IN_PROGRESS", 4, "hockey") == MatchPhase.LIVE_OT

    # Football (NFL) quarters
    def test_football_q1(self) -> None:
        assert _resolve_phase("STATUS_IN_PROGRESS", 1, "football") == MatchPhase.LIVE_Q1

    def test_football_q2(self) -> None:
        assert _resolve_phase("STATUS_IN_PROGRESS", 2, "football") == MatchPhase.LIVE_Q2

    def test_football_q3(self) -> None:
        assert _resolve_phase("STATUS_IN_PROGRESS", 3, "football") == MatchPhase.LIVE_Q3

    def test_football_q4(self) -> None:
        assert _resolve_phase("STATUS_IN_PROGRESS", 4, "football") == MatchPhase.LIVE_Q4

    def test_football_ot(self) -> None:
        assert _resolve_phase("STATUS_IN_PROGRESS", 5, "football") == MatchPhase.LIVE_OT

    # Baseball
    def test_baseball_inning(self) -> None:
        assert _resolve_phase("STATUS_IN_PROGRESS", 7, "baseball") == MatchPhase.LIVE_INNING

    # Soccer defaults
    def test_soccer_first_half(self) -> None:
        assert _resolve_phase("STATUS_IN_PROGRESS", 1, "soccer") == MatchPhase.LIVE_FIRST_HALF

    def test_soccer_second_half(self) -> None:
        assert _resolve_phase("STATUS_IN_PROGRESS", 2, "soccer") == MatchPhase.LIVE_SECOND_HALF

    def test_soccer_extra_time(self) -> None:
        assert _resolve_phase("STATUS_IN_PROGRESS", 3, "soccer") == MatchPhase.LIVE_EXTRA_TIME

    # NCAA Men's Basketball (halves)
    def test_ncaam_h1(self) -> None:
        assert _resolve_phase("STATUS_IN_PROGRESS", 1, "basketball", "mens-college-basketball") == MatchPhase.LIVE_H1

    def test_ncaam_h2(self) -> None:
        assert _resolve_phase("STATUS_IN_PROGRESS", 2, "basketball", "mens-college-basketball") == MatchPhase.LIVE_H2

    def test_ncaam_ot(self) -> None:
        assert _resolve_phase("STATUS_IN_PROGRESS", 3, "basketball", "mens-college-basketball") == MatchPhase.LIVE_OT

    def test_ncaam_halftime(self) -> None:
        assert _resolve_phase("STATUS_HALFTIME", 1, "basketball", "mens-college-basketball") == MatchPhase.LIVE_HALFTIME

    # NCAA Women's Basketball (quarters, control)
    def test_ncaaw_q1(self) -> None:
        assert _resolve_phase("STATUS_IN_PROGRESS", 1, "basketball", "womens-college-basketball") == MatchPhase.LIVE_Q1

    def test_ncaaw_q4(self) -> None:
        assert _resolve_phase("STATUS_IN_PROGRESS", 4, "basketball", "womens-college-basketball") == MatchPhase.LIVE_Q4

    def test_ncaaw_ot(self) -> None:
        assert _resolve_phase("STATUS_IN_PROGRESS", 5, "basketball", "womens-college-basketball") == MatchPhase.LIVE_OT

    # Regression: NBA without league_id still defaults to quarters
    def test_nba_no_league_id_still_quarters(self) -> None:
        assert _resolve_phase("STATUS_IN_PROGRESS", 1, "basketball") == MatchPhase.LIVE_Q1
        assert _resolve_phase("STATUS_IN_PROGRESS", 4, "basketball") == MatchPhase.LIVE_Q4

    # Regression: NCAA Men must NOT produce Q1-Q4
    def test_ncaam_never_produces_quarter_phases(self) -> None:
        quarter_phases = {MatchPhase.LIVE_Q1, MatchPhase.LIVE_Q2, MatchPhase.LIVE_Q3, MatchPhase.LIVE_Q4}
        for period in range(1, 7):
            phase = _resolve_phase("STATUS_IN_PROGRESS", period, "basketball", "mens-college-basketball")
            assert phase not in quarter_phases, f"Period {period} produced {phase} for NCAAM"


# ── TSDB fallback helpers ───────────────────────────────────────────────

class TestTSDBFallback:

    def test_status_mapping_live(self) -> None:
        assert TSDB_STATUS_TO_PHASE.get("1h") == MatchPhase.LIVE_FIRST_HALF
        assert TSDB_STATUS_TO_PHASE.get("2h") == MatchPhase.LIVE_SECOND_HALF
        assert TSDB_STATUS_TO_PHASE.get("ht") == MatchPhase.LIVE_HALFTIME
        assert TSDB_STATUS_TO_PHASE.get("ft") == MatchPhase.FINISHED

    def test_status_mapping_quarters(self) -> None:
        assert TSDB_STATUS_TO_PHASE.get("q1") == MatchPhase.LIVE_Q1
        assert TSDB_STATUS_TO_PHASE.get("q4") == MatchPhase.LIVE_Q4
        assert TSDB_STATUS_TO_PHASE.get("ot") == MatchPhase.LIVE_OT

    def test_status_mapping_halves(self) -> None:
        assert TSDB_STATUS_TO_PHASE.get("h1") == MatchPhase.LIVE_H1
        assert TSDB_STATUS_TO_PHASE.get("h2") == MatchPhase.LIVE_H2

    def test_league_map_has_all_sports(self) -> None:
        assert "nba" in TSDB_LEAGUE_MAP
        assert "nhl" in TSDB_LEAGUE_MAP
        assert "mlb" in TSDB_LEAGUE_MAP
        assert "nfl" in TSDB_LEAGUE_MAP
        assert "eng.1" in TSDB_LEAGUE_MAP

    def test_safe_int_valid(self) -> None:
        assert _safe_int("3") == 3
        assert _safe_int(0) == 0

    def test_safe_int_none(self) -> None:
        assert _safe_int(None) is None
        assert _safe_int("") is None


# ── ESPN_LEAGUE_SPORT and SPORT_LEAGUE_ESPN_PATHS completeness ─────────

class TestESPNMaps:
    """Verify the API's ESPN maps cover all five sports."""

    def test_nfl_in_league_sport(self) -> None:
        from api.app import ESPN_LEAGUE_SPORT
        assert "nfl" in ESPN_LEAGUE_SPORT
        assert ESPN_LEAGUE_SPORT["nfl"] == "football"

    def test_nfl_in_paths(self) -> None:
        from api.app import SPORT_LEAGUE_ESPN_PATHS
        assert "nfl" in SPORT_LEAGUE_ESPN_PATHS
        assert SPORT_LEAGUE_ESPN_PATHS["nfl"] == "football/nfl"

    def test_all_sports_covered(self) -> None:
        from api.app import ESPN_LEAGUE_SPORT
        sports = set(ESPN_LEAGUE_SPORT.values())
        assert "soccer" in sports
        assert "basketball" in sports
        assert "hockey" in sports
        assert "baseball" in sports
        assert "football" in sports


class _FakeAsyncContextManager:
    def __init__(self, value: object) -> None:
        self._value = value

    async def __aenter__(self) -> object:
        return self._value

    async def __aexit__(self, exc_type, exc, tb) -> bool:
        return False


@pytest.mark.asyncio
async def test_phase_sync_loop_marks_stale_non_terminal_match_and_state_finished(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    executed: list[tuple[str, dict | None]] = []
    invalidated: dict[str, object] = {}

    class _FakeResult:
        def __init__(self, rows=None) -> None:
            self._rows = rows or []

        def fetchall(self):
            return self._rows

    class _FakeSession:
        async def execute(self, stmt, params=None):  # type: ignore[no-untyped-def]
            sql = str(stmt)
            executed.append((sql, params))
            if "RETURNING id, phase" in sql:
                return _FakeResult([("match-1", MatchPhase.LIVE_FIRST_HALF.value)])
            if "RETURNING m.id, m.league_id" in sql:
                return _FakeResult([("match-1", "league-1")])
            return _FakeResult()

    fake_db = SimpleNamespace(
        write_session=lambda: _FakeAsyncContextManager(_FakeSession())
    )
    fake_redis = SimpleNamespace()
    monkeypatch.setattr(
        "api.app.get_settings",
        lambda: SimpleNamespace(phase_sync_fallback_hours=7),
    )
    async def _record_today(_redis) -> None:  # type: ignore[no-untyped-def]
        invalidated["today"] = True

    async def _record_scoreboards(_redis, league_ids) -> None:  # type: ignore[no-untyped-def]
        invalidated["scoreboards"] = set(league_ids)

    async def _record_match_scoreboards(_redis, match_ids) -> None:  # type: ignore[no-untyped-def]
        invalidated["match_scoreboards"] = set(match_ids)

    async def _record_details(_redis, match_ids) -> None:  # type: ignore[no-untyped-def]
        invalidated["details"] = set(match_ids)

    async def _record_stats(_redis, match_ids) -> None:  # type: ignore[no-untyped-def]
        invalidated["stats"] = set(match_ids)

    monkeypatch.setattr("api.app._invalidate_today_cache", _record_today)
    monkeypatch.setattr("api.app._invalidate_scoreboard_cache", _record_scoreboards)
    monkeypatch.setattr("api.app._invalidate_match_scoreboard_cache", _record_match_scoreboards)
    monkeypatch.setattr("api.app._invalidate_match_detail_cache", _record_details)
    monkeypatch.setattr("api.app._invalidate_match_stats_cache", _record_stats)
    sleep_calls = {"count": 0}

    async def _fake_sleep(_seconds: float) -> None:
        sleep_calls["count"] += 1
        if sleep_calls["count"] > 1:
            raise asyncio.CancelledError()

    monkeypatch.setattr("api.app.asyncio.sleep", _fake_sleep)

    await phase_sync_loop(fake_db, fake_redis)  # type: ignore[arg-type]

    assert len(executed) == 3
    state_sql, state_params = executed[0]
    match_sql, match_params = executed[1]
    sync_sql, sync_params = executed[2]

    assert "UPDATE match_state ms" in state_sql
    assert "SET phase = 'finished'" in state_sql
    assert state_params == {
        "phases": list(_non_terminal_phase_values()),
        "hours": 7,
    }

    assert "UPDATE matches" in match_sql
    assert "RETURNING id, phase" in match_sql
    assert match_params == {
        "phases": list(_non_terminal_phase_values()),
        "hours": 7,
    }

    assert "UPDATE matches m" in sync_sql
    assert "FROM match_state ms" in sync_sql
    assert sync_params is None
    assert invalidated["today"] is True
    assert invalidated["scoreboards"] == {"league-1"}
    assert invalidated["match_scoreboards"] == {"match-1"}
    assert invalidated["details"] == {"match-1"}
    assert invalidated["stats"] == {"match-1"}


@pytest.mark.asyncio
async def test_resolve_match_from_provider_match_returns_none_when_candidates_are_ambiguous() -> None:
    league_id = uuid.uuid4()
    match_a = uuid.uuid4()
    match_b = uuid.uuid4()

    class _FakeResult:
        def __init__(self, row=None, rows=None) -> None:
            self._row = row
            self._rows = rows or []

        def fetchone(self):
            return self._row

        def fetchall(self):
            return self._rows

    class _FakeSession:
        async def execute(self, stmt, params=None):  # type: ignore[no-untyped-def]
            sql = str(stmt)
            if "SELECT canonical_id FROM provider_mappings" in sql:
                return _FakeResult(row=(league_id,))
            if "SELECT m.id, ht.name, ht.short_name, at.name, at.short_name" in sql:
                return _FakeResult(rows=[
                    (match_a, "Arsenal", "ARS", "Chelsea", "CHE"),
                    (match_b, "Arsenal", "ARS", "Chelsea", "CHE"),
                ])
            raise AssertionError(f"Unexpected SQL: {sql}")

    provider_match = SimpleNamespace(
        provider_name="sportradar",
        provider_id="sr:match:1",
        scheduled_at=datetime.now(timezone.utc),
        home_team=SimpleNamespace(name="Arsenal", short_name="ARS"),
        away_team=SimpleNamespace(name="Chelsea", short_name="CHE"),
    )

    resolved = await _resolve_match_from_provider_match(_FakeSession(), "eng.1", provider_match)

    assert resolved is None


@pytest.mark.asyncio
async def test_ensure_provider_mapping_consistency_refuses_conflicting_remap() -> None:
    existing_id = uuid.uuid4()
    attempted_id = uuid.uuid4()
    executed: list[str] = []

    class _FakeResult:
        def __init__(self, mapping=None) -> None:
            self._mapping = mapping

        def scalar_one_or_none(self):
            return self._mapping

    class _FakeSession:
        async def execute(self, stmt, params=None):  # type: ignore[no-untyped-def]
            executed.append(str(stmt))
            if "FROM provider_mappings" in str(stmt):
                return _FakeResult(mapping=SimpleNamespace(canonical_id=existing_id))
            raise AssertionError("Conflict path should not write to provider_mappings")

    persisted = await ensure_provider_mapping_consistency(
        _FakeSession(),
        entity_type="match",
        provider="sportradar",
        provider_id="sr:match:1",
        canonical_id=attempted_id,
        conflict_event="provider_mapping_conflict",
    )

    assert persisted is False
    assert len(executed) == 1
