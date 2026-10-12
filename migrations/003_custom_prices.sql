-- 003_custom_prices.sql
-- Migration: Add table for custom product price overrides (managed by Owner/Admin)

CREATE TABLE IF NOT EXISTS product_prices (
    product_id VARCHAR(100) PRIMARY KEY,
    product_name VARCHAR(255),
    custom_price INTEGER NOT NULL CHECK (custom_price >= 0),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for searching by product_name or alias
CREATE INDEX IF NOT EXISTS idx_product_prices_product_name ON product_prices (product_name);
