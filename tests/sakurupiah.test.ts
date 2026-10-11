import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import {
  generateSakurupiahSignature,
  verifySakurupiahCallbackSignature,
  getSakurupiahBaseUrl,
  createSakurupiahInvoice,
  selectOptimalQrisChannel,
  SAKURUPIAH_API_KEY,
} from '../lib/sakurupiah';
import { POST as sakurupiahWebhookPOST } from '../app/api/webhooks/sakurupiah/route';
import { pool, query, User, Product, Order } from '../lib/db';

after(async () => {
  await pool.end();
});

test('Sakurupiah Signature: matches official documentation HMAC-SHA256 formula', () => {
  // Test vector directly from official Sakurupiah API documentation (Section 3)
  const apiId = 'SANBOX-90976113';
  const method = 'QRIS';
  const merchantRef = 'd83heuie230948';
  const amount = '20000';
  const apiKey = 'SANBOX-snuNYFCZ9q7KhDPpWSTv7243YRUCSrC';
  const expectedSignature = '3e06435796cca95a6ff734e6d664a6d4cf06cca9d7c6cc3023622b3ab8e09840';

  const signature = generateSakurupiahSignature(apiId, method, merchantRef, amount, apiKey);
  assert.strictEqual(
    signature,
    expectedSignature,
    'Signature calculation must exactly match documentation HMAC-SHA256 test vector'
  );
});

test('Sakurupiah Signature: verifySakurupiahCallbackSignature verifies valid and detects tampered payloads', () => {
  const secretKey = 'test_secret_key_123';
  const payload = JSON.stringify({
    trx_id: 'SBX12345',
    merchant_ref: 'ORD-999',
    status: 'berhasil',
    status_kode: 1,
  });

  const validSignature = crypto.createHmac('sha256', secretKey).update(payload).digest('hex');

  // 1. Valid signature
  assert.strictEqual(
    verifySakurupiahCallbackSignature(payload, validSignature, secretKey),
    true,
    'Valid signature must return true'
  );

  // 2. Tampered body
  const tamperedPayload = JSON.stringify({
    trx_id: 'SBX12345',
    merchant_ref: 'ORD-999',
    status: 'expired',
    status_kode: 2,
  });
  assert.strictEqual(
    verifySakurupiahCallbackSignature(tamperedPayload, validSignature, secretKey),
    false,
    'Tampered payload must fail signature verification'
  );

  // 3. Invalid signature string
  assert.strictEqual(
    verifySakurupiahCallbackSignature(payload, 'wrong_hex_signature', secretKey),
    false,
    'Invalid signature string must return false'
  );

  // 4. Empty signature or body
  assert.strictEqual(verifySakurupiahCallbackSignature('', validSignature, secretKey), false);
  assert.strictEqual(verifySakurupiahCallbackSignature(payload, '', secretKey), false);
});

test('Sakurupiah Client: getSakurupiahBaseUrl correctly determines Sandbox vs Production', () => {
  // Sandbox by default with SANBOX prefix
  const url = getSakurupiahBaseUrl();
  assert.ok(url.includes('sakurupiah.id'), 'URL must point to sakurupiah domain');
});

test('Dynamic Gateway Routing: selectOptimalQrisChannel routes correctly based on inversion threshold (Rp 175.000)', () => {
  // 1. Below Rp 175.000: QRIS2 (0.9% without flat fee) is cheaper than QRIS (0.7% + 350)
  // For 50.000: QRIS2 fee is 450, QRIS fee is 350 + 350 = 700
  const smallInvoiceChannel = selectOptimalQrisChannel(50000, ['QRIS', 'QRIS2']);
  assert.strictEqual(smallInvoiceChannel, 'QRIS2', 'Transactions under 175k must route to QRIS2 for maximum savings');

  // 2. Above Rp 175.000: QRIS Standard (0.7% + 350) is cheaper than QRIS2 (0.9%)
  // For 300.000: QRIS2 fee is 2.700, QRIS fee is 2.100 + 350 = 2.450
  const largeInvoiceChannel = selectOptimalQrisChannel(300000, ['QRIS', 'QRIS2']);
  assert.strictEqual(largeInvoiceChannel, 'QRIS', 'Transactions over 175k must route to QRIS standard');

  // 3. Fallback / edge cases
  assert.strictEqual(selectOptimalQrisChannel(0), 'QRIS');
});

