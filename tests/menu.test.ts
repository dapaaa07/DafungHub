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
  parseStoredCredentialDisplay,
  sendOrderStatus,
  sendCheckoutMethodMenu,
  registerMenuHandlers,
} from '../bot/menu';
import { Bot, Context } from 'node-telegram-bot-api';
import { ExtendedBot } from '../bot/handler';
import { pool, query } from '../lib/db';
import { encrypt } from '../lib/encrypt';

after(async () => {
  await query("DELETE FROM users WHERE telegram_id = ANY($1)", [['12345', '88112210', '88112299']]);
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

test('Order History: sendOrdersMenu renders delivered credentials inline and paginates order list', async () => {
  const botInstance = new Bot('dummy_token') as ExtendedBot;
  let sentText = '';
  let sentMarkup: { inline_keyboard?: Array<Array<{ text: string; callback_data?: string }>> } = {};

  botInstance.sendMessage = async (_chatId, text, options) => {
    sentText = text || '';
    sentMarkup = (options?.reply_markup as typeof sentMarkup) || {};
    return {};
  };

  const buyerTelegramId = '88112201';
  const userRes = await query<{ id: string }>(
    `INSERT INTO users (telegram_id, role)
     VALUES ($1, 'buyer')
     ON CONFLICT (telegram_id) DO UPDATE SET telegram_id = EXCLUDED.telegram_id
     RETURNING id`,
    [buyerTelegramId]
  );
  const userId = userRes.rows[0].id;

  const prodRes = await query<{ id: string }>(
    `INSERT INTO products (name, price, stock, is_active)
     VALUES ('Canva Pro History Test', 15000, 10, true)
     RETURNING id`
  );
  const prodId = prodRes.rows[0].id;

  const orderCodes: string[] = [];
  try {
    // Seed 6 delivered orders to exercise both inline credential display and page 2 pagination
    for (let i = 1; i <= 6; i++) {
      const code = `TEST-HIST-${Date.now()}-${i}`;
      orderCodes.push(code);
      const cred = encrypt(`akun${i}@history.test:Pass00${i}`);
      await query(
        `INSERT INTO orders (user_id, product_id, order_code, payment_status, fulfillment_status, credential_encrypted, delivered_at)
         VALUES ($1, $2, $3, 'paid', 'delivered', $4, CURRENT_TIMESTAMP)`,
        [userId, prodId, code, cred]
      );
    }

    const mockCtx = {
      chatId: Number(buyerTelegramId),
      from: { id: Number(buyerTelegramId), first_name: 'RiwayatBuyer' },
      reply: async () => {},
    } as unknown as Context;

    await sendOrdersMenu(mockCtx, botInstance, 0);

    assert.ok(sentText.includes('RIWAYAT PESANAN SAYA'), 'Must render order history header');
    assert.ok(sentText.includes('Hal 1/2'), 'Must show page indicator for >5 orders');
    assert.ok(sentText.includes('Canva Pro History Test'), 'Must show product name');
    assert.ok(sentText.includes('SELESAI (DELIVERED)'), 'Must show delivered status');
    assert.ok(sentText.includes('akun6@history.test:Pass006') || sentText.includes('akun1@history.test:Pass001'), 'Must display decrypted credentials directly in order history');

    const flatButtons = sentMarkup.inline_keyboard?.flat() || [];
    assert.ok(
      flatButtons.some((b) => b.text.includes('Detail & Kredensial')),
      'Must provide Detail & Kredensial button for delivered orders'
    );
    assert.ok(
      flatButtons.some((b) => b.callback_data === 'orders_page_1'),
      'Must include next page pagination button orders_page_1'
    );
  } finally {
    await query('DELETE FROM orders WHERE order_code = ANY($1)', [orderCodes]);
    await query('DELETE FROM products WHERE id = $1', [prodId]);
  }
});

test('Order History: sendOrderStatus displays decrypted credential & media button to owner and blocks non-owner access', async () => {
  const botInstance = new Bot('dummy_token') as ExtendedBot;
  let sentText = '';
  let sentMarkup: {
    inline_keyboard?: Array<Array<{ text: string; callback_data?: string; copy_text?: { text: string } }>>;
  } = {};

  botInstance.sendMessage = async (_chatId, text, options) => {
    sentText = text || '';
    sentMarkup = (options?.reply_markup as typeof sentMarkup) || {};
    return {};
  };

  const ownerTgId = '88112202';
  const otherTgId = '88112203';
  const userRes = await query<{ id: string }>(
    `INSERT INTO users (telegram_id, role)
     VALUES ($1, 'buyer')
     ON CONFLICT (telegram_id) DO UPDATE SET telegram_id = EXCLUDED.telegram_id
     RETURNING id`,
    [ownerTgId]
  );
  const userId = userRes.rows[0].id;

  const prodRes = await query<{ id: string }>(
    `INSERT INTO products (name, price, stock, is_active)
     VALUES ('Netflix Private Cred Test', 40000, 5, true)
     RETURNING id`
  );
  const prodId = prodRes.rows[0].id;

  const testOrderCode = `TEST-CRED-DETAIL-${Date.now()}`;
  const secretCred = 'owner@netflix.id:UltraSecret99!';

  try {
    await query(
      `INSERT INTO orders (user_id, product_id, order_code, payment_status, fulfillment_status, credential_encrypted, delivered_at, invoice_data)
       VALUES ($1, $2, $3, 'paid', 'delivered', $4, CURRENT_TIMESTAMP, $5)`,
      [
        userId,
        prodId,
        testOrderCode,
        encrypt(secretCred),
        JSON.stringify({
          delivered_media: {
            type: 'document',
            fileId: 'tg_doc_test_123',
            fileName: 'panduan_login.txt',
          },
        }),
      ]
    );

    // 1. Owning buyer views order detail
    const ownerCtx = {
      chatId: Number(ownerTgId),
      from: { id: Number(ownerTgId), first_name: 'OwnerBuyer' },
      reply: async () => {},
    } as unknown as Context;

    await sendOrderStatus(ownerCtx, botInstance, testOrderCode);

    assert.ok(sentText.includes(secretCred), 'Owning buyer must see full decrypted credential');
    const flatButtons = sentMarkup.inline_keyboard?.flat() || [];
    assert.ok(
      flatButtons.some((b) => b.copy_text?.text === secretCred),
      'Must include 1-click Salin Kredensial button with copy_text'
    );
    assert.ok(
      flatButtons.some((b) => b.callback_data === `resend_media_${testOrderCode}`),
      'Must include resend media attachment button when delivered_media exists'
    );

    // 2. Unrelated non-admin buyer tries to inspect the same order code
    const intruderCtx = {
      chatId: Number(otherTgId),
      from: { id: Number(otherTgId), first_name: 'OtherUser' },
      reply: async () => {},
    } as unknown as Context;

    await sendOrderStatus(intruderCtx, botInstance, testOrderCode);
    assert.ok(!sentText.includes(secretCred), 'Other buyer must NOT see another user credential');
    assert.ok(sentText.includes('hanya dapat diakses oleh pemilik pesanan'), 'Must display ownership restriction notice');
  } finally {
    await query('DELETE FROM orders WHERE order_code = $1', [testOrderCode]);
    await query('DELETE FROM products WHERE id = $1', [prodId]);
  }
});

test('Checkout Payment Choice: sendCheckoutMethodMenu shows QRIS and Saldo (-Rp 200) when sufficient, and Top Up label when insufficient', async () => {
  const botInstance = new Bot('dummy_token') as ExtendedBot;
  let sentText = '';
  let sentMarkup: {
    inline_keyboard?: Array<Array<{ text: string; callback_data?: string }>>;
  } = {};

  botInstance.sendMessage = async (_chatId, text, options) => {
    sentText = text || '';
    sentMarkup = (options?.reply_markup as typeof sentMarkup) || {};
    return { message_id: 777 };
  };

  registerMenuHandlers(botInstance);

  const buyerTgId = '88112299';
  const prodRes = await query<{ id: string }>(
    `INSERT INTO products (name, price, stock, is_active, is_manual)
     VALUES ('Test Produk Pilihan Bayar 5K', 5000, 10, true, true)
     RETURNING id`
  );
  const prodId = prodRes.rows[0].id;

  const userRes = await query<{ id: string }>(
    `INSERT INTO users (telegram_id, role, balance)
     VALUES ($1, 'buyer', 10000)
     ON CONFLICT (telegram_id) DO UPDATE SET balance = 10000
     RETURNING id`,
    [buyerTgId]
  );
  const userId = userRes.rows[0].id;

  try {
    // 1. User clicks buy_<prodId> with Rp 10.000 balance for Rp 5.000 product -> shows both QRIS and Saldo (Rp 4.800)
    await botInstance.handleUpdate({
      update_id: 910,
      callback_query: {
        id: 'cb_checkout_sufficient',
        from: { id: Number(buyerTgId), is_bot: false, first_name: 'Buyer10k' },
        chat_instance: 'ci_chk_1',
        data: `buy_${prodId}`,
        message: {
          message_id: 50,
          date: Math.floor(Date.now() / 1000),
          chat: { id: Number(buyerTgId), type: 'private' },
        },
      },
    });

    assert.ok(sentText.includes('PILIH METODE PEMBAYARAN'), 'Clicking buy_ must show checkout payment selector');
    assert.ok(sentText.includes('10.000'), 'Must show user balance Rp 10.000');
    assert.ok(sentText.includes('4.800'), 'Must show Saldo price Rp 4.800 (Rp 200 cheaper)');

    const buttons1 = sentMarkup.inline_keyboard?.flat() || [];
    const qrisBtn1 = buttons1.find((b) => b.callback_data === `pay_qris:${prodId}`);
    const balBtn1 = buttons1.find((b) => b.callback_data === `pay_bal:${prodId}`);
    assert.ok(qrisBtn1 && qrisBtn1.text.includes('QRIS'), 'Must include QRIS payment option');
    assert.ok(balBtn1 && balBtn1.text.includes('4.800'), 'Must include active Saldo payment button at Rp 4.800');

    // 2. Reduce user balance to Rp 2.000 (insufficient for Rp 4.800) -> shows Saldo(tidak mencukupi | Top up sekarang)
    await query('UPDATE users SET balance = 2000 WHERE id = $1', [userId]);

    const lowCtx = {
      chatId: Number(buyerTgId),
      from: { id: Number(buyerTgId), is_bot: false, first_name: 'Buyer2k' },
      reply: async () => {},
    } as unknown as Context;

    await sendCheckoutMethodMenu(lowCtx, botInstance, prodId);

    const buttons2 = sentMarkup.inline_keyboard?.flat() || [];
    const qrisBtn2 = buttons2.find((b) => b.callback_data === `pay_qris:${prodId}`);
    const topUpBtn2 = buttons2.find((b) =>
      b.text.includes('Saldo (tidak mencukupi | Top up sekarang)')
    );
    assert.ok(qrisBtn2, 'QRIS payment option must remain available when Saldo is insufficient');
    assert.ok(topUpBtn2, 'Must show "Saldo (tidak mencukupi | Top up sekarang)" button when Saldo is insufficient');
    assert.strictEqual(topUpBtn2?.callback_data, 'menu_deposit', 'Top up button must navigate to menu_deposit');
  } finally {
    await query('DELETE FROM products WHERE id = $1', [prodId]);
    await query('DELETE FROM users WHERE id = $1', [userId]);
  }
});

test('Order History: parseStoredCredentialDisplay cleanly separates attachment tags from credential text', () => {
  assert.deepStrictEqual(
    parseStoredCredentialDisplay('[FILE: DOCUMENT - akun.txt] user@mail.com:Secret123'),
    { attachmentLabel: 'DOCUMENT - akun.txt', credentialText: 'user@mail.com:Secret123' }
  );

  assert.deepStrictEqual(
    parseStoredCredentialDisplay('[FILE: DOCUMENT - 63dbc37c280ab53a.txt] '),
    { attachmentLabel: 'DOCUMENT - 63dbc37c280ab53a.txt', credentialText: null }
  );

  assert.deepStrictEqual(
    parseStoredCredentialDisplay('[MEDIA: voucher.png] Dikirim via lampiran media'),
    { attachmentLabel: 'voucher.png', credentialText: null }
  );

  assert.deepStrictEqual(
    parseStoredCredentialDisplay('plain.buyer@test.id:PassWithoutMedia1'),
    { attachmentLabel: null, credentialText: 'plain.buyer@test.id:PassWithoutMedia1' }
  );
});

test('Order History Click Flow: clicking orders in menu_orders displays text credentials and immediately dispatches media', async () => {
  const botInstance = new Bot('dummy_token') as ExtendedBot;
  let lastSentText = '';
  let lastSentMarkup: {
    inline_keyboard?: Array<Array<{ text: string; callback_data?: string; copy_text?: { text: string } }>>;
  } = {};
  const sentDocuments: Array<Record<string, unknown>> = [];
  const sentPhotos: Array<Record<string, unknown>> = [];
  const deletedMessageIds: number[] = [];

  botInstance.sendMessage = async (_chatId, text, options) => {
    lastSentText = text || '';
    lastSentMarkup = (options?.reply_markup as typeof lastSentMarkup) || {};
    return { message_id: 901 };
  };
  (
    botInstance.api as unknown as {
      sendDocument: (payload: Record<string, unknown>) => Promise<{ message_id: number }>;
    }
  ).sendDocument = async (
    payload: Record<string, unknown>
  ) => {
    sentDocuments.push(payload);
    return { message_id: 951 };
  };
  (
    botInstance.api as unknown as {
      sendPhoto: (payload: Record<string, unknown>) => Promise<{ message_id: number }>;
    }
  ).sendPhoto = async (
    payload: Record<string, unknown>
  ) => {
    sentPhotos.push(payload);
    return { message_id: 952 };
  };
  botInstance.api.deleteMessage = async (params: unknown) => {
    const p = params as { message_id?: number };
    if (p?.message_id) deletedMessageIds.push(p.message_id);
    return true as never;
  };

  registerMenuHandlers(botInstance);

  const buyerTgId = '88112210';
  const userRes = await query<{ id: string }>(
    `INSERT INTO users (telegram_id, role, balance, first_name)
     VALUES ($1, 'buyer', 0, 'MediaHistoryBuyer')
     ON CONFLICT (telegram_id) DO UPDATE SET first_name = EXCLUDED.first_name
     RETURNING id`,
    [buyerTgId]
  );
  const userId = userRes.rows[0].id;

  const prodRes = await query<{ id: string }>(
    `INSERT INTO products (name, price, stock, is_active, is_manual)
     VALUES ('Produk Uji Riwayat Media', 15000, 10, true, true)
     RETURNING id`
  );
  const prodId = prodRes.rows[0].id;

  const ts = Date.now();
  const codeTextOnly = `TEST-HIST-TXT-${ts}`;
  const codeDocWithText = `TEST-HIST-DOC-${ts}`;
  const codePhotoOnly = `TEST-HIST-IMG-${ts}`;
  const codeLegacyFile = `TEST-HIST-LEG-${ts}`;
  const allCodes = [codeTextOnly, codeDocWithText, codePhotoOnly, codeLegacyFile];

  try {
    // 1. Plain credential without media
    await query(
      `INSERT INTO orders (user_id, product_id, order_code, payment_status, fulfillment_status, credential_encrypted, delivered_at)
       VALUES ($1, $2, $3, 'paid', 'delivered', $4, CURRENT_TIMESTAMP)`,
      [userId, prodId, codeTextOnly, encrypt('plain.buyer@test.id:PassWithoutMedia1')]
    );

    // 2. Document media + text credential
    await query(
      `INSERT INTO orders (user_id, product_id, order_code, payment_status, fulfillment_status, credential_encrypted, delivered_at, invoice_data)
       VALUES ($1, $2, $3, 'paid', 'delivered', $4, CURRENT_TIMESTAMP, $5)`,
      [
        userId,
        prodId,
        codeDocWithText,
        encrypt('[FILE: DOCUMENT - akun.txt] file.buyer@test.id:PassWithFile2'),
        JSON.stringify({
          delivered_media: {
            type: 'document',
            fileId: 'tg_doc_history_2',
            fileName: 'akun.txt',
          },
        }),
      ]
    );

    // 3. Photo media ONLY (placeholder caption stored on fulfill)
    await query(
      `INSERT INTO orders (user_id, product_id, order_code, payment_status, fulfillment_status, credential_encrypted, delivered_at, invoice_data)
       VALUES ($1, $2, $3, 'paid', 'delivered', $4, CURRENT_TIMESTAMP, $5)`,
      [
        userId,
        prodId,
        codePhotoOnly,
        encrypt('[MEDIA: voucher.png] Dikirim via lampiran media'),
        JSON.stringify({
          delivered_media: {
            type: 'photo',
            fileId: 'tg_photo_history_3',
            fileName: 'voucher.png',
          },
        }),
      ]
    );

    // 4. Legacy document order without delivered_media metadata
    await query(
      `INSERT INTO orders (user_id, product_id, order_code, payment_status, fulfillment_status, credential_encrypted, delivered_at)
       VALUES ($1, $2, $3, 'paid', 'delivered', $4, CURRENT_TIMESTAMP)`,
      [userId, prodId, codeLegacyFile, encrypt('[FILE: DOCUMENT - legacy_hash.txt] ')]
    );

    const makeCallbackUpdate = (updateId: number, data: string, msgId: number) => ({
      update_id: updateId,
      callback_query: {
        id: `cb_${updateId}`,
        from: { id: Number(buyerTgId), is_bot: false, first_name: 'MediaHistoryBuyer' },
        chat_instance: `ci_${updateId}`,
        data,
        message: {
          message_id: msgId,
          date: Math.floor(Date.now() / 1000),
          chat: { id: Number(buyerTgId), type: 'private' as const },
        },
      },
    });

    // A. Open Order History menu_orders
    await botInstance.handleUpdate(makeCallbackUpdate(1001, 'menu_orders', 700));
    assert.ok(lastSentText.includes('RIWAYAT PESANAN SAYA'));
    assert.ok(lastSentText.includes('plain.buyer@test.id:PassWithoutMedia1'));
    assert.ok(lastSentText.includes('file.buyer@test.id:PassWithFile2'));
    assert.ok(lastSentText.includes('akun.txt'));
    assert.ok(lastSentText.includes('voucher.png'));
    assert.ok(!lastSentText.includes('[FILE:'), 'Must NOT leak raw [FILE: tag in order history');
    assert.ok(!lastSentText.includes('[MEDIA:'), 'Must NOT leak raw [MEDIA: tag in order history');

    // B. Click order WITHOUT media -> renders text + copy_text without media calls
    await botInstance.handleUpdate(makeCallbackUpdate(1002, `status_${codeTextOnly}`, 701));
    assert.strictEqual(sentDocuments.length, 0);
    assert.strictEqual(sentPhotos.length, 0);
    assert.ok(lastSentText.includes('plain.buyer@test.id:PassWithoutMedia1'));
    const txtButtons = lastSentMarkup.inline_keyboard?.flat() || [];
    assert.ok(
      txtButtons.some((b) => b.copy_text?.text === 'plain.buyer@test.id:PassWithoutMedia1'),
      'Non-media order must provide 1-click Salin Kredensial'
    );

    // C. Click order WITH document + text -> immediately dispatches document AND renders clean credential card
    await botInstance.handleUpdate(makeCallbackUpdate(1003, `status_${codeDocWithText}`, 702));
    assert.strictEqual(sentDocuments.length, 1, 'Clicking document order must immediately dispatch sendDocument');
    assert.strictEqual(sentDocuments[0].document, 'tg_doc_history_2');
    assert.ok(String(sentDocuments[0].caption || '').includes('LAMPIRAN KREDENSIAL PESANAN'));
    assert.ok(String(sentDocuments[0].caption || '').includes('file.buyer@test.id:PassWithFile2'));
    assert.ok(!String(sentDocuments[0].caption || '').includes('[FILE:'));
    assert.ok(
      !deletedMessageIds.includes(951),
      'Preserved dispatched document message_id=951 must NOT be deleted by sendSafeMessage cleanup'
    );
    assert.ok(lastSentText.includes('file.buyer@test.id:PassWithFile2'));
    assert.ok(!lastSentText.includes('[FILE:'));
    const docButtons = lastSentMarkup.inline_keyboard?.flat() || [];
    assert.ok(
      docButtons.some((b) => b.copy_text?.text === 'file.buyer@test.id:PassWithFile2'),
      'Document+text order must copy only clean credential text'
    );
    assert.ok(
      docButtons.some((b) => b.callback_data === `resend_media_${codeDocWithText}`),
      'Document order must keep Kirim Ulang File button'
    );

    // D. Click order WITH photo ONLY -> immediately dispatches photo AND omits broken copy_text
    await botInstance.handleUpdate(makeCallbackUpdate(1004, `status_${codePhotoOnly}`, 703));
    assert.strictEqual(sentPhotos.length, 1, 'Clicking photo order must immediately dispatch sendPhoto');
    assert.strictEqual(sentPhotos[0].photo, 'tg_photo_history_3');
    assert.ok(
      !deletedMessageIds.includes(952),
      'Preserved dispatched photo message_id=952 must NOT be deleted by cleanup'
    );
    assert.ok(lastSentText.includes('voucher.png'));
    assert.ok(!lastSentText.includes('[MEDIA:'));
    assert.ok(!lastSentText.includes('Dikirim via lampiran media'));
    const photoButtons = lastSentMarkup.inline_keyboard?.flat() || [];
    assert.ok(
      !photoButtons.some((b) => b.copy_text),
      'Media-only order without text credential must not attach a fake copy_text button'
    );
    assert.ok(
      photoButtons.some((b) => b.callback_data === `resend_media_${codePhotoOnly}`),
      'Photo order must keep Kirim Ulang File button'
    );

    // E. Click legacy file order without delivered_media -> honest archive notice, no raw [FILE: copy button
    await botInstance.handleUpdate(makeCallbackUpdate(1005, `status_${codeLegacyFile}`, 704));
    assert.ok(lastSentText.includes('legacy_hash.txt'));
    assert.ok(!lastSentText.includes('[FILE:'));
    const legacyButtons = lastSentMarkup.inline_keyboard?.flat() || [];
    assert.ok(!legacyButtons.some((b) => b.copy_text));
  } finally {
    await query('DELETE FROM orders WHERE order_code = ANY($1)', [allCodes]);
    await query('DELETE FROM products WHERE id = $1', [prodId]);
    await query('DELETE FROM users WHERE id = $1', [userId]);
  }
});

