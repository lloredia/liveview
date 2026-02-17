-- Live View: Full database schema
-- Run: psql -U liveview -d liveview -f 001_initial.sql

-- ═══════════════════════════════════════════════════════════
-- Extensions
-- ═══════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ═══════════════════════════════════════════════════════════
-- Enums
-- ═══════════════════════════════════════════════════════════




-- ═══════════════════════════════════════════════════════════
-- Core Reference Tables
-- ═══════════════════════════════════════════════════════════

CREATE TABLE sports (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(50)  NOT NULL UNIQUE,
    sport_type  VARCHAR(20)   NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE leagues (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sport_id    UUID         NOT NULL REFERENCES sports(id),
    name        VARCHAR(200) NOT NULL,
    short_name  VARCHAR(50),
    country     VARCHAR(100) NOT NULL DEFAULT 'International',
    logo_url    TEXT,
    active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_leagues_sport ON leagues(sport_id);
CREATE INDEX idx_leagues_active ON leagues(active) WHERE active = TRUE;

CREATE TABLE seasons (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    league_id   UUID         NOT NULL REFERENCES leagues(id),
    name        VARCHAR(100) NOT NULL,
    start_date  DATE         NOT NULL,
    end_date    DATE,
    is_current  BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_seasons_league ON seasons(league_id);
CREATE INDEX idx_seasons_current ON seasons(league_id, is_current) WHERE is_current = TRUE;

CREATE TABLE teams (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sport_id    UUID         NOT NULL REFERENCES sports(id),
    name        VARCHAR(200) NOT NULL,
    short_name  VARCHAR(50)  NOT NULL,
    abbreviation VARCHAR(10),
    logo_url    TEXT,
    country     VARCHAR(100),
    venue       VARCHAR(200),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_teams_sport ON teams(sport_id);

CREATE TABLE players (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id     UUID         REFERENCES teams(id),
    name        VARCHAR(200) NOT NULL,
    number      SMALLINT,
    position    VARCHAR(50),
    nationality VARCHAR(100),
    date_of_birth DATE,
    active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_players_team ON players(team_id);

-- ═══════════════════════════════════════════════════════════
-- Match Tables
-- ═══════════════════════════════════════════════════════════

CREATE TABLE matches (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    league_id       UUID         NOT NULL REFERENCES leagues(id),
    season_id       UUID         REFERENCES seasons(id),
    home_team_id    UUID         NOT NULL REFERENCES teams(id),
    away_team_id    UUID         NOT NULL REFERENCES teams(id),
    start_time      TIMESTAMPTZ  NOT NULL,
    venue           VARCHAR(200),
    phase           VARCHAR(30)  NOT NULL DEFAULT 'scheduled',
    version         INTEGER      NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_different_teams CHECK (home_team_id != away_team_id)
);

-- Scoreboard query: all live matches for a league
CREATE INDEX idx_matches_league_phase ON matches(league_id, phase);
-- Temporal queries
CREATE INDEX idx_matches_start_time ON matches(start_time);
-- Live match lookup
CREATE INDEX idx_matches_live ON matches(phase) WHERE phase NOT IN ('finished', 'postponed', 'cancelled', 'scheduled');
-- Team schedule
CREATE INDEX idx_matches_home_team ON matches(home_team_id, start_time);
CREATE INDEX idx_matches_away_team ON matches(away_team_id, start_time);

CREATE TABLE match_state (
    match_id        UUID PRIMARY KEY REFERENCES matches(id) ON DELETE CASCADE,
    score_home      INTEGER      NOT NULL DEFAULT 0,
    score_away      INTEGER      NOT NULL DEFAULT 0,
    score_breakdown JSONB        NOT NULL DEFAULT '[]'::JSONB,
    clock           VARCHAR(20),
    phase           VARCHAR(30)  NOT NULL DEFAULT 'scheduled',
    period          VARCHAR(50),
    extra_data      JSONB        NOT NULL DEFAULT '{}'::JSONB,
    version         INTEGER      NOT NULL DEFAULT 0,
    seq             BIGINT       NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Append-only event log
CREATE TABLE match_events (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id            UUID         NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    event_type          VARCHAR(30)   NOT NULL,
    minute              SMALLINT,
    second              SMALLINT,
    period              VARCHAR(50),
    team_id             UUID         REFERENCES teams(id),
    player_id           UUID         REFERENCES players(id),
    player_name         VARCHAR(200),
    secondary_player_id UUID         REFERENCES players(id),
    secondary_player_name VARCHAR(200),
    detail              TEXT,
    score_home          INTEGER,
    score_away          INTEGER,
    synthetic           BOOLEAN      NOT NULL DEFAULT FALSE,
    confidence          REAL,
    source_provider     VARCHAR(20),
    provider_event_id   VARCHAR(200),
    seq                 BIGINT       NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- Idempotency: prevent duplicate provider events
    CONSTRAINT uq_match_event_provider UNIQUE (match_id, source_provider, provider_event_id)
);

-- Event ordering for timeline
CREATE INDEX idx_match_events_timeline ON match_events(match_id, minute NULLS LAST, second NULLS LAST, seq);
-- Provider event resolution
CREATE INDEX idx_match_events_provider ON match_events(match_id, source_provider, provider_event_id);
-- Synthetic events for reconciliation
CREATE INDEX idx_match_events_synthetic ON match_events(match_id, synthetic) WHERE synthetic = TRUE;

CREATE TABLE match_stats (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id    UUID         NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    home_stats  JSONB        NOT NULL DEFAULT '{}'::JSONB,
    away_stats  JSONB        NOT NULL DEFAULT '{}'::JSONB,
    version     INTEGER      NOT NULL DEFAULT 0,
    seq         BIGINT       NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_match_stats UNIQUE (match_id)
);

-- ═══════════════════════════════════════════════════════════
-- Provider Mapping Tables
-- ═══════════════════════════════════════════════════════════

CREATE TABLE provider_mappings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type     VARCHAR(50)     NOT NULL,  -- 'league', 'team', 'player', 'match'
    canonical_id    UUID            NOT NULL,
    provider        VARCHAR(20)   NOT NULL,
    provider_id     VARCHAR(200)    NOT NULL,
    extra_data      JSONB           NOT NULL DEFAULT '{}'::JSONB,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_provider_mapping UNIQUE (entity_type, provider, provider_id)
);

CREATE INDEX idx_provider_mappings_canonical ON provider_mappings(entity_type, canonical_id);
CREATE INDEX idx_provider_mappings_resolve ON provider_mappings(entity_type, provider, provider_id);

-- ═══════════════════════════════════════════════════════════
-- Subscriptions (tracking active interest for scheduler)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE subscriptions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id        UUID         NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    connection_id   VARCHAR(200) NOT NULL,
    tiers           SMALLINT[]   NOT NULL DEFAULT '{0}',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ  NOT NULL DEFAULT (NOW() + INTERVAL '2 hours'),

    CONSTRAINT uq_subscription UNIQUE (match_id, connection_id)
);

CREATE INDEX idx_subscriptions_match ON subscriptions(match_id);
CREATE INDEX idx_subscriptions_expires ON subscriptions(expires_at);

-- ═══════════════════════════════════════════════════════════
-- Helper Functions
-- ═══════════════════════════════════════════════════════════

-- Auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_leagues_updated_at
    BEFORE UPDATE ON leagues FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_teams_updated_at
    BEFORE UPDATE ON teams FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_players_updated_at
    BEFORE UPDATE ON players FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_matches_updated_at
    BEFORE UPDATE ON matches FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_match_state_updated_at
    BEFORE UPDATE ON match_state FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_match_stats_updated_at
    BEFORE UPDATE ON match_stats FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_provider_mappings_updated_at
    BEFORE UPDATE ON provider_mappings FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ═══════════════════════════════════════════════════════════
-- Seed Data
-- ═══════════════════════════════════════════════════════════

INSERT INTO sports (id, name, sport_type) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'Soccer',     'soccer'),
    ('a0000000-0000-0000-0000-000000000002', 'Basketball', 'basketball'),
    ('a0000000-0000-0000-0000-000000000003', 'Hockey',     'hockey'),
    ('a0000000-0000-0000-0000-000000000004', 'Baseball',   'baseball')
ON CONFLICT (name) DO NOTHING;
