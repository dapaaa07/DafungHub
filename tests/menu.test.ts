import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import {
  formatIndonesianDateTime,
  getMainMenuInlineKeyboard,
  getPersistentKeyboard,
  sendMainMenu,
  sendProductsMenu,
  sendProfileMenu,
  sendDepositMenu,
  sendApiMenu,
  sendOrdersMenu,
  extractQrisFromInvoiceData,
  sendOrderInvoice,
  sendOrderStatus,
  registerMenuHandlers,
} from '../bot/menu';
import { Bot, Context } from 'node-telegram-bot-api';
import { ExtendedBot } from '../bot/handler';
import { pool, query } from '../lib/db';

after(async () => {
  await pool.end();
});

test('Interactive Menu: formatIndonesianDateTime generates Indonesian timestamp', () => {
  const d = new Date('2026-10-11T13:54:45');
  const str = formatIndonesianDateTime(d);
  assert.ok(str.includes('Minggu'), 'Must include day name');
  assert.ok(str.includes('Oktober'), 'Must include month name');
  assert.ok(str.includes('2026'), 'Must include year');
  assert.ok(str.includes('13:54:45'), 'Must include time');
});

test('Interactive Menu: getMainMenuInlineKeyboard matches required layout', () => {
  const kb = getMainMenuInlineKeyboard();
  assert.ok(Array.isArray(kb.inline_keyboard), 'Must contain inline_keyboard array');
  assert.strictEqual(kb.inline_keyboard.length, 3, 'Must have 3 rows of buttons for regular buyer');

  // Row 1: Produk & Profil
  assert.strictEqual(kb.inline_keyboard[0][0].text, '🟢 Produk');
  assert.strictEqual(kb.inline_keyboard[0][1].text, '👤 Profil');

  // Row 2: Deposit & Membership
  assert.strictEqual(kb.inline_keyboard[1][0].text, '💰 Deposit');
  assert.strictEqual(kb.inline_keyboard[1][1].text, '💎 Membership');

  // Row 3: Pesanan Saya & Channel
  assert.strictEqual(kb.inline_keyboard[2][0].text, '📩 Pesanan Saya');
  assert.ok(kb.inline_keyboard[2][1].text.includes('Gabung Channel'));
  const channelBtn = kb.inline_keyboard[2][1] as { text: string; url?: string };
  assert.strictEqual(channelBtn.url, 'https://t.me/DafungHub');

  // Ensure Developer API and Payment Gateway are NOT present
  const allButtonTexts = kb.inline_keyboard.flat().map((b) => b.text);
  assert.ok(!allButtonTexts.some((t) => t.includes('Developer API')), 'Developer API must be removed');
  assert.ok(!allButtonTexts.some((t) => t.includes('Payment Gateway')), 'Payment Gateway must be removed');
});

test('Interactive Menu: getPersistentKeyboard contains bottom action buttons', () => {
  const pkb = getPersistentKeyboard();
  assert.ok(Array.isArray(pkb.keyboard), 'Must contain keyboard array');
  assert.strictEqual(pkb.resize_keyboard, true);
  assert.strictEqual(pkb.keyboard[0][0].text, '🟢 Produk');
  assert.strictEqual(pkb.keyboard[0][1].text, '👤 Profil');
  assert.strictEqual(pkb.keyboard[1][0].text, '💎 Membership');
  assert.strictEqual(pkb.keyboard[1][1].text, '💰 Deposit');
  assert.strictEqual(pkb.keyboard[2][0].text, '📩 Pesanan Saya');
  assert.strictEqual(pkb.keyboard[2][1].text, '❓ Bantuan');

  const allKeyTexts = pkb.keyboard.flat().map((b) => b.text);
  assert.ok(!allKeyTexts.some((t) => t.includes('Developer API')), 'Developer API must not be in keyboard');
});

test('Interactive Menu: sendMainMenu sends welcome message with buttons', async () => {
  const botInstance = new Bot('dummy_token') as ExtendedBot;
  let sentText = '';
  let sentMarkup: unknown = null;

  interface SendMsgPayload {
    text: string;
    reply_markup?: unknown;
  }

  botInstance.sendMessage = async (_chatId, text, options) => {
    sentText = text || '';
    sentMarkup = options?.reply_markup;
    return {};
  };

  const mockCtx = {
    chatId: 12345,
    from: { id: 12345, first_name: 'dapp' },
    reply: async (text: string, options?: SendMsgPayload) => {
      sentText = text;
      sentMarkup = options?.reply_markup;
    },
  } as unknown as Context;

  await sendMainMenu(mockCtx, botInstance);

  assert.ok(sentText.includes('Hello, dapp'), 'Must greet with user name');
  assert.ok(sentMarkup !== null, 'Must attach reply markup');
});

