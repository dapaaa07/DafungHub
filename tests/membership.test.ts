import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEMBERSHIP_PACKAGES,
  MEMBERSHIP_PRODUCT_DISCOUNT,
  MEMBERSHIP_WEEKLY_QUOTA_LIMIT,
  TRANSACTION_FEE,
  isMembershipProduct,
  isDepositProduct,
  findMembershipPackage,
  calculateCheckoutPrice,
  getUserMembership,
  activateOrExtendMembership,
  recordDiscountUsage,
} from '../lib/membership';
import { query } from '../lib/db';

test('Membership Packages: pricing and durations match user specifications exactly', () => {
  const p1m = MEMBERSHIP_PACKAGES.find((p) => p.id === 'vip_1m');
  assert.ok(p1m);
  assert.equal(p1m.price, 3000, '1 Bulan package must be Rp 3.000');
  assert.equal(p1m.durationDays, 30);

  const p3m = MEMBERSHIP_PACKAGES.find((p) => p.id === 'vip_3m');
  assert.ok(p3m);
  assert.equal(p3m.price, 9000, '3 Bulan package must be Rp 9.000');
  assert.equal(p3m.durationDays, 90);

  const p6m = MEMBERSHIP_PACKAGES.find((p) => p.id === 'vip_6m');
  assert.ok(p6m);
  assert.equal(p6m.price, 17000, '6 Bulan package must be Rp 17.000');
  assert.equal(p6m.durationDays, 180);

  const p12m = MEMBERSHIP_PACKAGES.find((p) => p.id === 'vip_12m');
  assert.ok(p12m);
  assert.equal(p12m.price, 34000, '12 Bulan package must be Rp 34.000');
  assert.equal(p12m.durationDays, 365);

  assert.equal(MEMBERSHIP_PRODUCT_DISCOUNT, 1000, 'Per product discount must be Rp 1.000');
  assert.equal(MEMBERSHIP_WEEKLY_QUOTA_LIMIT, 20000, 'Weekly quota limit must be Rp 20.000');
  assert.equal(TRANSACTION_FEE, 100, 'Hidden transaction fee must be Rp 100');
});

test('Membership Product Detection: accurately identifies membership vs deposit vs regular products', () => {
  assert.equal(isMembershipProduct('Membership VIP 1 Bulan'), true);
  assert.equal(isMembershipProduct('VIP Membership 12 Bulan (1 Tahun)'), true);
  assert.equal(isMembershipProduct('Canva Pro 1 Bulan'), false);
  assert.equal(isMembershipProduct('Deposit Saldo Rp 10.000'), false);

  assert.equal(isDepositProduct('Deposit Saldo Rp 25.000'), true);
  assert.equal(isDepositProduct('Deposit 50000'), true);
  assert.equal(isDepositProduct('Netflix Premium 1 Bulan'), false);
  assert.equal(isDepositProduct('Membership VIP 1 Bulan'), false);
});

test('Membership Lookup: findMembershipPackage finds package by ID or name', () => {
  assert.equal(findMembershipPackage('vip_1m')?.price, 3000);
  assert.equal(findMembershipPackage('vip_3m')?.price, 9000);
  assert.equal(findMembershipPackage('Membership VIP 6 Bulan')?.durationDays, 180);
  assert.equal(findMembershipPackage('Membership VIP 12 Bulan')?.price, 34000);
});

test('Transaction Fee & Pricing: Non-VIP user gets Rp 100 hidden fee without discount', async () => {
  const dummyTgId = `tg_test_nonvip_${Date.now()}`;
  // Ensure user is free
  await query(
    `INSERT INTO users (telegram_id, role, membership_tier, balance)
     VALUES ($1, 'buyer', 'free', 0)
     ON CONFLICT (telegram_id) DO UPDATE SET membership_tier = 'free', membership_expires_at = NULL`,
    [dummyTgId]
  );

  const pricing = await calculateCheckoutPrice(dummyTgId, {
    name: 'Netflix Premium 1 Bulan',
    price: 35000,
  });

  assert.equal(pricing.basePrice, 35000);
  assert.equal(pricing.discount, 0, 'Non-VIP must receive 0 discount');
  assert.equal(pricing.isVipDiscountApplied, false);
  assert.equal(pricing.fee, 100, 'Transaction fee must be Rp 100');
  assert.equal(pricing.finalPayableAmount, 35100, 'Payable amount must be base + 100');

  // Clean up
  await query('DELETE FROM users WHERE telegram_id = $1', [dummyTgId]);
});

