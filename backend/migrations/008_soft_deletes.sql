-- Add soft deletes support for data recovery and audit trail
-- Soft delete: set deleted_at to current timestamp
-- Hard delete: DELETE statement (use sparingly, only for GDPR requests)
-- Restore: UPDATE deleted_at to NULL

-- Add deleted_at column to primary entities (leagues, seasons, teams, players, matches)
-- This allows data recovery and audit trails without permanent deletion.

ALTER TABLE sports
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE leagues
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE seasons
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE teams
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE players
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE matches
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Indices for efficient soft-deleted queries
-- "WHERE deleted_at IS NULL" filter on every query
CREATE INDEX IF NOT EXISTS idx_sports_deleted ON sports(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leagues_deleted ON leagues(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_seasons_deleted ON seasons(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_teams_deleted ON teams(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_players_deleted ON players(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_matches_deleted ON matches(deleted_at) WHERE deleted_at IS NULL;

-- Composite indices combining deletion filter with common queries
-- These make filtered queries performant (e.g., "active leagues, not deleted")
CREATE INDEX IF NOT EXISTS idx_leagues_active_deleted ON leagues(deleted_at) WHERE active = TRUE AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_matches_live_deleted ON matches(phase, deleted_at) WHERE phase NOT IN ('finished', 'postponed', 'cancelled', 'scheduled') AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_matches_league_deleted ON matches(league_id, deleted_at) WHERE deleted_at IS NULL;

-- Helper function for soft deletes with audit trail
-- Usage: SELECT soft_delete_entity('leagues', league_id, 'reason_text');
CREATE OR REPLACE FUNCTION soft_delete_entity(
    p_table_name TEXT,
    p_id UUID,
    p_reason TEXT DEFAULT 'User requested deletion'
)
RETURNS VOID AS $$
BEGIN
    EXECUTE format(
        'UPDATE %I SET deleted_at = NOW() WHERE id = %L AND deleted_at IS NULL',
        p_table_name,
        p_id
    );
END;
$$ LANGUAGE plpgsql;

-- Helper function for restoring soft-deleted entities
-- Usage: SELECT restore_entity('leagues', league_id);
CREATE OR REPLACE FUNCTION restore_entity(
    p_table_name TEXT,
    p_id UUID
)
RETURNS VOID AS $$
BEGIN
    EXECUTE format(
        'UPDATE %I SET deleted_at = NULL WHERE id = %L',
        p_table_name,
        p_id
    );
END;
$$ LANGUAGE plpgsql;

-- Helper function for hard delete (permanent removal, for GDPR requests)
-- Usage: SELECT hard_delete_entity('leagues', league_id, 'GDPR request');
-- WARNING: This is permanent and cannot be undone!
CREATE OR REPLACE FUNCTION hard_delete_entity(
    p_table_name TEXT,
    p_id UUID,
    p_reason TEXT DEFAULT 'Hard delete'
)
RETURNS VOID AS $$
BEGIN
    -- Log deletion reason for audit (if audit table exists)
    -- EXECUTE format(
    --     'INSERT INTO audit_log (table_name, record_id, action, reason) VALUES (%L, %L, %L, %L)',
    --     p_table_name, p_id, 'hard_delete', p_reason
    -- );

    EXECUTE format(
        'DELETE FROM %I WHERE id = %L',
        p_table_name,
        p_id
    );
END;
$$ LANGUAGE plpgsql;

-- Example queries (use these patterns in ORM code):

-- Fetch active entities (not deleted)
-- SELECT * FROM leagues WHERE deleted_at IS NULL;

-- Fetch soft-deleted entities (for recovery)
-- SELECT * FROM leagues WHERE deleted_at IS NOT NULL;

-- Fetch entities deleted in last 30 days (for audit)
-- SELECT * FROM leagues WHERE deleted_at > NOW() - INTERVAL '30 days';

-- Restore recently deleted league
-- UPDATE leagues SET deleted_at = NULL WHERE id = '...' AND deleted_at IS NOT NULL;

-- Count deleted vs active leagues
-- SELECT COUNT(*) FILTER (WHERE deleted_at IS NULL) as active, COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) as deleted FROM leagues;
