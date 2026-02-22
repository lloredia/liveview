"""
Synthetic timeline generator for Live View.
Infers match events when no real event data is available from providers.
Analyzes score deltas, period transitions, and state changes.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from shared.models.domain import MatchEvent, MatchScoreboard, Score
from shared.models.enums import EventType, MatchPhase, ProviderName, Sport
from shared.utils.logging import get_logger
from shared.utils.metrics import SYNTHETIC_EVENTS

logger = get_logger(__name__)


class SyntheticTimelineGenerator:
    """
    Generates synthetic events by comparing successive match state snapshots.

    Inference rules:
    - Score delta → GOAL event (with confidence based on granularity)
    - Phase transition → PERIOD_START / PERIOD_END / MATCH_START / MATCH_END
    - Multiple score changes in single update → lower confidence
    """

    def __init__(self, min_confidence: float = 0.3) -> None:
        self._min_confidence = min_confidence

    def generate_from_state_change(
        self,
        match_id: uuid.UUID,
        sport: Sport,
        previous: Optional[MatchScoreboard],
        current: MatchScoreboard,
    ) -> list[MatchEvent]:
        """
        Compare previous and current scoreboard states to generate synthetic events.

        Args:
            match_id: Canonical match UUID.
            sport: Sport type (affects event inference).
            previous: Previous scoreboard snapshot (None for first update).
            current: Current scoreboard snapshot.

        Returns:
            List of synthetic MatchEvent objects.
        """
        events: list[MatchEvent] = []

        if previous is None:
            # First snapshot — generate match start if live
            if current.phase.is_live:
                events.append(self._make_event(
                    match_id=match_id,
                    event_type=EventType.MATCH_START,
                    minute=0,
                    detail=f"Match started ({current.phase.value})",
                    confidence=0.9,
                    score=current.score,
                ))
            return events

        # Phase transitions
        phase_events = self._detect_phase_transitions(
            match_id, previous.phase, current.phase, current.clock, current.score
        )
        events.extend(phase_events)

        # Score changes
        score_events = self._detect_score_changes(
            match_id, sport, previous.score, current.score, current.phase, current.clock,
            current.home_team.id, current.away_team.id,
        )
        events.extend(score_events)

        for evt in events:
            SYNTHETIC_EVENTS.labels(event_type=evt.event_type.value).inc()

        return events

    def _detect_phase_transitions(
        self,
        match_id: uuid.UUID,
        prev_phase: MatchPhase,
        curr_phase: MatchPhase,
        clock: Optional[str],
        score: Score,
    ) -> list[MatchEvent]:
        """Detect period/match start/end from phase transitions."""
        events: list[MatchEvent] = []

        if prev_phase == curr_phase:
            return events

        minute = self._parse_clock_to_minute(clock)

        # Match started
        if not prev_phase.is_live and curr_phase.is_live:
            events.append(self._make_event(
                match_id=match_id,
                event_type=EventType.MATCH_START,
                minute=0,
                detail="Match started",
                confidence=0.95,
                score=score,
            ))

        # Match ended
        if prev_phase.is_live and curr_phase.is_terminal:
            events.append(self._make_event(
                match_id=match_id,
                event_type=EventType.MATCH_END,
                minute=minute,
                detail=f"Match ended ({curr_phase.value})",
                confidence=0.95,
                score=score,
            ))

        # Period transitions
        if prev_phase.is_live and curr_phase.is_live and prev_phase != curr_phase:
            # Previous period ended
            events.append(self._make_event(
                match_id=match_id,
                event_type=EventType.PERIOD_END,
                minute=minute,
                period=prev_phase.value,
                detail=f"Period ended: {prev_phase.value}",
                confidence=0.85,
                score=score,
            ))
            # New period started
            events.append(self._make_event(
                match_id=match_id,
                event_type=EventType.PERIOD_START,
                minute=minute,
                period=curr_phase.value,
                detail=f"Period started: {curr_phase.value}",
                confidence=0.85,
                score=score,
            ))

        # Halftime / Break
        if prev_phase.is_live and curr_phase in (MatchPhase.LIVE_HALFTIME, MatchPhase.BREAK):
            events.append(self._make_event(
                match_id=match_id,
                event_type=EventType.PERIOD_END,
                minute=minute,
                detail=f"Break: {curr_phase.value}",
                confidence=0.9,
                score=score,
            ))

        return events

    def _detect_score_changes(
        self,
        match_id: uuid.UUID,
        sport: Sport,
        prev_score: Score,
        curr_score: Score,
        phase: MatchPhase,
        clock: Optional[str],
        home_team_id: uuid.UUID,
        away_team_id: uuid.UUID,
    ) -> list[MatchEvent]:
        """Detect score changes and generate appropriate events."""
        events: list[MatchEvent] = []
        minute = self._parse_clock_to_minute(clock)

        home_delta = curr_score.home - prev_score.home
        away_delta = curr_score.away - prev_score.away

        if home_delta == 0 and away_delta == 0:
            return events

        # Determine the scoring event type based on sport
        scoring_event = self._scoring_event_type(sport)

        # Single goal/point increments have higher confidence
        total_delta = abs(home_delta) + abs(away_delta)

        if home_delta > 0:
            for i in range(home_delta):
                # Confidence decreases with larger multi-goal updates
                confidence = max(self._min_confidence, 0.7 - (0.1 * max(0, total_delta - 1)))

                events.append(self._make_event(
                    match_id=match_id,
                    event_type=scoring_event,
                    minute=minute,
                    team_id=home_team_id,
                    detail=f"Home team scored ({prev_score.home + i + 1}-{prev_score.away})",
                    confidence=confidence,
                    score=Score(
                        home=prev_score.home + i + 1,
                        away=curr_score.away,
                    ),
                ))

        if away_delta > 0:
            for i in range(away_delta):
                confidence = max(self._min_confidence, 0.7 - (0.1 * max(0, total_delta - 1)))

                events.append(self._make_event(
                    match_id=match_id,
                    event_type=scoring_event,
                    minute=minute,
                    team_id=away_team_id,
                    detail=f"Away team scored ({curr_score.home}-{prev_score.away + i + 1})",
                    confidence=confidence,
                    score=Score(
                        home=curr_score.home,
                        away=prev_score.away + i + 1,
                    ),
                ))

        return events

    def _scoring_event_type(self, sport: Sport) -> EventType:
        """Return the primary scoring event type for a sport."""
        return {
            Sport.SOCCER: EventType.GOAL,
            Sport.BASKETBALL: EventType.BASKET,
            Sport.HOCKEY: EventType.GOAL,
            Sport.BASEBALL: EventType.RUN,
            Sport.FOOTBALL: EventType.GENERIC,
        }.get(sport, EventType.GOAL)

    def _parse_clock_to_minute(self, clock: Optional[str]) -> Optional[int]:
        """Parse a clock string (e.g., '45:23') to minute integer."""
        if not clock:
            return None
        try:
            if ":" in clock:
                parts = clock.split(":")
                return int(parts[0])
            return int(clock)
        except (ValueError, IndexError):
            return None

    def _make_event(
        self,
        match_id: uuid.UUID,
        event_type: EventType,
        minute: Optional[int] = None,
        second: Optional[int] = None,
        period: Optional[str] = None,
        team_id: Optional[uuid.UUID] = None,
        detail: Optional[str] = None,
        confidence: float = 0.5,
        score: Optional[Score] = None,
    ) -> MatchEvent:
        """Create a synthetic MatchEvent."""
        return MatchEvent(
            id=uuid.uuid4(),
            match_id=match_id,
            event_type=event_type,
            minute=minute,
            second=second,
            period=period,
            team_id=team_id,
            detail=detail,
            score_home=score.home if score else None,
            score_away=score.away if score else None,
            synthetic=True,
            confidence=confidence,
            source_provider=None,
            provider_event_id=f"synthetic:{uuid.uuid4().hex[:12]}",
            created_at=datetime.now(timezone.utc),
        )
