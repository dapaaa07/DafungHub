import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { Bot } from 'node-telegram-bot-api';
import { ExtendedBot } from '../bot/handler';
import { pool, query } from '../lib/db';
import {
  processOrderPayment,
  adminManualFulfill,
  adminRetrySupplierFulfill,
  getPendingQueueOrders,
} from '../lib/fulfillment';
import { decrypt } from '../lib/encrypt';

after(async () => {
  await pool.end();
});

test('Fulfillment Engine: processOrderPayment returns error for nonexistent order', async () => {
  const botInstance = new Bot('dummy_token') as ExtendedBot;
  botInstance.sendMessage = async () => ({});

  const res = await processOrderPayment('NONEXISTENT-CODE', botInstance);
  assert.strictEqual(res.success, false);
  assert.strictEqual(res.mode, 'error');
  assert.ok(res.message.includes('not found'));
});

test('Fulfillment Engine: Smart Fallback handles Queue Mode when balance is insufficient', async () => {
  const botInstance = new Bot('dummy_token') as ExtendedBot;
  const sentMessages: Array<{ chatId: unknown; text: string }> = [];

  botInstance.sendMessage = async (chatId, text) => {
    sentMessages.push({ chatId, text: text || '' });
    return {};
  };

  // 1. Prepare test user and product in DB
  const userRes = await query<{ id: string }>(
    `INSERT INTO users (telegram_id, role)
     VALUES ('999000111', 'buyer')
     ON CONFLICT (telegram_id) DO UPDATE SET telegram_id = EXCLUDED.telegram_id
     RETURNING id`
  );
  const userId = userRes.rows[0].id;

  const prodRes = await query<{ id: string }>(
    `INSERT INTO products (name, price, stock, is_active)
     VALUES ('Akun Netflix Premium Test', 35000, 10, true)
     RETURNING id`
  );
  const prodId = prodRes.rows[0].id;

  const testOrderCode = `TEST-QUEUE-${Date.now()}`;
  await query(
    `INSERT INTO orders (user_id, product_id, order_code, payment_status, fulfillment_status)
     VALUES ($1, $2, $3, 'unpaid', 'pending')`,
    [userId, prodId, testOrderCode]
  );

  // 2. Process order payment
  const res = await processOrderPayment(testOrderCode, botInstance);

  assert.strictEqual(res.success, true);
  // Supplier balance is currently 0, so fallback to queued mode
  assert.strictEqual(res.mode, 'queued');

  // Verify DB state
  const checkOrder = await query<{ payment_status: string; fulfillment_status: string }>(
    `SELECT payment_status, fulfillment_status FROM orders WHERE order_code = $1`,
    [testOrderCode]
  );
  assert.strictEqual(checkOrder.rows[0].payment_status, 'paid');
  assert.strictEqual(checkOrder.rows[0].fulfillment_status, 'processing');

  // Verify buyer received gentle queue notice
  const buyerMsg = sentMessages.find((m) => String(m.chatId) === '999000111');
  assert.ok(buyerMsg, 'Buyer must receive message');
  assert.ok(buyerMsg.text.includes('PEMBAYARAN DITERIMA'), 'Buyer must get payment confirmed message');
  assert.ok(buyerMsg.text.includes('antrean sistem'), 'Buyer must be told order is in queue');

  // Verify owner received queue alert
  const ownerMsg = sentMessages.find((m) => String(m.chatId) === '7133868769');
  assert.ok(ownerMsg, 'Owner (7133868769) must receive dispatch alert');
  assert.ok(ownerMsg.text.includes('PESANAN BARU MASUK'), 'Owner gets new order notice');
  assert.ok(ownerMsg.text.includes(testOrderCode), 'Owner alert contains order code');

  // Verify order appears in getPendingQueueOrders
  const queue = await getPendingQueueOrders();
  const inQueue = queue.find((o) => o.order_code === testOrderCode);
  assert.ok(inQueue, 'Order must appear in pending queue list');

  // Clean up test data
  await query('DELETE FROM orders WHERE order_code = $1', [testOrderCode]);
  await query('DELETE FROM products WHERE id = $1', [prodId]);
});

