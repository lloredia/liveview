-- Migration 005: Notification system tables
-- devices, tracked_games, web_push_subscriptions, ios_push_tokens, notification_log, notification_inbox

BEGIN;

CREATE TABLE IF NOT EXISTS devices (
    device_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform VARCHAR(10) NOT NULL CHECK (platform IN ('web', 'ios')),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tracked_games (
    device_id UUID NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    game_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    sport VARCHAR(30),
    league VARCHAR(200),
    notify_flags JSONB NOT NULL DEFAULT '{"score": true, "lead_change": true, "start": true, "halftime": false, "final": true, "ot": true, "major_events": true}',
    quiet_hours JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (device_id, game_id)
);

CREATE INDEX IF NOT EXISTS idx_tracked_games_game_id ON tracked_games(game_id);
CREATE INDEX IF NOT EXISTS idx_tracked_games_device_id ON tracked_games(device_id);

CREATE TABLE IF NOT EXISTS web_push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_web_push_device ON web_push_subscriptions(device_id);

CREATE TABLE IF NOT EXISTS ios_push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    apns_token TEXT NOT NULL UNIQUE,
    bundle_id VARCHAR(200) NOT NULL DEFAULT 'com.liveview.tracker',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ios_push_device ON ios_push_tokens(device_id);

CREATE TABLE IF NOT EXISTS notification_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    game_id UUID NOT NULL,
    event_type VARCHAR(30) NOT NULL,
    event_hash VARCHAR(128) NOT NULL,
    delivered_via VARCHAR(20) NOT NULL CHECK (delivered_via IN ('web_push', 'apns', 'in_app')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_log_device_hash ON notification_log(device_id, event_hash);
CREATE INDEX IF NOT EXISTS idx_notification_log_created ON notification_log(created_at);

CREATE TABLE IF NOT EXISTS notification_inbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    game_id UUID NOT NULL,
    event_type VARCHAR(30) NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '{}',
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_inbox_device ON notification_inbox(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_inbox_unread ON notification_inbox(device_id) WHERE is_read = FALSE;

COMMIT;
