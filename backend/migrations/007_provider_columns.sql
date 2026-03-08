-- Add provider identity columns to matches for provider router (SportRadar primary, ESPN fallback).
ALTER TABLE matches ADD COLUMN IF NOT EXISTS provider_name VARCHAR(32) NOT NULL DEFAULT 'espn';
ALTER TABLE matches ADD COLUMN IF NOT EXISTS provider_id VARCHAR(128);
CREATE INDEX IF NOT EXISTS idx_matches_provider ON matches(provider_name, provider_id);