test('Fulfillment Engine: adminManualFulfill encrypts credential and notifies buyer', async () => {
  const botInstance = new Bot('dummy_token') as ExtendedBot;
  const sentMessages: Array<{ chatId: unknown; text: string }> = [];

  botInstance.sendMessage = async (chatId, text) => {
    sentMessages.push({ chatId, text: text || '' });
    return {};
  };

  // 1. Prepare test user and product in DB
  const userRes = await query<{ id: string }>(
    `INSERT INTO users (telegram_id, role)
     VALUES ('999000222', 'buyer')
     ON CONFLICT (telegram_id) DO UPDATE SET telegram_id = EXCLUDED.telegram_id
     RETURNING id`
  );
  const userId = userRes.rows[0].id;

  const prodRes = await query<{ id: string }>(
    `INSERT INTO products (name, price, stock, is_active)
     VALUES ('Canva Pro 1 Bulan Test', 10000, 10, true)
     RETURNING id`
  );
  const prodId = prodRes.rows[0].id;

  const testOrderCode = `TEST-MANUAL-${Date.now()}`;
  await query(
    `INSERT INTO orders (user_id, product_id, order_code, payment_status, fulfillment_status)
     VALUES ($1, $2, $3, 'paid', 'processing')`,
    [userId, prodId, testOrderCode]
  );

  // 2. Admin executes manual fulfillment
  const testCreds = 'email@domain.com:PasswordSuperSecret123';
  const fulfillResult = await adminManualFulfill(testOrderCode, testCreds, botInstance);

  assert.strictEqual(fulfillResult.success, true);
  assert.ok(fulfillResult.message.includes('berhasil dikirimkan'));

  // 3. Verify database state
  const checkOrder = await query<{
    fulfillment_status: string;
    credential_encrypted: string;
  }>(
    `SELECT fulfillment_status, credential_encrypted FROM orders WHERE order_code = $1`,
    [testOrderCode]
  );

  assert.strictEqual(checkOrder.rows[0].fulfillment_status, 'delivered');
  assert.ok(checkOrder.rows[0].credential_encrypted, 'Credential must be saved encrypted');
  assert.strictEqual(decrypt(checkOrder.rows[0].credential_encrypted), testCreds);

  // 4. Verify buyer received credentials
  const buyerMsg = sentMessages.find((m) => String(m.chatId) === '999000222');
  assert.ok(buyerMsg, 'Buyer must receive account delivery');
  assert.ok(buyerMsg.text.includes(testCreds), 'Buyer message must contain credentials');

  // 5. Subsequent processOrderPayment returns already_processed
  const repeatRes = await processOrderPayment(testOrderCode, botInstance);
  assert.strictEqual(repeatRes.mode, 'already_processed');

  // Clean up
  await query('DELETE FROM orders WHERE order_code = $1', [testOrderCode]);
  await query('DELETE FROM products WHERE id = $1', [prodId]);
});

test('Fulfillment Engine: adminRetrySupplierFulfill informs admin when balance is insufficient', async () => {
  const botInstance = new Bot('dummy_token') as ExtendedBot;
  botInstance.sendMessage = async () => ({});

  // Create a processing order
  const userRes = await query<{ id: string }>(
    `INSERT INTO users (telegram_id, role)
     VALUES ('999000333', 'buyer')
     ON CONFLICT (telegram_id) DO UPDATE SET telegram_id = EXCLUDED.telegram_id
     RETURNING id`
  );
  const userId = userRes.rows[0].id;

  const prodRes = await query<{ id: string }>(
    `INSERT INTO products (name, price, stock, is_active)
     VALUES ('Spotify Premium Test', 15000, 10, true)
     RETURNING id`
  );
  const prodId = prodRes.rows[0].id;

  const testOrderCode = `TEST-RETRY-${Date.now()}`;
  await query(
    `INSERT INTO orders (user_id, product_id, order_code, payment_status, fulfillment_status)
     VALUES ($1, $2, $3, 'paid', 'processing')`,
    [userId, prodId, testOrderCode]
  );

  const retryRes = await adminRetrySupplierFulfill(testOrderCode, botInstance);
  assert.strictEqual(retryRes.success, false);
  assert.ok(retryRes.message.includes('Saldo supplier'));

  // Clean up
  await query('DELETE FROM orders WHERE order_code = $1', [testOrderCode]);
  await query('DELETE FROM products WHERE id = $1', [prodId]);
});
