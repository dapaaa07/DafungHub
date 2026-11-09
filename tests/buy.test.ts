import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { query, pool, Product } from '../lib/db';
import { generateOrderCode, ensureUser, handleBuy } from '../bot/commands/buy';
import { Bot, Context } from 'node-telegram-bot-api';
import { ExtendedBot } from '../bot/handler';

let testProductId = '';
let outOfStockProductId = '';

before(async () => {
  // Ensure we have test products in the database
  const p1 = await query<Product>(
    `INSERT INTO products (name, price, stock, is_active)
     VALUES ('Test Spotify Premium', 25000, 10, true)
     RETURNING id`
  );
  testProductId = p1.rows[0].id;

  const p2 = await query<Product>(
    `INSERT INTO products (name, price, stock, is_active)
     VALUES ('Test Out of Stock Product', 10000, 0, true)
     RETURNING id`
  );
  outOfStockProductId = p2.rows[0].id;
});

after(async () => {
  // Clean up test data
  if (testProductId) {
    await query('DELETE FROM orders WHERE product_id = $1', [testProductId]);
    await query('DELETE FROM products WHERE id = $1', [testProductId]);
  }
  if (outOfStockProductId) {
    await query('DELETE FROM orders WHERE product_id = $1', [outOfStockProductId]);
    await query('DELETE FROM products WHERE id = $1', [outOfStockProductId]);
  }
  await pool.end();
});

test('Buy Command: generateOrderCode generates valid format', () => {
  const code = generateOrderCode();
  assert.ok(code.startsWith('ORD-'), 'Order code must start with ORD-');
  const parts = code.split('-');
  assert.strictEqual(parts.length, 3, 'Order code should have 3 segments');
  assert.ok(Number(parts[1]) > 0, 'Timestamp segment must be numeric');
});

test('Buy Command: ensureUser registers and returns user', async () => {
  const testTelegramId = 'test_tg_user_998877';
  const user1 = await ensureUser(testTelegramId);
  assert.ok(user1.id, 'User must have an ID');
  assert.strictEqual(user1.telegram_id, testTelegramId);
  assert.strictEqual(user1.role, 'buyer');

  // Second call should return the same user
  const user2 = await ensureUser(testTelegramId);
  assert.strictEqual(user1.id, user2.id);
});

