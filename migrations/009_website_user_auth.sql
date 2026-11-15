-- 009_website_user_auth.sql
-- Migration: Support customer registration & auth via email, phone number, and Google OAuth

-- 1. Make telegram_id nullable in public.users (allowing website-only users)
ALTER TABLE public.users ALTER COLUMN telegram_id DROP NOT NULL;

-- 2. Add email, phone, name, password_hash, google_id, and avatar_url
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email VARCHAR(255) NULL UNIQUE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone VARCHAR(50) NULL UNIQUE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS name VARCHAR(255) NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) NULL UNIQUE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url TEXT NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- 3. Create indexes for fast lookup during login and checkout
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users (email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON public.users (phone);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON public.users (google_id);

