-- 005_user_balance.sql
-- Migration: Add balance column to users table for user wallet in Dafung Hub

ALTER TABLE users ADD COLUMN IF NOT EXISTS balance INT NOT NULL DEFAULT 0;
