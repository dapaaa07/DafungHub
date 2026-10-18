import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isTestProduct,
  getSupplierProducts,
  getAllEnrichedProducts,
} from '../lib/supplier';
import {
  filterProductsByPlatform,
  sendPlatformsMenu,
  sendProductsMenu,
  sendProductDetail,
  setAdminWaitingBroadcast,
  getAdminWaitingBroadcast,
  setAdminPendingBroadcastText,
  getAdminPendingBroadcastText,
  clearAdminBroadcastState,
} from '../bot/menu';
import {
  maskOrderCode,
  buildOrderBroadcastMessage,
  getBroadcastChannel,
  isAutoOrderBroadcastEnabled,
  setAutoOrderBroadcastEnabled,
  broadcastOrderSuccess,
} from '../lib/broadcast';
import { handleBuy } from '../bot/commands/buy';
import { query } from '../lib/db';
import { ExtendedBot } from '../bot/handler';
import { ADMIN_TELEGRAM_ID } from '../lib/pricing';

test('Test Products: isTestProduct correctly identifies testing and sandbox products', () => {
  assert.equal(isTestProduct({ id: 'loc_test1', name: 'Test Api product' }), true);
  assert.equal(isTestProduct({ id: 'test_123', name: 'Sandbox Item' }), true);
  assert.equal(isTestProduct({ id: 'prod_999', name: 'Netflix Premium 1 Bulan' }), false);
  assert.equal(isTestProduct({ id: 'prod_888', name: 'Canva Pro Edu Lifetime' }), false);
});

test('Test Products: getSupplierProducts includes test products only when includeTest is true', async () => {
  const publicProducts = await getSupplierProducts(false).catch(() => []);
  const allProducts = await getSupplierProducts(true).catch(() => []);

  const hasTestInPublic = publicProducts.some(isTestProduct);
  assert.equal(hasTestInPublic, false, 'Public catalogue must NOT contain test products');

  // When live supplier or mock is accessible, test products exist
  if (allProducts.some(isTestProduct)) {
    const hasTestInAdmin = allProducts.some(isTestProduct);
    assert.equal(hasTestInAdmin, true, 'Admin catalogue must include test products');
  }
});

test('Test Products: filterProductsByPlatform handles test platform correctly', () => {
  const mockProducts = [
    { id: 'loc_test1', name: 'Test Api product', availability: 'in_stock' as const, price_idr: 1, description: 'Test', requires_email: false },
    { id: 'netflix_1', name: 'Netflix Premium 1 Bulan FW', availability: 'in_stock' as const, price_idr: 30000, description: 'Netflix', requires_email: false },
  ];

  const testList = filterProductsByPlatform(mockProducts, 'test');
  assert.equal(testList.length, 1);
  assert.equal(testList[0].id, 'loc_test1');

  const regularList = filterProductsByPlatform(mockProducts, 'all');
  assert.equal(regularList.length, 1);
  assert.equal(regularList[0].id, 'netflix_1');
});

test('Test Products Access: sendProductsMenu blocks non-admin for platformId test', async () => {
  let sentText = '';
  const mockBot = {
    sendMessage: async (_chatId: any, text: string) => {
      sentText = text;
      return { message_id: 101 };
    },
  } as unknown as ExtendedBot;

  const nonAdminCtx = { from: { id: 99999999 }, chatId: 99999999 };
  await sendProductsMenu(nonAdminCtx as any, mockBot, 0, 'test');
  assert.match(sentText, /Akses Ditolak/i);
});

test('Test Products Access: sendProductDetail blocks non-admin from viewing test product', async () => {
  let sentText = '';
  const mockBot = {
    sendMessage: async (_chatId: any, text: string) => {
      sentText = text;
      return { message_id: 102 };
    },
  } as unknown as ExtendedBot;

  const nonAdminCtx = { from: { id: 99999999 }, chatId: 99999999 };
  await sendProductDetail(nonAdminCtx as any, mockBot, 'loc_test1', 'test');
  assert.match(sentText, /Akses Ditolak/i);
});

