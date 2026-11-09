import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { after } from 'node:test';
import { NextRequest } from 'next/server';
import {
  crc16Ccitt,
  generateDynamicQrisFromStatic,
  getShopeePayAccount,
  getShopeePayTokenStatus,
  createShopeePayInvoice,
  checkShopeePayPayment,
  extractShopeePayTxId,
  parseShopeePayTimeMs,
  verifyShopeePayWebhookSignature,
  processShopeePayWebhookPayload,
  SHOPEEPAY_STATIC_QRIS,
} from '../lib/shopeepay';
import { POST as shopeePayWebhookPOST, GET as shopeePayWebhookGET } from '../app/api/webhooks/shopeepay/route';
import { pool } from '../lib/db';
import type { ExtendedBot } from '../bot/handler';

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

test('ShopeePay Helpers: extractShopeePayTxId & parseShopeePayTimeMs handle snake_case, camelCase & WIB timestamps', () => {
  assert.strictEqual(extractShopeePayTxId({ transactionId: 'TX-CAMEL-1' }), 'TX-CAMEL-1');
  assert.strictEqual(extractShopeePayTxId({ transaction_id: 'TX-SNAKE-2' }), 'TX-SNAKE-2');
  assert.strictEqual(extractShopeePayTxId({ id: 987654 }), '987654');
  assert.strictEqual(extractShopeePayTxId(null), '');

  // Timestamp without timezone must default to +07:00 WIB
  const wibMs = parseShopeePayTimeMs('2026-10-26 22:26:12');
  assert.strictEqual(wibMs, Date.parse('2026-10-26T22:26:12+07:00'));

  // Explicit UTC timestamp stays preserved
  const utcMs = parseShopeePayTimeMs('2026-10-26T15:26:12Z');
  assert.strictEqual(utcMs, wibMs);
});

test('ShopeePay Token Status: getShopeePayTokenStatus returns structured validity status', async () => {
  const status = await getShopeePayTokenStatus();
  assert.strictEqual(typeof status.valid, 'boolean');
  assert.ok(status.tokenStatus.length > 0);
  assert.ok(status.message.length > 0);
});

test('ShopeePay Webhook Safety: ignores webhook.test pings, failed events, and parses Indonesian amounts safely', async () => {
  const dummyBot = { sendMessage: async () => ({}) } as unknown as ExtendedBot;

  // 1. Invalid JSON -> HTTP 400
  const badJson = await processShopeePayWebhookPayload('{not-json', dummyBot);
  assert.strictEqual(badJson.httpStatus, 400);
  assert.strictEqual(badJson.body.success, false);

  // 2. Gateway test ping containing numbers in user_id and ISO timestamp must NEVER match payment amounts
  const pingRes = await processShopeePayWebhookPayload(
    JSON.stringify({
      event: 'webhook.test',
      user_id: 7133868769,
      timestamp: '2026-11-09T10:00:00Z',
      message: 'Test webhook from ShopeePay Gateway',
    }),
    dummyBot
  );
  assert.strictEqual(pingRes.httpStatus, 200);
  assert.strictEqual(pingRes.body.success, true);
  assert.strictEqual(pingRes.body.paid, false);

  // 3. Explicit failed event with amount must NOT confirm payment
  const failedRes = await processShopeePayWebhookPayload(
    JSON.stringify({
      event: 'payment.failed',
      transaction_id: 'TX-FAIL-001',
      amount: 99999997,
    }),
    dummyBot
  );
  assert.strictEqual(failedRes.httpStatus, 200);
  assert.strictEqual(failedRes.body.paid, false);

  // 4. MacroDroid notification listener text extracts clean Rp amount (ignoring ,00 decimals)
  const notifRes = await processShopeePayWebhookPayload(
    JSON.stringify({
      notification: 'Anda menerima pembayaran QRIS sebesar Rp 99.999.996,00 dari pembeli',
    }),
    dummyBot
  );
  assert.strictEqual(notifRes.httpStatus, 200);
  assert.strictEqual(notifRes.body.detected_amount, 99999996);
  assert.strictEqual(notifRes.body.paid, false);
});

test('ShopeePay Webhook Signature: verifies X-Signature HMAC-SHA256 when secret configured', async () => {
  const secret = 'test_webhook_secret_123';
  const payload = JSON.stringify({
    event: 'payment.success',
    user_id: 7133868769,
    transaction_id: 'TX-NONEXISTENT-AMT',
    amount: 99999995,
    status: 'success',
  });
  const validSig = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');

  assert.strictEqual(verifyShopeePayWebhookSignature(payload, JSON.parse(payload), validSig, secret), true);
  assert.strictEqual(verifyShopeePayWebhookSignature(payload, JSON.parse(payload), 'sha256=deadbeef', secret), false);

  const prevSecret = process.env.SHOPEEPAY_WEBHOOK_SECRET;
  process.env.SHOPEEPAY_WEBHOOK_SECRET = secret;
  try {
    const dummyBot = { sendMessage: async () => ({}) } as unknown as ExtendedBot;

    const unauthorizedRes = await processShopeePayWebhookPayload(payload, dummyBot, 'sha256=invalid');
    assert.strictEqual(unauthorizedRes.httpStatus, 401);

    const authorizedRes = await processShopeePayWebhookPayload(payload, dummyBot, validSig);
    assert.strictEqual(authorizedRes.httpStatus, 200);
    assert.strictEqual(authorizedRes.body.detected_amount, 99999995);
    assert.strictEqual(authorizedRes.body.transaction_id, 'TX-NONEXISTENT-AMT');
  } finally {
    if (prevSecret === undefined) {
      delete process.env.SHOPEEPAY_WEBHOOK_SECRET;
    } else {
      process.env.SHOPEEPAY_WEBHOOK_SECRET = prevSecret;
    }
  }
});
