-- 002_bot_settings.sql
-- Migration: Add persistent key-value configuration table for bot settings (e.g., bot_status)

CREATE TABLE IF NOT EXISTS bot_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Initialize default bot_status as 'online'
INSERT INTO bot_settings (key, value)
VALUES ('bot_status', 'online')
ON CONFLICT (key) DO NOTHING;