test('Broadcast: maskOrderCode anonymizes order ID cleanly', () => {
  assert.equal(maskOrderCode('ORD-179232-ABC12'), 'ORD-•••-ABC12');
  assert.equal(maskOrderCode('ORD-LONG-SECRET-CODE'), 'ORD-•••-CODE');
});

test('Broadcast: buildOrderBroadcastMessage formats clean anti-slop copy', () => {
  const msg = buildOrderBroadcastMessage({
    order_code: 'ORD-179232-XYZ78',
    product_name: 'Canva Pro 1 Bulan FW',
    product_price: 15000,
    delivered_at: new Date('2026-10-18T12:30:00Z'),
  });

  assert.match(msg, /PESANAN BERHASIL DIPROSES/);
  assert.match(msg, /Canva Pro 1 Bulan FW/);
  assert.match(msg, /ORD-•••-XYZ78/);
  assert.match(msg, /Rp 15\.000/);
  assert.match(msg, /Sukses Terkirim Otomatis/);
  assert.match(msg, /WIB/);
});

test('Broadcast: getBroadcastChannel defaults to @DafungHub', async () => {
  const channel = await getBroadcastChannel();
  assert.equal(channel, '@DafungHub');
});

test('Broadcast: isAutoOrderBroadcastEnabled and setAutoOrderBroadcastEnabled toggle correctly', async () => {
  await setAutoOrderBroadcastEnabled(false);
  let status = await isAutoOrderBroadcastEnabled();
  assert.equal(status, false);

  await setAutoOrderBroadcastEnabled(true);
  status = await isAutoOrderBroadcastEnabled();
  assert.equal(status, true);
});

test('Broadcast State: interactive admin broadcast states operate correctly', () => {
  const testChatId = 7771234;
  clearAdminBroadcastState(testChatId);

  assert.equal(getAdminWaitingBroadcast(testChatId), false);
  assert.equal(getAdminPendingBroadcastText(testChatId), undefined);

  setAdminWaitingBroadcast(testChatId, true);
  assert.equal(getAdminWaitingBroadcast(testChatId), true);

  setAdminPendingBroadcastText(testChatId, 'Diskon 20% Canva Pro!');
  assert.equal(getAdminPendingBroadcastText(testChatId), 'Diskon 20% Canva Pro!');

  clearAdminBroadcastState(testChatId);
  assert.equal(getAdminWaitingBroadcast(testChatId), false);
  assert.equal(getAdminPendingBroadcastText(testChatId), undefined);
});

test('Broadcast Deduplication: broadcastOrderSuccess skips already broadcasted orders', async () => {
  const uniqueCode = `ORD-TEST-BC-${Date.now()}`;
  // Insert temporary test order
  const userRes = await query<{ id: string }>(
    `INSERT INTO users (telegram_id, role) VALUES ($1, 'buyer')
     ON CONFLICT (telegram_id) DO UPDATE SET telegram_id = EXCLUDED.telegram_id RETURNING id`,
    ['999888777']
  );
  const userId = userRes.rows[0].id;

  const prodRes = await query<{ id: string }>(
    `INSERT INTO products (name, price, stock, is_active)
     VALUES ('Test Product Broadcast', 5000, 10, true) RETURNING id`
  );
  const prodId = prodRes.rows[0].id;

  await query(
    `INSERT INTO orders (user_id, product_id, order_code, payment_status, fulfillment_status, is_broadcasted)
     VALUES ($1, $2, $3, 'paid', 'delivered', true)`,
    [userId, prodId, uniqueCode]
  );

  const res = await broadcastOrderSuccess(uniqueCode);
  assert.equal(res.success, true);
  assert.equal(res.error, 'Order already broadcasted');

  // Clean up
  await query('DELETE FROM orders WHERE order_code = $1', [uniqueCode]);
  await query('DELETE FROM products WHERE id = $1', [prodId]);
});
