import { query } from './db';

/**
 * Dafung Hub - VIP Membership & Transaction Fee Engine
 */

export const TRANSACTION_FEE = 100; // Rp 100 hidden transaction fee on all transactions
export const MEMBERSHIP_PRODUCT_DISCOUNT = 1000; // Rp 1.000 discount per product
export const MEMBERSHIP_WEEKLY_QUOTA_LIMIT = 20000; // Rp 20.000 max discount per week

export interface MembershipPackage {
  id: string;
  name: string;
  durationMonths: number;
  durationDays: number;
  price: number;
  badge: string;
  tagline: string;
}

export const MEMBERSHIP_PACKAGES: MembershipPackage[] = [
  {
    id: 'vip_1m',
    name: 'Membership VIP 1 Bulan',
    durationMonths: 1,
    durationDays: 30,
    price: 3000,
    badge: '🥉 1 Bulan',
    tagline: 'Aktif 30 Hari — Hemat Rp 1.000 / produk',
  },
  {
    id: 'vip_3m',
    name: 'Membership VIP 3 Bulan',
    durationMonths: 3,
    durationDays: 90,
    price: 9000,
    badge: '🥈 3 Bulan',
    tagline: 'Aktif 90 Hari — Lebih hemat & tenang',
  },
  {
    id: 'vip_6m',
    name: 'Membership VIP 6 Bulan',
    durationMonths: 6,
    durationDays: 180,
    price: 17000,
    badge: '🥇 6 Bulan',
    tagline: 'Aktif 180 Hari — Diskon paket Rp 1.000',
  },
  {
    id: 'vip_12m',
    name: 'Membership VIP 12 Bulan',
    durationMonths: 12,
    durationDays: 365,
    price: 34000,
    badge: '👑 12 Bulan (1 Tahun)',
    tagline: 'Aktif 365 Hari — Paling Populer & Super Hemat',
  },
];

export interface UserMembershipStatus {
  userId: string;
  telegramId: string;
  isVip: boolean;
  tier: string;
  expiresAt: Date | null;
  daysRemaining: number;
  weeklyUsed: number;
  weeklyLimit: number;
  remainingWeeklyQuota: number;
  resetAt: Date | null;
}

/**
 * Check if a product is a membership subscription product
 */
export function isMembershipProduct(productName: string): boolean {
  if (!productName) return false;
  return /\bmembership\b/i.test(productName);
}

/**
 * Check if a product is a deposit / balance top-up product
 */
export function isDepositProduct(productName: string): boolean {
  if (!productName) return false;
  const lower = productName.toLowerCase();
  return lower.includes('deposit saldo') || lower.startsWith('deposit');
}

/**
 * Get membership package matching a product name or package ID
 */
export function findMembershipPackage(identifier: string): MembershipPackage | null {
  const clean = identifier.trim().toLowerCase();
  return (
    MEMBERSHIP_PACKAGES.find(
      (pkg) =>
        pkg.id.toLowerCase() === clean ||
        pkg.name.toLowerCase() === clean ||
        clean.includes(pkg.name.toLowerCase())
    ) || null
  );
}

/**
 * Format date in Indonesian WIB (e.g. 18 Nov 2026, 21:00 WIB)
 */
export function formatWibDate(dateInput?: Date | string | null): string {
  if (!dateInput) return '-';
  const d = new Date(dateInput);
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
  ];
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const wib = new Date(utc + 7 * 3600000);

  const day = wib.getDate();
  const month = months[wib.getMonth()];
  const year = wib.getFullYear();
  const hours = String(wib.getHours()).padStart(2, '0');
  const minutes = String(wib.getMinutes()).padStart(2, '0');

  return `${day} ${month} ${year}, ${hours}:${minutes} WIB`;
}

/**
 * Fetch and validate user's live membership status (with automatic weekly quota refresh)
 */
export async function getUserMembership(
  telegramIdOrUserId: string
): Promise<UserMembershipStatus> {
  const userRes = await query<{
    id: string;
    telegram_id: string;
    membership_tier: string;
    membership_expires_at: Date | null;
    weekly_discount_used: number;
    weekly_discount_reset_at: Date | null;
  }>(
    `SELECT id, telegram_id, membership_tier, membership_expires_at,
            weekly_discount_used, weekly_discount_reset_at
     FROM users
     WHERE telegram_id = $1 OR id::text = $1
     LIMIT 1`,
    [telegramIdOrUserId]
  );

  if (userRes.rows.length === 0) {
    return {
      userId: '',
      telegramId: telegramIdOrUserId,
      isVip: false,
      tier: 'free',
      expiresAt: null,
      daysRemaining: 0,
      weeklyUsed: 0,
      weeklyLimit: MEMBERSHIP_WEEKLY_QUOTA_LIMIT,
      remainingWeeklyQuota: MEMBERSHIP_WEEKLY_QUOTA_LIMIT,
      resetAt: null,
    };
  }

  const user = userRes.rows[0];
  const now = new Date();
  const expiresAt = user.membership_expires_at ? new Date(user.membership_expires_at) : null;
  const isVip = Boolean(expiresAt && expiresAt.getTime() > now.getTime() && user.membership_tier === 'vip');

  let daysRemaining = 0;
  if (isVip && expiresAt) {
    daysRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  }

  // Handle weekly quota refresh if reset date has passed or was null
  let weeklyUsed = Number(user.weekly_discount_used || 0);
  let resetAt = user.weekly_discount_reset_at ? new Date(user.weekly_discount_reset_at) : null;

  if (!resetAt || now.getTime() >= resetAt.getTime()) {
    weeklyUsed = 0;
    resetAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
    await query(
      `UPDATE users
       SET weekly_discount_used = 0,
           weekly_discount_reset_at = $1
       WHERE id = $2`,
      [resetAt, user.id]
    ).catch(() => {});
  }

  const remainingWeeklyQuota = Math.max(0, MEMBERSHIP_WEEKLY_QUOTA_LIMIT - weeklyUsed);

  return {
    userId: user.id,
    telegramId: user.telegram_id,
    isVip,
    tier: isVip ? 'vip' : 'free',
    expiresAt,
    daysRemaining,
    weeklyUsed,
    weeklyLimit: MEMBERSHIP_WEEKLY_QUOTA_LIMIT,
    remainingWeeklyQuota,
    resetAt,
  };
}

