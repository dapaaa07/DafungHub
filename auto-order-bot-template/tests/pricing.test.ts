import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateSellingPrice,
  calculateProtectedSellingPrice,
  calculateProfit,
  formatCurrency,
  roundToMarketStandard,
} from '../src/core/pricing';

test('Template Pricing: roundToMarketStandard rounds up to 500 IDR interval', () => {
  assert.strictEqual(roundToMarketStandard(5100), 5500);
  assert.strictEqual(roundToMarketStandard(5500), 5500);
  assert.strictEqual(roundToMarketStandard(5001), 5500);
  assert.strictEqual(roundToMarketStandard(0), 0);
});

test('Template Pricing: calculateSellingPrice applies tiered markup rules', () => {
  // < 10,000 -> +3,000
  assert.strictEqual(calculateSellingPrice(2900), 6000); // 2900 + 3000 = 5900 -> 6000
  // < 50,000 -> +5,000
  assert.strictEqual(calculateSellingPrice(25000), 30000); // 25000 + 5000 = 30000
  // < 500,000 -> +10,000
  assert.strictEqual(calculateSellingPrice(69600), 80000); // 69600 + 10000 = 79600 -> 80000
});

test('Template Pricing: Cost-Plus Protection calculates price to guarantee target profit', () => {
  const cogs = 100000;
  const targetProfit = 5000;
  // Formula: (cogs + targetProfit + 350) / (1 - 0.007)
  const price = calculateProtectedSellingPrice(cogs, targetProfit, 'QRIS');
  assert.ok(price > cogs + targetProfit, 'Selling price must cover COGS, profit and gateway fee');

  const actualProfit = calculateProfit(price, cogs, 'QRIS');
  assert.ok(actualProfit >= targetProfit, `Actual net profit (${actualProfit}) must meet or exceed target (${targetProfit})`);
});

test('Template Pricing: formatCurrency formats IDR accurately', () => {
  const formatted = formatCurrency(25000);
  assert.ok(formatted.includes('25.000'), 'Must contain 25.000');
});
