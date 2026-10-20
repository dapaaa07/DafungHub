import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { NextRequest } from 'next/server';
import {
  crc16Ccitt,
  generateDynamicQrisFromStatic,
  getShopeePayAccount,
  createShopeePayInvoice,
  checkShopeePayPayment,
  SHOPEEPAY_STATIC_QRIS,
} from '../lib/shopeepay';
import { POST as shopeePayWebhookPOST, GET as shopeePayWebhookGET } from '../app/api/webhooks/shopeepay/route';
import { pool } from '../lib/db';

after(async () => {
  await pool.end();
});

test('ShopeePay CRC16: calculates standard EMVCo/ASPI QRIS CRC16-CCITT checksum accurately', () => {
  const staticRaw = SHOPEEPAY_STATIC_QRIS;
  const dataPart = staticRaw.slice(0, -4);
  const expectedCrc = staticRaw.slice(-4);
  const calculatedCrc = crc16Ccitt(dataPart);

  assert.strictEqual(
    calculatedCrc,
    expectedCrc,
    'Calculated CRC must match static QRIS checksum BBC9'
  );
});

test('ShopeePay Dynamic QRIS: converts static QRIS to dynamic QRIS with exact amount Tag 54', () => {
  const amount = 35000;
  const dynamicQris = generateDynamicQrisFromStatic(SHOPEEPAY_STATIC_QRIS, amount);

  // 1. Point of Initiation Method must be 12 (Dynamic)
  assert.ok(
    dynamicQris.includes('010212'),
    'Dynamic QRIS must have Point of Initiation Method 12'
  );

  // 2. Must contain Tag 54 with amount 35000: '540535000'
  assert.ok(
    dynamicQris.includes('540535000'),
    'Dynamic QRIS must contain Tag 54 with length 05 and amount 35000'
  );

  // 3. Must have valid Tag 63 CRC
  const dataPart = dynamicQris.slice(0, -4);
  const expectedCrc = dynamicQris.slice(-4);
  const calculatedCrc = crc16Ccitt(dataPart);

  assert.strictEqual(
    calculatedCrc,
    expectedCrc,
    'Recomputed CRC of dynamic QRIS must be valid'
  );
});

test('ShopeePay API Client: getShopeePayAccount connects and verifies account details', async () => {
  const res = await getShopeePayAccount();

  assert.strictEqual(res.success, true, 'Account endpoint must return success: true');
  assert.ok(res.data, 'Account endpoint must return data');
  assert.strictEqual(res.data?.user_id, '7133868769', 'User ID must match owner telegram ID');
  assert.strictEqual(res.data?.username, 'DappaSecc', 'Username must match DappaSecc');
  assert.strictEqual(res.data?.has_qris_static, true, 'has_qris_static must be true');
});

test('ShopeePay Invoice Creation: createShopeePayInvoice returns complete QRIS and transaction data', async () => {
  const orderCode = 'TEST-SHOPEE-' + Date.now();
  const amount = 25000;
  const invoice = await createShopeePayInvoice(orderCode, amount);

  assert.strictEqual(invoice.orderCode, orderCode);
  assert.strictEqual(invoice.grossAmount, amount);
  assert.strictEqual(invoice.gateway, 'shopeepay');
  assert.ok(invoice.qrString && invoice.qrString.startsWith('000201'), 'qrString must be valid QRIS');
  assert.ok(invoice.qrCodeUrl && invoice.qrCodeUrl.startsWith('http'), 'qrCodeUrl must be a valid URL');
  assert.ok(invoice.token, 'token must be present');
});

test('ShopeePay Payment Check: checkShopeePayPayment handles unpaid status gracefully', async () => {
  const result = await checkShopeePayPayment({
    token: 'non_existent_token_123',
    orderCode: 'TEST-ORDER-123',
    amount: 99999999,
  });

  assert.strictEqual(result.paid, false);
  assert.ok(
    result.status === 'unpaid' || result.status === 'gateway_session_expired',
    'status should be unpaid or gateway_session_expired'
  );
});

test('ShopeePay Webhook: GET endpoint returns active status and service name', async () => {
  const response = await shopeePayWebhookGET();
  const json = await response.json();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(json.status, 'active');
  assert.strictEqual(json.service, 'DaFung Hub ShopeePay Webhook Handler');
});

test('ShopeePay Webhook: POST endpoint acknowledges payment status', async () => {
  const req = new NextRequest('http://localhost:3000/api/webhooks/shopeepay', {
    method: 'POST',
    body: JSON.stringify({
      order_id: 'NONEXISTENT-ORDER',
      status: 'pending',
    }),
    headers: { 'Content-Type': 'application/json' },
  });

  const response = await shopeePayWebhookPOST(req);
  const json = await response.json();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(json.success, true);
});