test('Interactive Menu: sendProductsMenu renders supplier products catalogue', async () => {
  const botInstance = new Bot('dummy_token') as ExtendedBot;
  let sentText = '';
  let sentMarkup: { inline_keyboard?: Array<Array<{ text: string; callback_data?: string }>> } = {};

  botInstance.sendMessage = async (_chatId, text, options) => {
    sentText = text || '';
    sentMarkup = (options?.reply_markup as typeof sentMarkup) || {};
    return {};
  };

  const mockCtx = {
    chatId: 12345,
    from: { id: 12345, first_name: 'dapp' },
    reply: async () => {},
  } as unknown as Context;

  await sendProductsMenu(mockCtx, botInstance, 0);

  assert.ok(sentText.includes('KATALOG PRODUK'), 'Must show catalog header');
  assert.ok(Array.isArray(sentMarkup.inline_keyboard), 'Must contain product buttons');
  assert.ok((sentMarkup.inline_keyboard?.length || 0) > 1, 'Must have multiple product buttons');
});

test('Interactive Menu: sendProfileMenu renders user balance and profile (not supplier balance)', async () => {
  const botInstance = new Bot('dummy_token') as ExtendedBot;
  let sentText = '';

  botInstance.sendMessage = async (_chatId, text) => {
    sentText = text || '';
    return {};
  };

  const testUserId = 778899;
  // Seed user with specific balance in Dafung Hub database
  await query(
    `INSERT INTO users (telegram_id, role, balance)
     VALUES ($1, 'buyer', 45000)
     ON CONFLICT (telegram_id) DO UPDATE SET balance = 45000`,
    [String(testUserId)]
  );

  const mockCtx = {
    chatId: testUserId,
    from: { id: testUserId, first_name: 'Budi', username: 'budi_buyer' },
    reply: async () => {},
  } as unknown as Context;

  await sendProfileMenu(mockCtx, botInstance);

  assert.ok(sentText.includes('PROFIL PENGGUNA'), 'Must show profile header');
  assert.ok(sentText.includes('Budi'), 'Must show first name');
  assert.ok(sentText.includes('@budi_buyer'), 'Must show user telegram username');
  assert.ok(sentText.includes('Rp 45.000'), 'Must show user Dafung Hub balance');
  assert.ok(sentText.includes('Active Member'), 'Must show Active Member for regular buyer');
  assert.ok(!sentText.includes('Supplier H2H'), 'Must never show supplier branding or details to regular user');
});

test('Interactive Menu: sendDepositMenu renders top-up nominals', async () => {
  const botInstance = new Bot('dummy_token') as ExtendedBot;
  let sentText = '';
  let sentMarkup: { inline_keyboard?: Array<Array<{ text: string }>> } = {};

  botInstance.sendMessage = async (_chatId, text, options) => {
    sentText = text || '';
    sentMarkup = (options?.reply_markup as typeof sentMarkup) || {};
    return {};
  };

  const mockCtx = {
    chatId: 12345,
    from: { id: 12345, first_name: 'dapp' },
    reply: async () => {},
  } as unknown as Context;

  await sendDepositMenu(mockCtx, botInstance);

  assert.ok(sentText.includes('DEPOSIT / TOP UP'), 'Must show deposit header');
  assert.ok(sentMarkup.inline_keyboard?.[0]?.[0]?.text?.includes('10.000'), 'Must include 10.000');
});

test('Interactive Menu: sendApiMenu displays documentation link', async () => {
  const botInstance = new Bot('dummy_token') as ExtendedBot;
  let sentText = '';

  botInstance.sendMessage = async (_chatId, text) => {
    sentText = text || '';
    return {};
  };

  const mockCtx = {
    chatId: 12345,
    from: { id: 12345, first_name: 'dapp' },
    reply: async () => {},
  } as unknown as Context;

  await sendApiMenu(mockCtx, botInstance);

  assert.ok(sentText.includes('DEVELOPER API'), 'Must show API header');
  assert.ok(sentText.includes('prastyaaneki.biz.id'), 'Must show API host');
});

