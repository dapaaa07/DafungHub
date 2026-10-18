import { query } from './db';

/**
 * Dafung Hub - Advanced Voucher Management & Verification Engine
 */

export type VoucherType = 'all_products' | 'product' | 'membership' | 'deposit_cashback';
export type DiscountType = 'nominal' | 'percent';

export interface Voucher {
  id: string;
  code: string;
  type: VoucherType;
  discount_type: DiscountType;
  discount_value: number;
  product_target: string | null;
  min_order_amount: number;
  max_uses: number;
  used_count: number;
  is_active: boolean;
  expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface VoucherValidationResult {
  valid: boolean;
  voucher?: Voucher;
  discountAmount: number;
  cashbackAmount: number;
  message: string;
}

// In-memory pending vouchers applied by users during active chat sessions (30-min TTL)
export interface PendingVoucherSession {
  code: string;
  appliedAt: number;
}
const pendingUserVouchers = new Map<string, PendingVoucherSession>();

export function setPendingUserVoucher(telegramId: string, code: string): void {
  pendingUserVouchers.set(String(telegramId), {
    code: code.trim().toUpperCase(),
    appliedAt: Date.now(),
  });
}

export function getPendingUserVoucher(telegramId: string): string | null {
  const session = pendingUserVouchers.get(String(telegramId));
  if (!session) return null;
  // 30 minute expiration for pending voucher session
  if (Date.now() - session.appliedAt > 30 * 60 * 1000) {
    pendingUserVouchers.delete(String(telegramId));
    return null;
  }
  return session.code;
}

export function clearPendingUserVoucher(telegramId: string): void {
  pendingUserVouchers.delete(String(telegramId));
}

/**
 * Get human-readable label for voucher type
 */
export function getVoucherTypeLabel(type: VoucherType): string {
  switch (type) {
    case 'all_products':
      return 'Semua Produk';
    case 'product':
      return 'Produk Khusus';
    case 'membership':
      return 'Paket Membership';
    case 'deposit_cashback':
      return 'Cashback Deposit';
    default:
      return type;
  }
}

/**
 * Format human-readable benefit description of a voucher
 */
export function formatVoucherBenefit(v: Voucher): string {
  const valueStr =
    v.discount_type === 'percent'
      ? `${v.discount_value}%`
      : `Rp ${Number(v.discount_value).toLocaleString('id-ID')}`;

  switch (v.type) {
    case 'all_products':
      return `Potongan ${valueStr} untuk seluruh produk`;
    case 'product':
      return `Potongan ${valueStr} khusus produk "${v.product_target || 'Pilihan'}"`;
    case 'membership':
      return `Diskon ${valueStr} pembelian paket Membership VIP`;
    case 'deposit_cashback':
      return `Bonus Saldo Cashback ${valueStr} saat deposit`;
    default:
      return `Potongan ${valueStr}`;
  }
}

/**
 * Create a new promotional voucher in the database
 */
export async function createVoucher(params: {
  code: string;
  type: VoucherType;
  discountType?: DiscountType;
  discountValue: number;
  productTarget?: string | null;
  minOrderAmount?: number;
  maxUses?: number;
  expiresAt?: Date | null;
}): Promise<Voucher> {
  const cleanCode = params.code.trim().toUpperCase();
  const discountType = params.discountType || 'nominal';
  const minOrder = Math.max(0, params.minOrderAmount || 0);
  const maxUses = Math.max(1, params.maxUses || 10);

  const res = await query<Voucher>(
    `INSERT INTO vouchers (
       code,
       type,
       discount_type,
       discount_value,
       product_target,
       min_order_amount,
       max_uses,
       used_count,
       is_active,
       expires_at,
       created_at,
       updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, true, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     RETURNING *`,
    [
      cleanCode,
      params.type,
      discountType,
      params.discountValue,
      params.productTarget ? params.productTarget.trim() : null,
      minOrder,
      maxUses,
      params.expiresAt || null,
    ]
  );

  return res.rows[0];
}

/**
 * Retrieve all vouchers ordered by creation date
 */
export async function getAllVouchers(): Promise<Voucher[]> {
  const res = await query<Voucher>(
    `SELECT * FROM vouchers ORDER BY created_at DESC LIMIT 50`
  );
  return res.rows;
}

/**
 * Find a voucher by its unique code
 */
export async function getVoucherByCode(code: string): Promise<Voucher | null> {
  if (!code) return null;
  const cleanCode = code.trim().toUpperCase();
  const res = await query<Voucher>(
    `SELECT * FROM vouchers WHERE code = $1 LIMIT 1`,
    [cleanCode]
  );
  return res.rows[0] || null;
}

/**
 * Delete a voucher by ID
 */
export async function deleteVoucher(voucherId: string): Promise<boolean> {
  const res = await query(`DELETE FROM vouchers WHERE id = $1 RETURNING id`, [voucherId]);
  return res.rowCount !== null && res.rowCount > 0;
}

/**
 * Toggle voucher active / inactive status
 */
export async function toggleVoucherStatus(voucherId: string, isActive: boolean): Promise<boolean> {
  const res = await query(
    `UPDATE vouchers SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id`,
    [isActive, voucherId]
  );
  return res.rowCount !== null && res.rowCount > 0;
}

/**
 * Check if a user has already redeemed a specific voucher
 */
export async function hasUserUsedVoucher(voucherId: string, userId: string): Promise<boolean> {
  const res = await query(
    `SELECT id FROM voucher_usages WHERE voucher_id = $1 AND user_id = $2 LIMIT 1`,
    [voucherId, userId]
  );
  return res.rows.length > 0;
}

/**
 * Validate a voucher for a pending transaction
 */
export async function validateVoucherForTransaction(params: {
  code: string;
  userId?: string | null;
  telegramId?: string | null;
  transactionType: 'product' | 'membership' | 'deposit';
  productName?: string;
  productId?: string;
  amount: number;
}): Promise<VoucherValidationResult> {
  const code = (params.code || '').trim().toUpperCase();
  if (!code) {
    return { valid: false, discountAmount: 0, cashbackAmount: 0, message: 'Kode voucher tidak boleh kosong.' };
  }

  const voucher = await getVoucherByCode(code);
  if (!voucher) {
    return { valid: false, discountAmount: 0, cashbackAmount: 0, message: `Voucher "${code}" tidak ditemukan.` };
  }

  if (!voucher.is_active) {
    return { valid: false, voucher, discountAmount: 0, cashbackAmount: 0, message: `Voucher "${code}" sedang dinonaktifkan.` };
  }

  // Check expiration date
  if (voucher.expires_at && new Date().getTime() > new Date(voucher.expires_at).getTime()) {
    return { valid: false, voucher, discountAmount: 0, cashbackAmount: 0, message: `Voucher "${code}" telah kedaluwarsa.` };
  }

  // Check if user already used this voucher
  let resolvedUserId = params.userId;
  if (!resolvedUserId && params.telegramId) {
    const userRes = await query<{ id: string }>(
      `SELECT id FROM users WHERE telegram_id = $1 LIMIT 1`,
      [params.telegramId]
    );
    if (userRes.rows.length > 0) {
      resolvedUserId = userRes.rows[0].id;
    }
  }

  if (resolvedUserId) {
    const alreadyUsed = await hasUserUsedVoucher(voucher.id, resolvedUserId);
    if (alreadyUsed) {
      return {
        valid: false,
        voucher,
        discountAmount: 0,
        cashbackAmount: 0,
        message: `Anda sudah pernah menggunakan voucher "${code}" sebelumnya. (1 voucher berlaku 1 kali per akun).`,
      };
    }
  }

  // Check total usage quota
  if (voucher.used_count >= voucher.max_uses) {
    return {
      valid: false,
      voucher,
      discountAmount: 0,
      cashbackAmount: 0,
      message: `Kuota voucher "${code}" telah habis (${voucher.used_count}/${voucher.max_uses} pengguna).`,
    };
  }

  // Check minimum order amount
  if (voucher.min_order_amount > 0 && params.amount < voucher.min_order_amount) {
    return {
      valid: false,
      voucher,
      discountAmount: 0,
      cashbackAmount: 0,
      message: `Minimum transaksi untuk voucher ini adalah Rp ${voucher.min_order_amount.toLocaleString('id-ID')}.`,
    };
  }

  // Validate Type Compatibility
  const txnType = params.transactionType;

  if (txnType === 'deposit') {
    if (voucher.type !== 'deposit_cashback') {
      return {
        valid: false,
        voucher,
        discountAmount: 0,
        cashbackAmount: 0,
        message: `Voucher "${code}" hanya berlaku untuk pembelian produk, bukan deposit saldo.`,
      };
    }

    // Calculate cashback amount
    let cashback = 0;
    if (voucher.discount_type === 'percent') {
      cashback = Math.round((params.amount * voucher.discount_value) / 100);
    } else {
      cashback = voucher.discount_value;
    }

    return {
      valid: true,
      voucher,
      discountAmount: 0,
      cashbackAmount: cashback,
      message: `Voucher valid! Anda akan mendapatkan bonus saldo cashback Rp ${cashback.toLocaleString('id-ID')}.`,
    };
  }

  if (txnType === 'membership') {
    if (voucher.type !== 'membership' && voucher.type !== 'all_products') {
      return {
        valid: false,
        voucher,
        discountAmount: 0,
        cashbackAmount: 0,
        message: `Voucher "${code}" tidak berlaku untuk paket Membership VIP.`,
      };
    }

    let discount = 0;
    if (voucher.discount_type === 'percent') {
      discount = Math.round((params.amount * voucher.discount_value) / 100);
    } else {
      discount = voucher.discount_value;
    }
    discount = Math.min(discount, params.amount);

    return {
      valid: true,
      voucher,
      discountAmount: discount,
      cashbackAmount: 0,
      message: `Voucher valid! Potongan harga Rp ${discount.toLocaleString('id-ID')} berhasil diterapkan.`,
    };
  }

  // Product purchase
  if (voucher.type === 'deposit_cashback') {
    return {
      valid: false,
      voucher,
      discountAmount: 0,
      cashbackAmount: 0,
      message: `Voucher "${code}" khusus untuk deposit saldo akun, bukan pembelian produk.`,
    };
  }

  if (voucher.type === 'membership') {
    return {
      valid: false,
      voucher,
      discountAmount: 0,
      cashbackAmount: 0,
      message: `Voucher "${code}" khusus untuk pembelian paket Membership VIP.`,
    };
  }

  if (voucher.type === 'product') {
    const target = (voucher.product_target || '').toLowerCase().trim();
    const prodName = (params.productName || '').toLowerCase();
    const prodId = (params.productId || '').toLowerCase();

    const matches = target.length > 0 && (prodName.includes(target) || prodId === target || prodId.includes(target));
    if (!matches) {
      return {
        valid: false,
        voucher,
        discountAmount: 0,
        cashbackAmount: 0,
        message: `Voucher "${code}" hanya berlaku untuk produk bertarget "${voucher.product_target}".`,
      };
    }
  }

  // Calculate discount for all_products or targeted product
  let discount = 0;
  if (voucher.discount_type === 'percent') {
    discount = Math.round((params.amount * voucher.discount_value) / 100);
  } else {
    discount = voucher.discount_value;
  }
  discount = Math.min(discount, params.amount);

  return {
    valid: true,
    voucher,
    discountAmount: discount,
    cashbackAmount: 0,
    message: `Voucher valid! Potongan harga Rp ${discount.toLocaleString('id-ID')} berhasil diterapkan.`,
  };
}

/**
 * Record voucher redemption upon successful payment
 */
export async function applyVoucherUsage(params: {
  voucherId: string;
  userId: string;
  orderId?: string | null;
  discountAmount: number;
}): Promise<void> {
  try {
    await query(
      `INSERT INTO voucher_usages (voucher_id, user_id, order_id, discount_amount, created_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (voucher_id, user_id) DO NOTHING`,
      [params.voucherId, params.userId, params.orderId || null, params.discountAmount]
    );

    await query(
      `UPDATE vouchers
       SET used_count = used_count + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [params.voucherId]
    );

    console.log(
      `[Voucher] Successfully recorded usage of voucher ${params.voucherId} by user ${params.userId}`
    );
  } catch (err) {
    console.error('[Voucher] Error recording voucher usage:', err);
  }
}
