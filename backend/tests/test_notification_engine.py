"""
Unit tests for the notification event detection engine.
Tests: score update, lead change, final, OT, halftime, game start,
       rate limiting, dedupe hashes, notify_flags filtering, quiet hours.
"""
import time
from unittest.mock import patch

import pytest

from notifications.engine import (
    EventType,
    GameState,
    NotificationEvent,
    Priority,
    detect_events,
    is_quiet_hours,
    passes_notify_flags,
    should_rate_limit_score,
    _score_rate_cache,
)


def _state(**kw) -> GameState:
    defaults = dict(
        game_id="aaaa-bbbb-cccc-dddd",
        score_home=0,
        score_away=0,
        phase="scheduled",
        sport="soccer",
        league="Premier League",
        home_name="Arsenal",
        away_name="Chelsea",
        home_short="ARS",
        away_short="CHE",
    )
    defaults.update(kw)
    return GameState(**defaults)


# ── Event detection ────────────────────────────────────────────


class TestScoreUpdate:
    def test_detects_home_goal(self):
        prev = _state(phase="live_first_half", score_home=0, score_away=0)
        curr = _state(phase="live_first_half", score_home=1, score_away=0)
        events = detect_events(prev, curr)
        types = [e.event_type for e in events]
        assert EventType.SCORE_UPDATE in types

    def test_detects_away_goal(self):
        prev = _state(phase="live_second_half", score_home=1, score_away=0)
        curr = _state(phase="live_second_half", score_home=1, score_away=1)
        events = detect_events(prev, curr)
        types = [e.event_type for e in events]
        assert EventType.SCORE_UPDATE in types

    def test_no_event_when_score_unchanged(self):
        prev = _state(phase="live_first_half", score_home=1, score_away=0)
        curr = _state(phase="live_first_half", score_home=1, score_away=0, clock="32:00")
        events = detect_events(prev, curr)
        assert len(events) == 0

    def test_scoring_team_in_body(self):
        prev = _state(phase="live_first_half", score_home=0, score_away=0)
        curr = _state(phase="live_first_half", score_home=1, score_away=0)
        events = detect_events(prev, curr)
        score_evt = [e for e in events if e.event_type == EventType.SCORE_UPDATE][0]
        assert "Arsenal" in score_evt.body


class TestLeadChange:
    def test_detects_lead_change(self):
        prev = _state(phase="live_second_half", score_home=2, score_away=1)
        curr = _state(phase="live_second_half", score_home=2, score_away=3)
        events = detect_events(prev, curr)
        types = [e.event_type for e in events]
        assert EventType.LEAD_CHANGE in types

    def test_no_lead_change_when_extending_lead(self):
        prev = _state(phase="live_second_half", score_home=2, score_away=1)
        curr = _state(phase="live_second_half", score_home=3, score_away=1)
        events = detect_events(prev, curr)
        types = [e.event_type for e in events]
        assert EventType.LEAD_CHANGE not in types

    def test_no_lead_change_from_tie(self):
        prev = _state(phase="live_first_half", score_home=1, score_away=1)
        curr = _state(phase="live_first_half", score_home=2, score_away=1)
        events = detect_events(prev, curr)
        types = [e.event_type for e in events]
        assert EventType.LEAD_CHANGE not in types


class TestGameStart:
    def test_detects_game_start(self):
        prev = _state(phase="scheduled")
        curr = _state(phase="live_first_half")
        events = detect_events(prev, curr)
        types = [e.event_type for e in events]
        assert EventType.GAME_START in types

    def test_no_start_if_already_live(self):
        prev = _state(phase="live_first_half")
        curr = _state(phase="live_second_half")
        events = detect_events(prev, curr)
        types = [e.event_type for e in events]
        assert EventType.GAME_START not in types


class TestHalftime:
    def test_detects_halftime(self):
        prev = _state(phase="live_first_half", score_home=1, score_away=0)
        curr = _state(phase="live_halftime", score_home=1, score_away=0)
        events = detect_events(prev, curr)
        types = [e.event_type for e in events]
        assert EventType.HALFTIME in types


class TestOvertime:
    def test_detects_overtime_start(self):
        prev = _state(phase="live_q4", score_home=100, score_away=100, sport="basketball")
        curr = _state(phase="live_ot", score_home=100, score_away=100, sport="basketball")
        events = detect_events(prev, curr)
        types = [e.event_type for e in events]
        assert EventType.OVERTIME_START in types


class TestFinal:
    def test_detects_final(self):
        prev = _state(phase="live_second_half", score_home=2, score_away=1)
        curr = _state(phase="finished", score_home=2, score_away=1)
        events = detect_events(prev, curr)
        types = [e.event_type for e in events]
        assert EventType.FINAL in types

    def test_final_has_winner_in_body(self):
        prev = _state(phase="live_second_half", score_home=2, score_away=1)
        curr = _state(phase="finished", score_home=2, score_away=1)
        events = detect_events(prev, curr)
        final_evt = [e for e in events if e.event_type == EventType.FINAL][0]
        assert "Arsenal wins!" in final_evt.body

    def test_final_draw(self):
        prev = _state(phase="live_second_half", score_home=1, score_away=1)
        curr = _state(phase="finished", score_home=1, score_away=1)
        events = detect_events(prev, curr)
        final_evt = [e for e in events if e.event_type == EventType.FINAL][0]
        assert "draw" in final_evt.body.lower()


