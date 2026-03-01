"""
Unit tests for live score pipeline: phase resolution, ESPN event parsing,
and the TheSportsDB fallback module.
"""
from __future__ import annotations

import pytest

from api.app import _resolve_phase
from api.live_fallback import TSDB_STATUS_TO_PHASE, TSDB_LEAGUE_MAP, _safe_int
from shared.models.enums import MatchPhase


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