test('Interactive Menu: registerMenuHandlers dispatches callback queries', async () => {
  const botInstance = new Bot('dummy_token') as ExtendedBot;
  let menuProductsCalled = false;

  botInstance.sendMessage = async () => {
    menuProductsCalled = true;
    return {};
  };

  registerMenuHandlers(botInstance);

  await botInstance.handleUpdate({
    update_id: 201,
    callback_query: {
      id: 'cb_test_1',
      from: { id: 12345, is_bot: false, first_name: 'dapp' },
      chat_instance: 'ci_1',
      data: 'menu_products',
      message: {
        message_id: 10,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 12345, type: 'private' },
      },
    },
  });

  assert.strictEqual(menuProductsCalled, true, 'Callback menu_products must be handled');
});

test('QRIS Redisplay: extractQrisFromInvoiceData parses URL and string correctly', () => {
  // 1. Actions array format (Midtrans Core API)
  const invoice1 = {
    actions: [
      { name: 'generate-qr-code', url: 'https://api.midtrans.com/qris/123/qr-code' },
    ],
    qr_string: '00020101...',
  };
  const res1 = extractQrisFromInvoiceData(invoice1);
  assert.strictEqual(res1.qrCodeUrl, 'https://api.midtrans.com/qris/123/qr-code');
  assert.strictEqual(res1.qrString, '00020101...');

  // 2. Direct qr_code_url format
  const invoice2 = JSON.stringify({
    qr_code_url: 'https://example.com/qr.png',
  });
  const res2 = extractQrisFromInvoiceData(invoice2);
  assert.strictEqual(res2.qrCodeUrl, 'https://example.com/qr.png');
});

test('QRIS Redisplay: sendOrderStatus re-displays QRIS for UNPAID order on refresh', async () => {
  const botInstance = new Bot('dummy_token') as ExtendedBot;
  let sentPhotoUrl = '';
  let sentCaption = '';
  let sentMarkup: { inline_keyboard?: Array<Array<{ text: string; callback_data?: string }>> } = {};

  botInstance.sendPhoto = async (_chatId, photo, options) => {
    sentPhotoUrl = photo as string;
    sentCaption = (options?.caption as string) || '';
    sentMarkup = (options?.reply_markup as typeof sentMarkup) || {};
    return {};
  };

  // Create test unpaid order in DB
  const testOrderCode = `TEST-QRIS-${Date.now()}`;
  const qrUrl = 'https://api.sandbox.midtrans.com/v2/qris/test-qr-code';
  const dummyUser = await pool.query<{ id: string }>('SELECT id FROM users LIMIT 1');
  const dummyProd = await pool.query<{ id: string }>('SELECT id FROM products LIMIT 1');
  const userId = dummyUser.rows[0]?.id;
  const prodId = dummyProd.rows[0]?.id;

  if (userId && prodId) {
    await pool.query(
      `INSERT INTO orders (user_id, product_id, order_code, payment_status, fulfillment_status, invoice_data)
       VALUES ($1, $2, $3, 'unpaid', 'pending', $4)`,
      [
        userId,
        prodId,
        testOrderCode,
        JSON.stringify({
          actions: [{ name: 'generate-qr-code', url: qrUrl }],
          qr_string: '00020101TEST',
        }),
      ]
    );

    const mockCtx = {
      chatId: 12345,
      from: { id: 12345, first_name: 'Buyer' },
      reply: async () => {},
    } as unknown as Context;

    await sendOrderStatus(mockCtx, botInstance, testOrderCode);

    assert.ok(
      sentPhotoUrl === qrUrl || Buffer.isBuffer(sentPhotoUrl),
      'QRIS photo must be redisplayed as URL or PNG buffer'
    );
    assert.ok(sentCaption.includes('INVOICE PEMBAYARAN QRIS'), 'Must show invoice header');
    assert.ok(sentCaption.includes('MENUNGGU PEMBAYARAN'), 'Must show pending payment status');
    assert.ok(sentCaption.includes(testOrderCode), 'Must show order code');

    const refreshBtn = sentMarkup.inline_keyboard?.flat().find((b) => b.callback_data === `status_${testOrderCode}`);
    assert.ok(refreshBtn, 'Must include refresh status button to allow continuous viewing');

    // Clean up
    await pool.query('DELETE FROM orders WHERE order_code = $1', [testOrderCode]);
  }
});