class TestNoPrevState:
    def test_no_events_on_first_poll(self):
        curr = _state(phase="live_first_half", score_home=1, score_away=0)
        events = detect_events(None, curr)
        assert len(events) == 0


# ── Event hashes (dedupe) ────────────────────────────────────────

class TestEventHash:
    def test_score_hash_is_deterministic(self):
        prev = _state(phase="live_first_half", score_home=0, score_away=0)
        curr = _state(phase="live_first_half", score_home=1, score_away=0)
        e1 = detect_events(prev, curr)
        e2 = detect_events(prev, curr)
        score1 = [e for e in e1 if e.event_type == EventType.SCORE_UPDATE][0]
        score2 = [e for e in e2 if e.event_type == EventType.SCORE_UPDATE][0]
        assert score1.event_hash == score2.event_hash

    def test_different_scores_different_hashes(self):
        prev1 = _state(phase="live_first_half", score_home=0, score_away=0)
        curr1 = _state(phase="live_first_half", score_home=1, score_away=0)
        prev2 = _state(phase="live_first_half", score_home=1, score_away=0)
        curr2 = _state(phase="live_first_half", score_home=2, score_away=0)
        e1 = [e for e in detect_events(prev1, curr1) if e.event_type == EventType.SCORE_UPDATE][0]
        e2 = [e for e in detect_events(prev2, curr2) if e.event_type == EventType.SCORE_UPDATE][0]
        assert e1.event_hash != e2.event_hash


# ── Rate limiting ────────────────────────────────────────────────

class TestRateLimiting:
    def setup_method(self):
        _score_rate_cache.clear()

    def test_first_score_not_limited(self):
        assert not should_rate_limit_score("dev1", "game1", is_clutch=False)

    def test_second_score_within_60s_limited(self):
        should_rate_limit_score("dev1", "game1", is_clutch=False)
        assert should_rate_limit_score("dev1", "game1", is_clutch=False)

    def test_clutch_mode_allows_faster(self):
        should_rate_limit_score("dev1", "game2", is_clutch=True)
        key = "dev1:game2:score"
        _score_rate_cache[key] = time.time() - 25  # 25s ago
        assert not should_rate_limit_score("dev1", "game2", is_clutch=True)

    def test_different_devices_independent(self):
        should_rate_limit_score("dev1", "game1", is_clutch=False)
        assert not should_rate_limit_score("dev2", "game1", is_clutch=False)


# ── Notify flags ─────────────────────────────────────────────────

class TestNotifyFlags:
    def test_score_enabled(self):
        event = NotificationEvent(
            event_type=EventType.SCORE_UPDATE,
            game_id="g1",
            title="t",
            body="b",
        )
        assert passes_notify_flags(event, {"score": True})

    def test_score_disabled(self):
        event = NotificationEvent(
            event_type=EventType.SCORE_UPDATE,
            game_id="g1",
            title="t",
            body="b",
        )
        assert not passes_notify_flags(event, {"score": False})

    def test_halftime_disabled_by_default(self):
        event = NotificationEvent(
            event_type=EventType.HALFTIME,
            game_id="g1",
            title="t",
            body="b",
        )
        default_flags = {
            "score": True, "lead_change": True, "start": True,
            "halftime": False, "final": True, "ot": True, "major_events": True,
        }
        assert not passes_notify_flags(event, default_flags)

    def test_final_always_passes(self):
        event = NotificationEvent(
            event_type=EventType.FINAL,
            game_id="g1",
            title="t",
            body="b",
        )
        assert passes_notify_flags(event, {"final": True})


# ── Quiet hours ──────────────────────────────────────────────────

class TestQuietHours:
    def test_no_config_means_not_quiet(self):
        assert not is_quiet_hours(None)

    def test_empty_config_means_not_quiet(self):
        assert not is_quiet_hours({})

    @patch("notifications.engine.datetime")
    def test_within_quiet_hours(self, mock_dt):
        from datetime import datetime, timezone
        mock_now = datetime(2025, 1, 1, 3, 0, tzinfo=timezone.utc)
        mock_dt.now.return_value = mock_now
        assert is_quiet_hours({"start": 22, "end": 7})

    @patch("notifications.engine.datetime")
    def test_outside_quiet_hours(self, mock_dt):
        from datetime import datetime, timezone
        mock_now = datetime(2025, 1, 1, 15, 0, tzinfo=timezone.utc)
        mock_dt.now.return_value = mock_now
        assert not is_quiet_hours({"start": 22, "end": 7})


# ── Priority / clutch ────────────────────────────────────────────

class TestClutchPriority:
    def test_basketball_clutch_late_close(self):
        prev = _state(phase="live_q4", score_home=100, score_away=98, sport="basketball")
        curr = _state(phase="live_q4", score_home=100, score_away=100, sport="basketball")
        events = detect_events(prev, curr)
        score_evt = [e for e in events if e.event_type == EventType.SCORE_UPDATE][0]
        assert score_evt.priority == Priority.HIGH

    def test_soccer_clutch_second_half_close(self):
        prev = _state(phase="live_second_half", score_home=1, score_away=1)
        curr = _state(phase="live_second_half", score_home=2, score_away=1)
        events = detect_events(prev, curr)
        score_evt = [e for e in events if e.event_type == EventType.SCORE_UPDATE][0]
        assert score_evt.priority == Priority.HIGH