test('Membership Discount: VIP user gets Rp 1.000 discount + Rp 100 fee on regular products', async () => {
  const dummyTgId = `tg_test_vip_${Date.now()}`;
  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const userRes = await query<{ id: string }>(
    `INSERT INTO users (telegram_id, role, membership_tier, membership_expires_at, weekly_discount_used)
     VALUES ($1, 'buyer', 'vip', $2, 0)
     RETURNING id`,
    [dummyTgId, futureDate]
  );
  const userId = userRes.rows[0].id;

  const pricing = await calculateCheckoutPrice(dummyTgId, {
    name: 'Canva Pro 1 Bulan',
    price: 6000,
  });

  assert.equal(pricing.basePrice, 6000);
  assert.equal(pricing.discount, 1000, 'VIP must receive Rp 1.000 discount');
  assert.equal(pricing.isVipDiscountApplied, true);
  assert.equal(pricing.fee, 100, 'Transaction fee must be Rp 100');
  assert.equal(pricing.finalPayableAmount, 5100, 'Payable amount must be 6000 - 1000 + 100 = 5100');

  // Simulate recording discount usage
  await recordDiscountUsage(userId, 1000);
  const updatedStatus = await getUserMembership(dummyTgId);
  assert.equal(updatedStatus.weeklyUsed, 1000);
  assert.equal(updatedStatus.remainingWeeklyQuota, 19000);

  // Clean up
  await query('DELETE FROM users WHERE id = $1', [userId]);
});

test('Membership Exclusions: VIP discount does NOT apply to membership packages or deposit', async () => {
  const dummyTgId = `tg_test_vip_ex_${Date.now()}`;
  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await query(
    `INSERT INTO users (telegram_id, role, membership_tier, membership_expires_at, weekly_discount_used)
     VALUES ($1, 'buyer', 'vip', $2, 0)`,
    [dummyTgId, futureDate]
  );

  // 1. Membership purchase
  const memPricing = await calculateCheckoutPrice(dummyTgId, {
    name: 'Membership VIP 3 Bulan',
    price: 9000,
  });
  assert.equal(memPricing.discount, 0, 'Membership packages must NOT get discount');
  assert.equal(memPricing.fee, 100);
  assert.equal(memPricing.finalPayableAmount, 9100);

  // 2. Deposit
  const depPricing = await calculateCheckoutPrice(dummyTgId, {
    name: 'Deposit Saldo Rp 50.000',
    price: 50000,
  });
  assert.equal(depPricing.discount, 0, 'Deposit must NOT get discount');
  assert.equal(depPricing.fee, 100);
  assert.equal(depPricing.finalPayableAmount, 50100);

  // Clean up
  await query('DELETE FROM users WHERE telegram_id = $1', [dummyTgId]);
});

test('Weekly Quota Limit: When weekly discount reaches Rp 20.000, discount stops', async () => {
  const dummyTgId = `tg_test_vip_quota_${Date.now()}`;
  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const resetIn5Days = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);

  await query(
    `INSERT INTO users (telegram_id, role, membership_tier, membership_expires_at, weekly_discount_used, weekly_discount_reset_at)
     VALUES ($1, 'buyer', 'vip', $2, 20000, $3)`,
    [dummyTgId, futureDate, resetIn5Days]
  );

  const pricing = await calculateCheckoutPrice(dummyTgId, {
    name: 'Spotify Premium 1 Bulan',
    price: 20000,
  });

  assert.equal(pricing.discount, 0, 'Must NOT grant discount when weekly limit is reached');
  assert.equal(pricing.isVipDiscountApplied, false);
  assert.equal(pricing.finalPayableAmount, 20100, 'Must pay full price + fee');

  // Clean up
  await query('DELETE FROM users WHERE telegram_id = $1', [dummyTgId]);
});

test('Membership Lifecycle: activateOrExtendMembership activates and extends durations', async () => {
  const dummyTgId = `tg_test_vip_act_${Date.now()}`;

  const userRes = await query<{ id: string }>(
    `INSERT INTO users (telegram_id, role, membership_tier)
     VALUES ($1, 'buyer', 'free') RETURNING id`,
    [dummyTgId]
  );
  const userId = userRes.rows[0].id;

  // 1. Initial activation: 30 days
  const act1 = await activateOrExtendMembership(userId, 30);
  assert.equal(act1.success, true);
  assert.equal(act1.extended, false);

  const mem1 = await getUserMembership(dummyTgId);
  assert.equal(mem1.isVip, true);
  assert.ok(mem1.daysRemaining >= 29 && mem1.daysRemaining <= 30);

  // 2. Extend active membership: +90 days
  const act2 = await activateOrExtendMembership(userId, 90);
  assert.equal(act2.success, true);
  assert.equal(act2.extended, true);

  const mem2 = await getUserMembership(dummyTgId);
  assert.equal(mem2.isVip, true);
  assert.ok(mem2.daysRemaining >= 118 && mem2.daysRemaining <= 121);

  // Clean up
  await query('DELETE FROM users WHERE id = $1', [userId]);
});
