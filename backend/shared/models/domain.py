"""
Pydantic v2 domain models shared across all Live View services.
These are the canonical wire/internal representations — NOT ORM models.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

from shared.models.enums import (
    EventType,
    MatchPhase,
    ProviderName,
    Sport,
    Tier,
    WSClientOp,
    WSServerMsgType,
)


# ── Base ────────────────────────────────────────────────────────────────
class DomainModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


# ── Reference entities ──────────────────────────────────────────────────
class LeagueRef(DomainModel):
    id: uuid.UUID
    name: str
    sport: Sport
    country: str
    logo_url: Optional[str] = None


class TeamRef(DomainModel):
    id: uuid.UUID
    name: str
    short_name: str
    logo_url: Optional[str] = None


class PlayerRef(DomainModel):
    id: uuid.UUID
    name: str
    number: Optional[int] = None
    position: Optional[str] = None


# ── Score ───────────────────────────────────────────────────────────────
class ScoreBreakdown(DomainModel):
    """Period-level score breakdown (quarters, halves, innings, periods)."""
    period: str
    home: int
    away: int


class Score(DomainModel):
    home: int = 0
    away: int = 0
    breakdown: list[ScoreBreakdown] = Field(default_factory=list)


# ── Match state / scoreboard ────────────────────────────────────────────
class MatchScoreboard(DomainModel):
    """Tier 0: minimal scoreboard data pushed at highest frequency."""
    match_id: uuid.UUID
    league: LeagueRef
    home_team: TeamRef
    away_team: TeamRef
    score: Score
    phase: MatchPhase
    clock: Optional[str] = None
    start_time: datetime
    version: int = 0
    seq: int = 0
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# ── Match event ─────────────────────────────────────────────────────────
class MatchEvent(DomainModel):
    """Tier 1: individual match event (goal, card, substitution, etc.)."""
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    match_id: uuid.UUID
    event_type: EventType
    minute: Optional[int] = None
    second: Optional[int] = None
    period: Optional[str] = None
    team_id: Optional[uuid.UUID] = None
    player_id: Optional[uuid.UUID] = None
    player_name: Optional[str] = None
    secondary_player_id: Optional[uuid.UUID] = None
    secondary_player_name: Optional[str] = None
    detail: Optional[str] = None
    score_home: Optional[int] = None
    score_away: Optional[int] = None
    synthetic: bool = False
    confidence: Optional[float] = None
    source_provider: Optional[ProviderName] = None
    provider_event_id: Optional[str] = None
    seq: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ── Match stats (Tier 2) ───────────────────────────────────────────────
class TeamStats(DomainModel):
    possession: Optional[float] = None
    shots: Optional[int] = None
    shots_on_target: Optional[int] = None
    corners: Optional[int] = None
    fouls: Optional[int] = None
    offsides: Optional[int] = None
    passes: Optional[int] = None
    pass_accuracy: Optional[float] = None
    free_kicks: Optional[int] = None
    throw_ins: Optional[int] = None
    yellow_cards: Optional[int] = None
    red_cards: Optional[int] = None
    # Basketball
    field_goal_pct: Optional[float] = None
    three_point_pct: Optional[float] = None
    free_throw_pct: Optional[float] = None
    rebounds: Optional[int] = None
    assists: Optional[int] = None
    turnovers: Optional[int] = None
    steals: Optional[int] = None
    blocks: Optional[int] = None
    # Hockey
    power_plays: Optional[int] = None
    penalty_minutes: Optional[int] = None
    faceoff_wins: Optional[int] = None
    hits: Optional[int] = None
    # Baseball
    at_bats: Optional[int] = None
    runs: Optional[int] = None
    home_runs: Optional[int] = None
    strikeouts: Optional[int] = None
    walks: Optional[int] = None
    era: Optional[float] = None
    # Generic extra
    extra: dict[str, Any] = Field(default_factory=dict)


class MatchStats(DomainModel):
    """Tier 2: full match statistics."""
    match_id: uuid.UUID
    home_stats: TeamStats = Field(default_factory=TeamStats)
    away_stats: TeamStats = Field(default_factory=TeamStats)
    version: int = 0
    seq: int = 0
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# ── Full Match Center ───────────────────────────────────────────────────
class MatchCenter(DomainModel):
    """Composite Match Center aggregating all tiers."""
    scoreboard: MatchScoreboard
    events: list[MatchEvent] = Field(default_factory=list)
    stats: Optional[MatchStats] = None
    head_to_head: list[MatchScoreboard] = Field(default_factory=list)


# ── Provider health ────────────────────────────────────────────────────
class ProviderHealth(DomainModel):
    provider: ProviderName
    error_rate: float = 0.0
    avg_latency_ms: float = 0.0
    rate_limit_hits: int = 0
    freshness_lag_ms: float = 0.0
    score: float = 1.0
    last_success: Optional[datetime] = None
    last_failure: Optional[datetime] = None
    sample_count: int = 0


class ProviderSelection(DomainModel):
    match_id: uuid.UUID
    tier: Tier
    provider: ProviderName
    selected_at: datetime = Field(default_factory=datetime.utcnow)
    locked_until: Optional[datetime] = None


# ── WebSocket messages ──────────────────────────────────────────────────
class WSClientMessage(DomainModel):
    op: WSClientOp
    channel: Optional[str] = None
    match_id: Optional[uuid.UUID] = None
    tiers: list[Tier] = Field(default_factory=lambda: [Tier.SCOREBOARD])


class WSEnvelope(DomainModel):
    """Server → client message envelope."""
    type: WSServerMsgType
    tier: Tier = Tier.SCOREBOARD
    match_id: Optional[uuid.UUID] = None
    channel: Optional[str] = None
    seq: int = 0
    version: int = 0
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    provider: Optional[ProviderName] = None
    synthetic: bool = False
    data: Any = None


# ── Snapshot for Redis caching ──────────────────────────────────────────
class MatchSnapshot(DomainModel):
    """Cached snapshot written to Redis for replay-on-connect."""
    match_id: uuid.UUID
    scoreboard: MatchScoreboard
    recent_events: list[MatchEvent] = Field(default_factory=list)
    stats: Optional[MatchStats] = None
    version: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ── Subscription tracking ──────────────────────────────────────────────
class SubscriptionInfo(DomainModel):
    connection_id: str
    match_id: uuid.UUID
    tiers: list[Tier] = Field(default_factory=lambda: [Tier.SCOREBOARD])
    subscribed_at: datetime = Field(default_factory=datetime.utcnow)
