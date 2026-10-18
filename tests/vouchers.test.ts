import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createVoucher,
  getAllVouchers,
  getVoucherByCode,
  deleteVoucher,
  toggleVoucherStatus,
  validateVoucherForTransaction,
  applyVoucherUsage,
  formatVoucherBenefit,
} from '../lib/voucher';
import { query } from '../lib/db';

test('Vouchers: createVoucher creates vouchers with various types and benefits', async () => {
  const ts = Date.now();
  const codeAll = `TEST_ALL_${ts}`;
  const codeProd = `TEST_PROD_${ts}`;
  const codeMem = `TEST_MEM_${ts}`;
  const codeDep = `TEST_DEP_${ts}`;

  // 1. All products
  const vAll = await createVoucher({
    code: codeAll,
    type: 'all_products',
    discountValue: 3000,
    maxUses: 10,
  });
  assert.equal(vAll.code, codeAll);
  assert.equal(vAll.type, 'all_products');
  assert.equal(vAll.discount_value, 3000);
  assert.equal(vAll.max_uses, 10);
  assert.match(formatVoucherBenefit(vAll), /Rp 3\.000/);

  // 2. Specific product
  const vProd = await createVoucher({
    code: codeProd,
    type: 'product',
    productTarget: 'canva',
    discountValue: 2000,
    maxUses: 5,
  });
  assert.equal(vProd.type, 'product');
  assert.equal(vProd.product_target, 'canva');

  // 3. Membership
  const vMem = await createVoucher({
    code: codeMem,
    type: 'membership',
    discountValue: 2000,
    maxUses: 15,
  });
  assert.equal(vMem.type, 'membership');

  // 4. Deposit cashback
  const vDep = await createVoucher({
    code: codeDep,
    type: 'deposit_cashback',
    discountValue: 5000,
    maxUses: 20,
  });
  assert.equal(vDep.type, 'deposit_cashback');
  assert.match(formatVoucherBenefit(vDep), /Bonus Saldo Cashback/);

  // Clean up
  await deleteVoucher(vAll.id);
  await deleteVoucher(vProd.id);
  await deleteVoucher(vMem.id);
  await deleteVoucher(vDep.id);
});

test('Vouchers: validateVoucherForTransaction matches types correctly', async () => {
  const ts = Date.now();
  const codeProd = `CANVA_${ts}`;
  const codeDep = `CB_${ts}`;

  const vProd = await createVoucher({
    code: codeProd,
    type: 'product',
    productTarget: 'canva',
    discountValue: 2000,
    maxUses: 10,
  });

  const vDep = await createVoucher({
    code: codeDep,
    type: 'deposit_cashback',
    discountValue: 5000,
    maxUses: 10,
  });

  // Valid on Canva
  const resCanva = await validateVoucherForTransaction({
    code: codeProd,
    transactionType: 'product',
    productName: 'Canva Pro 1 Bulan FW',
    amount: 15000,
  });
  assert.equal(resCanva.valid, true);
  assert.equal(resCanva.discountAmount, 2000);

  // Invalid on Netflix
  const resNetflix = await validateVoucherForTransaction({
    code: codeProd,
    transactionType: 'product',
    productName: 'Netflix Premium 1 Bulan',
    amount: 35000,
  });
  assert.equal(resNetflix.valid, false);
  assert.match(resNetflix.message, /hanya berlaku untuk produk bertarget "canva"/i);

  // Deposit Cashback valid on deposit
  const resDep = await validateVoucherForTransaction({
    code: codeDep,
    transactionType: 'deposit',
    amount: 50000,
  });
  assert.equal(resDep.valid, true);
  assert.equal(resDep.cashbackAmount, 5000);

  // Deposit Cashback invalid on product purchase
  const resDepOnProd = await validateVoucherForTransaction({
    code: codeDep,
    transactionType: 'product',
    productName: 'Canva Pro 1 Bulan',
    amount: 15000,
  });
  assert.equal(resDepOnProd.valid, false);
  assert.match(resDepOnProd.message, /khusus untuk deposit saldo/i);

  // Clean up
  await deleteVoucher(vProd.id);
  await deleteVoucher(vDep.id);
});

test('Vouchers: Quota limits and single-use per user protection', async () => {
  const ts = Date.now();
  const code = `LIMITED_${ts}`;
  const v = await createVoucher({
    code,
    type: 'all_products',
    discountValue: 1000,
    maxUses: 1, // Only 1 user
  });

  // Create temporary user
  const uRes = await query<{ id: string }>(
    `INSERT INTO users (telegram_id, role) VALUES ($1, 'buyer') RETURNING id`,
    [`tg_voucher_${ts}`]
  );
  const userId = uRes.rows[0].id;

  // 1st validation: Valid
  const val1 = await validateVoucherForTransaction({
    code,
    userId,
    transactionType: 'product',
    productName: 'Canva Pro',
    amount: 10000,
  });
  assert.equal(val1.valid, true);

  // Apply usage
  await applyVoucherUsage({
    voucherId: v.id,
    userId,
    discountAmount: 1000,
  });

  // 2nd validation: Rejected because already used by this user
  const val2 = await validateVoucherForTransaction({
    code,
    userId,
    transactionType: 'product',
    productName: 'Canva Pro',
    amount: 10000,
  });
  assert.equal(val2.valid, false);
  assert.match(val2.message, /sudah pernah menggunakan voucher/i);

  // Create 2nd user: Rejected because max_uses (1) is reached
  const u2Res = await query<{ id: string }>(
    `INSERT INTO users (telegram_id, role) VALUES ($1, 'buyer') RETURNING id`,
    [`tg_voucher_2_${ts}`]
  );
  const user2Id = u2Res.rows[0].id;

  const val3 = await validateVoucherForTransaction({
    code,
    userId: user2Id,
    transactionType: 'product',
    productName: 'Canva Pro',
    amount: 10000,
  });
  assert.equal(val3.valid, false);
  assert.match(val3.message, /kuota voucher.*telah habis/i);

  // Clean up
  await deleteVoucher(v.id);
  await query('DELETE FROM users WHERE id IN ($1, $2)', [userId, user2Id]);
});
