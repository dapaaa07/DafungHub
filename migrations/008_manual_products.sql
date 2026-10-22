-- 008_manual_products.sql
-- Migration: Add description, is_manual, and requires_email to products table

ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_manual BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS requires_email BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_products_is_manual ON products (is_manual);
