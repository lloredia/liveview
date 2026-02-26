-- Index for scoreboard freshness / recent updates queries
CREATE INDEX IF NOT EXISTS idx_match_state_updated_at ON match_state(updated_at);