/**
 * Calculate pricing for checkout: applies VIP discount and adds the +Rp 100 hidden fee.
 */
export async function calculateCheckoutPrice(
  telegramIdOrUserId: string,
  product: { name: string; price: number }
): Promise<{
  basePrice: number;
  discount: number;
  fee: number;
  finalPayableAmount: number;
  isVipDiscountApplied: boolean;
  remainingQuotaAfter: number;
  membershipStatus: UserMembershipStatus;
}> {
  const membershipStatus = await getUserMembership(telegramIdOrUserId);
  const basePrice = Number(product.price || 0);
  const isSpecialProduct = isMembershipProduct(product.name) || isDepositProduct(product.name);

  let discount = 0;
  let isVipDiscountApplied = false;

  // VIP members get Rp 1.000 off regular products if weekly quota has at least Rp 1.000 remaining
  if (
    membershipStatus.isVip &&
    !isSpecialProduct &&
    membershipStatus.remainingWeeklyQuota >= MEMBERSHIP_PRODUCT_DISCOUNT &&
    basePrice > MEMBERSHIP_PRODUCT_DISCOUNT
  ) {
    discount = MEMBERSHIP_PRODUCT_DISCOUNT;
    isVipDiscountApplied = true;
  }

  const fee = TRANSACTION_FEE; // Rp 100
  const priceAfterDiscount = Math.max(0, basePrice - discount);
  const finalPayableAmount = priceAfterDiscount + fee;
  const remainingQuotaAfter = Math.max(0, membershipStatus.remainingWeeklyQuota - discount);

  return {
    basePrice,
    discount,
    fee,
    finalPayableAmount,
    isVipDiscountApplied,
    remainingQuotaAfter,
    membershipStatus,
  };
}

/**
 * Record weekly discount usage when a VIP member's order payment is confirmed
 */
export async function recordDiscountUsage(userId: string, discountAmount: number): Promise<void> {
  if (discountAmount <= 0) return;
  await query(
    `UPDATE users
     SET weekly_discount_used = weekly_discount_used + $1
     WHERE id = $2`,
    [discountAmount, userId]
  ).catch((err) => {
    console.error('[Membership] Error recording discount usage:', err);
  });
}

/**
 * Activate or extend a user's VIP membership
 */
export async function activateOrExtendMembership(
  userId: string,
  durationDays: number
): Promise<{ success: boolean; newExpiresAt: Date; extended: boolean }> {
  try {
    const userRes = await query<{
      membership_expires_at: Date | null;
      weekly_discount_reset_at: Date | null;
    }>(
      `SELECT membership_expires_at, weekly_discount_reset_at FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );

    if (userRes.rows.length === 0) {
      return { success: false, newExpiresAt: new Date(), extended: false };
    }

    const currentExpires = userRes.rows[0].membership_expires_at
      ? new Date(userRes.rows[0].membership_expires_at)
      : null;
    const now = new Date();
    const isActive = Boolean(currentExpires && currentExpires.getTime() > now.getTime());

    let newExpiresAt: Date;
    let extended = false;

    if (isActive && currentExpires) {
      newExpiresAt = new Date(currentExpires.getTime() + durationDays * 24 * 60 * 60 * 1000);
      extended = true;
    } else {
      newExpiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
      extended = false;
    }

    // Set reset_at to now + 7 days if not set
    let resetAt = userRes.rows[0].weekly_discount_reset_at;
    if (!resetAt) {
      resetAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    }

    await query(
      `UPDATE users
       SET membership_tier = 'vip',
           membership_expires_at = $1,
           weekly_discount_reset_at = COALESCE(weekly_discount_reset_at, $2)
       WHERE id = $3`,
      [newExpiresAt, resetAt, userId]
    );

    console.log(
      `[Membership] User ${userId} ${extended ? 'extended' : 'activated'} VIP membership until ${newExpiresAt.toISOString()}`
    );

    return { success: true, newExpiresAt, extended };
  } catch (err) {
    console.error('[Membership] Failed to activate/extend membership:', err);
    throw err;
  }
}
