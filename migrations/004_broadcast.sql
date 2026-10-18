-- 004_broadcast.sql
-- Migration: Add is_broadcasted tracking to orders table and broadcast settings to bot_settings

-- 1. Add is_broadcasted column to orders table if not exists
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_broadcasted BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Index for broadcast status
CREATE INDEX IF NOT EXISTS idx_orders_is_broadcasted ON orders (is_broadcasted);

-- 3. Default broadcast configuration in bot_settings
INSERT INTO bot_settings (key, value)
VALUES 
    ('broadcast_channel', '@DafungHub'),
    ('broadcast_auto_order', 'true')
ON CONFLICT (key) DO NOTHING;