test('Buy Command: Valid product purchase generates QRIS and inserts order', async () => {
  const botInstance = new Bot('dummy_token') as ExtendedBot;
  interface PhotoOptions {
    caption?: string;
    parse_mode?: string;
  }

  let sentPhotoUrl = '';
  let sentCaption = '';
  let repliedText = '';

  botInstance.sendPhoto = async (_chatId, photo, options) => {
    sentPhotoUrl = photo as string;
    const opt = options as PhotoOptions | undefined;
    sentCaption = opt?.caption || '';
    return {};
  };

  const mockCtx = {
    chatId: 1234567,
    from: { id: 1234567, is_bot: false, first_name: 'Buyer' },
    reply: async (text: string) => {
      repliedText = text;
    },
  } as unknown as Context;

  await handleBuy(mockCtx, testProductId, botInstance);

  // Check response received (via sendPhoto or fallback reply)
  assert.ok(sentPhotoUrl.length > 0 || repliedText.length > 0, 'Must send photo or reply text');
  const output = sentCaption || repliedText;
  assert.ok(output.includes('INVOICE PEMBAYARAN QRIS'), 'Must contain invoice header');
  assert.ok(output.includes('Test Spotify Premium'), 'Must contain product name');
  assert.ok(output.includes('Rp 25.'), 'Must contain formatted price');
  assert.ok(output.includes('ORD-'), 'Must contain order code');

  // Verify database record in orders
  const orderCheck = await query(
    `SELECT * FROM orders WHERE product_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [testProductId]
  );
  assert.strictEqual(orderCheck.rows.length, 1, 'Order must be inserted in database');
  assert.strictEqual(orderCheck.rows[0].payment_status, 'unpaid');
  assert.strictEqual(orderCheck.rows[0].fulfillment_status, 'pending');
  assert.ok(orderCheck.rows[0].invoice_data, 'Invoice data must be stored');
});

test('Buy Command: Fails gracefully when product is out of stock', async () => {
  const botInstance = new Bot('dummy_token') as ExtendedBot;
  let repliedText = '';

  const mockCtx = {
    chatId: 1234567,
    from: { id: 1234567, is_bot: false, first_name: 'Buyer' },
    reply: async (text: string) => {
      repliedText = text;
    },
  } as unknown as Context;

  await handleBuy(mockCtx, outOfStockProductId, botInstance);

  assert.ok(repliedText.includes('stok'), 'Should notify that product is out of stock');
  assert.ok(repliedText.includes('habis'), 'Should notify that stock is empty');
});

test('Buy Command: Fails gracefully when product is not found', async () => {
  const botInstance = new Bot('dummy_token') as ExtendedBot;
  let repliedText = '';

  const mockCtx = {
    chatId: 1234567,
    from: { id: 1234567, is_bot: false, first_name: 'Buyer' },
    reply: async (text: string) => {
      repliedText = text;
    },
  } as unknown as Context;

  await handleBuy(mockCtx, 'non-existent-product-id', botInstance);

  assert.ok(repliedText.includes('tidak ditemukan'), 'Should notify that product was not found');
});

test('Buy Command: Paying with sufficient Saldo (10000) for Rp 5000 product applies Rp 200 discount (4800 deducted -> 5200 remaining)', async () => {
  const botInstance = new Bot('dummy_token') as ExtendedBot;
  const sentMessages: Array<{ chatId: unknown; text: string }> = [];

  botInstance.sendMessage = async (chatId, text) => {
    sentMessages.push({ chatId, text: text || '' });
    return { message_id: sentMessages.length + 10 };
  };

  const buyerTgId = `88220001`;
  const userRes = await query<{ id: string }>(
    `INSERT INTO users (telegram_id, role, balance)
     VALUES ($1, 'buyer', 10000)
     ON CONFLICT (telegram_id) DO UPDATE SET balance = 10000
     RETURNING id`,
    [buyerTgId]
  );
  const userId = userRes.rows[0].id;

  const prodRes = await query<Product>(
    `INSERT INTO products (name, price, stock, is_active, is_manual)
     VALUES ('Test Produk Saldo 5K', 5000, 10, true, true)
     RETURNING *`
  );
  const prod = prodRes.rows[0];

  try {
    const mockCtx = {
      chatId: Number(buyerTgId),
      from: { id: Number(buyerTgId), is_bot: false, first_name: 'SaldoBuyer' },
      reply: async () => {},
    } as unknown as Context;

    await handleBuy(mockCtx, prod.id, botInstance, undefined, 'balance');

    const balCheck = await query<{ balance: number }>(
      'SELECT balance FROM users WHERE id = $1 LIMIT 1',
      [userId]
    );
    assert.strictEqual(
      Number(balCheck.rows[0]?.balance),
      5200,
      'Balance must be reduced by exact Rp 4.800 (Rp 5.000 - Rp 200 discount)'
    );

    const ordCheck = await query<{
      payment_status: string;
      invoice_data: Record<string, unknown>;
    }>(
      'SELECT payment_status, invoice_data FROM orders WHERE product_id = $1 ORDER BY created_at DESC LIMIT 1',
      [prod.id]
    );
    assert.strictEqual(ordCheck.rows.length, 1, 'Order must be created');
    assert.strictEqual(ordCheck.rows[0].payment_status, 'paid', 'Saldo order must be paid immediately');
    assert.strictEqual(ordCheck.rows[0].invoice_data.payment_method, 'balance');
    assert.strictEqual(ordCheck.rows[0].invoice_data.payable_amount, 4800);
    assert.strictEqual(ordCheck.rows[0].invoice_data.balance_discount, 200);

    const buyerMsg = sentMessages.find((m) => String(m.chatId) === buyerTgId);
    assert.ok(buyerMsg, 'Buyer must receive payment/queue confirmation');
    assert.ok(buyerMsg.text.includes('4.800'), 'Confirmation must show Rp 4.800 total');
    assert.ok(buyerMsg.text.includes('5.200'), 'Confirmation must show remaining balance Rp 5.200');
  } finally {
    await query('DELETE FROM orders WHERE product_id = $1', [prod.id]);
    await query('DELETE FROM products WHERE id = $1', [prod.id]);
    await query('DELETE FROM users WHERE id = $1', [userId]);
  }
});

test('Buy Command: Insufficient Saldo blocks purchase cleanly and shows Top up button', async () => {
  const botInstance = new Bot('dummy_token') as ExtendedBot;
  let sentText = '';
  let sentMarkup: { inline_keyboard?: Array<Array<{ text: string; callback_data?: string }>> } = {};

  botInstance.sendMessage = async (_chatId, text, options) => {
    sentText = text || '';
    sentMarkup = (options?.reply_markup as typeof sentMarkup) || {};
    return { message_id: 99 };
  };

  const buyerTgId = `88220002`;
  const userRes = await query<{ id: string }>(
    `INSERT INTO users (telegram_id, role, balance)
     VALUES ($1, 'buyer', 1500)
     ON CONFLICT (telegram_id) DO UPDATE SET balance = 1500
     RETURNING id`,
    [buyerTgId]
  );
  const userId = userRes.rows[0].id;

  const prodRes = await query<Product>(
    `INSERT INTO products (name, price, stock, is_active, is_manual)
     VALUES ('Test Produk Saldo Kurang 5K', 5000, 10, true, true)
     RETURNING *`
  );
  const prod = prodRes.rows[0];

  try {
    const mockCtx = {
      chatId: Number(buyerTgId),
      from: { id: Number(buyerTgId), is_bot: false, first_name: 'LowSaldoBuyer' },
      reply: async () => {},
    } as unknown as Context;

    await handleBuy(mockCtx, prod.id, botInstance, undefined, 'balance');

    const balCheck = await query<{ balance: number }>(
      'SELECT balance FROM users WHERE id = $1 LIMIT 1',
      [userId]
    );
    assert.strictEqual(Number(balCheck.rows[0]?.balance), 1500, 'Insufficient balance must remain untouched');

    const ordCheck = await query(
      'SELECT id FROM orders WHERE product_id = $1',
      [prod.id]
    );
    assert.strictEqual(ordCheck.rows.length, 0, 'No order should be inserted when balance is insufficient');

    assert.ok(sentText.includes('SALDO AKUN TIDAK MENCUKUPI'), 'Must display insufficient balance alert');
    const flatButtons = sentMarkup.inline_keyboard?.flat() || [];
    const topUpBtn = flatButtons.find((b) =>
      b.text.includes('Saldo (tidak mencukupi | Top up sekarang)')
    );
    assert.ok(topUpBtn, 'Must include exact Top up label requested by user');
    assert.strictEqual(topUpBtn?.callback_data, 'menu_deposit', 'Top up button must route to menu_deposit');
  } finally {
    await query('DELETE FROM orders WHERE product_id = $1', [prod.id]);
    await query('DELETE FROM products WHERE id = $1', [prod.id]);
    await query('DELETE FROM users WHERE id = $1', [userId]);
  }
});
