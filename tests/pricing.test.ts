import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isAdmin,
  calculateSellingPrice,
  calculateProfit,
  calculateProtectedSellingPrice,
  calculateGatewayFee,
  ADMIN_TELEGRAM_ID,
} from '../lib/pricing';

test('Pricing & Admin: ADMIN_TELEGRAM_ID is 7133868769', () => {
  assert.strictEqual(ADMIN_TELEGRAM_ID, '7133868769');
});

test('Pricing & Admin: isAdmin correctly validates owner vs non-owner', () => {
  assert.strictEqual(isAdmin('7133868769'), true, 'String ID 7133868769 must be admin');
  assert.strictEqual(isAdmin(7133868769), true, 'Number ID 7133868769 must be admin');
  assert.strictEqual(isAdmin('123456789'), false, 'Random user must not be admin');
  assert.strictEqual(isAdmin(undefined), false, 'Undefined user must not be admin');
  assert.strictEqual(isAdmin(null), false, 'Null user must not be admin');
});

test('Pricing & Admin: calculateSellingPrice applies dynamic tiered margins', () => {
  // Case 1: Cheap product (< 10.000), e.g. modal 2.900 -> markup +3.000 = 5.900 -> ceil to 500 = 6.000
  const canvaModal = 2900;
  const canvaPrice = calculateSellingPrice(canvaModal);
  assert.strictEqual(canvaPrice, 6000, '2900 + 3000 = 5900 -> rounded to 6000');

  // Case 2: Mid product (10.000 - 49.999), e.g. modal 25.000 -> markup +5.000 = 30.000 -> ceil to 500 = 30.000
  const midModal = 25000;
  const midPrice = calculateSellingPrice(midModal);
  assert.strictEqual(midPrice, 30000, '25000 + 5000 = 30000');

  // Case 3: Premium product (>= 50.000), e.g. modal 69.600 -> markup +10.000 = 79.600 -> ceil to 500 = 80.000
  const netflixModal = 69600;
  const netflixPrice = calculateSellingPrice(netflixModal);
  assert.strictEqual(netflixPrice, 80000, '69600 + 10000 = 79600 -> rounded to 80000');

  // Case 4: Custom markup
  const customPrice = calculateSellingPrice(10000, 7200);
  assert.strictEqual(customPrice, 17500, '10000 + 7200 = 17200 -> rounded to 17500');

  // Case 5: 0 or negative price
  assert.strictEqual(calculateSellingPrice(0), 0);
  assert.strictEqual(calculateSellingPrice(-100), 0);
});

test('Pricing & Admin: calculateProfit computes net profit margin', () => {
  const profit = calculateProfit(80000, 69600);
  assert.strictEqual(profit, 10400);

  const zeroProfit = calculateProfit(5000, 10000);
  assert.strictEqual(zeroProfit, 0);

  // Profit with gateway deduction
  const profitAfterFee = calculateProfit(80000, 69600, 'QRIS');
  // Fee for 80.000 QRIS = 80.000 * 0.007 + 350 = 560 + 350 = 910
  // Net profit = 80.000 - 910 - 69.600 = 9.490
  assert.strictEqual(profitAfterFee, 9490);
});

test('Cost-Plus Protection Engine: calculateProtectedSellingPrice guarantees target profit', () => {
  const cogs = 39500;
  const targetProfit = 5000;
  const channel = 'QRIS';

  const protectedPrice = calculateProtectedSellingPrice(cogs, targetProfit, channel);
  assert.strictEqual(protectedPrice, 45500);

  const fee = calculateGatewayFee(protectedPrice, channel);
  assert.strictEqual(fee, 45500 * 0.007 + 350);

  const netPayout = protectedPrice - fee;
  const actualProfit = netPayout - cogs;
  assert.ok(actualProfit >= targetProfit, `Actual profit (${actualProfit}) must be >= target profit (${targetProfit})`);
});