test('Sakurupiah Client: createSakurupiahInvoice validates invalid input', async () => {
  await assert.rejects(
    async () => {
      await createSakurupiahInvoice('', 20000);
    },
    /orderId is required/
  );

  await assert.rejects(
    async () => {
      await createSakurupiahInvoice('ORD-TEST', 0);
    },
    /grossAmount must be greater than 0/
  );
});

test('Sakurupiah Client: createSakurupiahInvoice creates active QRIS in Sandbox', async () => {
  const orderRef = `TEST-SAKU-${Date.now()}`;
  const amount = 12500;

  const result = await createSakurupiahInvoice(
    orderRef,
    amount,
    'Netflix 1P1U Test Order',
    'Tester DaFung Hub',
    'tester@dafung-hub.com'
  );

  assert.ok(result.orderId === orderRef, 'Result must reflect original orderRef');
  assert.strictEqual(result.grossAmount, 12500, 'Gross amount must match');
  assert.ok(result.transactionId && result.transactionId.length > 0, 'Must return a transactionId (trx_id)');
  assert.ok(result.qrCodeUrl && result.qrCodeUrl.length > 0, 'Must return a QR code URL');
  assert.ok(result.qrString && result.qrString.length > 0, 'Must return a QR string');
  assert.ok(result.checkoutUrl && result.checkoutUrl.includes('sakurupiah.id'), 'Must provide a valid checkout web URL');
});

test('Sakurupiah Webhook: handles payment_status and updates order to paid', async () => {
  // 1. Create a dummy buyer user in database
  const dummyTgId = `buyer_saku_${Date.now()}`;
  const userRes = await query<User>(
    `INSERT INTO users (telegram_id, role) VALUES ($1, 'buyer') RETURNING *`,
    [dummyTgId]
  );
  const user = userRes.rows[0];

  // 2. Create a dummy product
  const prodRes = await query<Product>(
    `INSERT INTO products (name, price, stock, is_active)
     VALUES ('Sakurupiah Webhook Test Product', 10000, 5, true)
     RETURNING *`
  );
  const product = prodRes.rows[0];

  // 3. Create an unpaid order
  const orderCode = `ORD-SAKU-HOOK-${Date.now()}`;
  await query<Order>(
    `INSERT INTO orders (user_id, product_id, order_code, payment_status, fulfillment_status, invoice_data)
     VALUES ($1, $2, $3, 'unpaid', 'pending', '{}'::jsonb)`,
    [user.id, product.id, orderCode]
  );

  // 4. Construct valid signed webhook payload
  const payloadObj = {
    trx_id: `SBX-TRX-${Date.now()}`,
    merchant_ref: orderCode,
    status: 'berhasil',
    status_kode: 1,
  };
  const rawBody = JSON.stringify(payloadObj);
  const signature = crypto.createHmac('sha256', SAKURUPIAH_API_KEY).update(rawBody).digest('hex');

  const req = new NextRequest('https://dafung-hub.vercel.app/api/webhooks/sakurupiah', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-callback-event': 'payment_status',
      'x-callback-signature': signature,
    },
    body: rawBody,
  });

  const res = await sakurupiahWebhookPOST(req);
  assert.strictEqual(res.status, 200, 'Webhook must return HTTP 200');

  const resJson = (await res.json()) as { success: boolean; message: string };
  assert.strictEqual(resJson.success, true, 'Webhook response must be success: true');

  // 5. Verify order status in database is updated from unpaid to paid
  const checkOrder = await query<Order>(
    `SELECT * FROM orders WHERE order_code = $1`,
    [orderCode]
  );
  assert.strictEqual(checkOrder.rows[0].payment_status, 'paid', 'Order payment_status must be updated to paid');
});
