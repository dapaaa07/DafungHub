-- 006_membership.sql
-- Migration: Add membership tiers, expiry, and weekly discount quota tracking to users table

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS membership_tier VARCHAR(50) NOT NULL DEFAULT 'free';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS membership_expires_at TIMESTAMPTZ NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS weekly_discount_used INT NOT NULL DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS weekly_discount_reset_at TIMESTAMPTZ NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days');

-- Index for checking active memberships efficiently
CREATE INDEX IF NOT EXISTS idx_users_membership_expires_at ON public.users (membership_expires_at);
