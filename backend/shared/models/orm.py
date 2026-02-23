"""
SQLAlchemy 2.0 ORM models for Live View.
Maps to the PostgreSQL schema defined in migrations/001_initial.sql.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy import (
    ARRAY,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class SportORM(Base):
    __tablename__ = "sports"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    sport_type: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    leagues: Mapped[list["LeagueORM"]] = relationship(back_populates="sport")
    teams: Mapped[list["TeamORM"]] = relationship(back_populates="sport")


class LeagueORM(Base):
    __tablename__ = "leagues"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sport_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("sports.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    short_name: Mapped[Optional[str]] = mapped_column(String(50))
    country: Mapped[str] = mapped_column(String(100), nullable=False, default="International")
    logo_url: Mapped[Optional[str]] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    sport: Mapped["SportORM"] = relationship(back_populates="leagues")
    seasons: Mapped[list["SeasonORM"]] = relationship(back_populates="league")
    matches: Mapped[list["MatchORM"]] = relationship(back_populates="league")


class SeasonORM(Base):
    __tablename__ = "seasons"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    league_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("leagues.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[Optional[date]] = mapped_column(Date)
    is_current: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    league: Mapped["LeagueORM"] = relationship(back_populates="seasons")


class TeamORM(Base):
    __tablename__ = "teams"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sport_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("sports.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    short_name: Mapped[str] = mapped_column(String(50), nullable=False)
    abbreviation: Mapped[Optional[str]] = mapped_column(String(10))
    logo_url: Mapped[Optional[str]] = mapped_column(Text)
    country: Mapped[Optional[str]] = mapped_column(String(100))
    venue: Mapped[Optional[str]] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    sport: Mapped["SportORM"] = relationship(back_populates="teams")
    players: Mapped[list["PlayerORM"]] = relationship(back_populates="team")


class PlayerORM(Base):
    __tablename__ = "players"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    team_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("teams.id"))
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    number: Mapped[Optional[int]] = mapped_column(SmallInteger)
    position: Mapped[Optional[str]] = mapped_column(String(50))
    nationality: Mapped[Optional[str]] = mapped_column(String(100))
    date_of_birth: Mapped[Optional[date]] = mapped_column(Date)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    team: Mapped[Optional["TeamORM"]] = relationship(back_populates="players")


class MatchORM(Base):
    __tablename__ = "matches"
    __table_args__ = (
        CheckConstraint("home_team_id != away_team_id", name="chk_different_teams"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    league_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("leagues.id"), nullable=False)
    season_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("seasons.id"))
    home_team_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("teams.id"), nullable=False)
    away_team_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("teams.id"), nullable=False)
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    venue: Mapped[Optional[str]] = mapped_column(String(200))
    phase: Mapped[str] = mapped_column(String(30), nullable=False, default="scheduled")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    league: Mapped["LeagueORM"] = relationship(back_populates="matches")
    home_team: Mapped["TeamORM"] = relationship(foreign_keys=[home_team_id])
    away_team: Mapped["TeamORM"] = relationship(foreign_keys=[away_team_id])
    state: Mapped[Optional["MatchStateORM"]] = relationship(back_populates="match", uselist=False)
    events: Mapped[list["MatchEventORM"]] = relationship(back_populates="match", order_by="MatchEventORM.seq")
    stats: Mapped[Optional["MatchStatsORM"]] = relationship(back_populates="match", uselist=False)


class MatchStateORM(Base):
    __tablename__ = "match_state"

    match_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("matches.id", ondelete="CASCADE"), primary_key=True
    )
    score_home: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    score_away: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    score_breakdown: Mapped[dict] = mapped_column(JSONB, nullable=False, default=list)
    clock: Mapped[Optional[str]] = mapped_column(String(20))
    phase: Mapped[str] = mapped_column(String(30), nullable=False, default="scheduled")
    period: Mapped[Optional[str]] = mapped_column(String(50))
    extra_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    seq: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    match: Mapped["MatchORM"] = relationship(back_populates="state")


class MatchEventORM(Base):
    __tablename__ = "match_events"
    __table_args__ = (
        UniqueConstraint("match_id", "source_provider", "provider_event_id", name="uq_match_event_provider"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    match_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("matches.id", ondelete="CASCADE"), nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(30), nullable=False)
    minute: Mapped[Optional[int]] = mapped_column(SmallInteger)
    second: Mapped[Optional[int]] = mapped_column(SmallInteger)
    period: Mapped[Optional[str]] = mapped_column(String(50))
    team_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("teams.id"))
    player_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("players.id"))
    player_name: Mapped[Optional[str]] = mapped_column(String(200))
    secondary_player_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("players.id"))
    secondary_player_name: Mapped[Optional[str]] = mapped_column(String(200))
    detail: Mapped[Optional[str]] = mapped_column(Text)
    score_home: Mapped[Optional[int]] = mapped_column(Integer)
    score_away: Mapped[Optional[int]] = mapped_column(Integer)
    synthetic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    confidence: Mapped[Optional[float]] = mapped_column(nullable=True)
    source_provider: Mapped[Optional[str]] = mapped_column(String(20))
    provider_event_id: Mapped[Optional[str]] = mapped_column(String(200))
    seq: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    match: Mapped["MatchORM"] = relationship(back_populates="events")


class MatchStatsORM(Base):
    __tablename__ = "match_stats"
    __table_args__ = (
        UniqueConstraint("match_id", name="uq_match_stats"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    match_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("matches.id", ondelete="CASCADE"), nullable=False
    )
    home_stats: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    away_stats: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    seq: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    match: Mapped["MatchORM"] = relationship(back_populates="stats")


class ProviderMappingORM(Base):
    __tablename__ = "provider_mappings"
    __table_args__ = (
        UniqueConstraint("entity_type", "provider", "provider_id", name="uq_provider_mapping"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    canonical_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    provider_id: Mapped[str] = mapped_column(String(200), nullable=False)
    extra_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SubscriptionORM(Base):
    __tablename__ = "subscriptions"
    __table_args__ = (
        UniqueConstraint("match_id", "connection_id", name="uq_subscription"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    match_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("matches.id", ondelete="CASCADE"), nullable=False
    )
    connection_id: Mapped[str] = mapped_column(String(200), nullable=False)
    tiers: Mapped[list] = mapped_column(ARRAY(SmallInteger), nullable=False, default=lambda: [0])
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class NewsArticleORM(Base):
    __tablename__ = "news_articles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    content_snippet: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(100), nullable=False)
    source_url: Mapped[str] = mapped_column(String(1000), nullable=False, unique=True)
    image_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    category: Mapped[str] = mapped_column(String(50), nullable=False, default="general")
    sport: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    leagues: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    teams: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    players: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    trending_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    is_breaking: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
