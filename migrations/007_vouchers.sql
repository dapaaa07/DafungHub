-- 007_vouchers.sql
-- Migration: Add vouchers and voucher_usages tables for promotional promo codes

CREATE TABLE IF NOT EXISTS public.vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  type VARCHAR(50) NOT NULL, -- 'all_products', 'product', 'membership', 'deposit_cashback'
  discount_type VARCHAR(20) NOT NULL DEFAULT 'nominal', -- 'nominal', 'percent'
  discount_value INT NOT NULL, -- e.g. 2000 for Rp 2.000 or 10 for 10%
  product_target VARCHAR(255) NULL, -- target product ID or name keyword if type == 'product'
  min_order_amount INT NOT NULL DEFAULT 0,
  max_uses INT NOT NULL DEFAULT 10, -- maximum total uses allowed across all users
  used_count INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.voucher_usages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id UUID NOT NULL REFERENCES public.vouchers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  order_id UUID NULL REFERENCES public.orders(id) ON DELETE SET NULL,
  discount_amount INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_voucher_user UNIQUE (voucher_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_vouchers_code ON public.vouchers(code);
CREATE INDEX IF NOT EXISTS idx_vouchers_active ON public.vouchers(is_active);
CREATE INDEX IF NOT EXISTS idx_voucher_usages_user ON public.voucher_usages(user_id);
