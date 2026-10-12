import assert from 'node:assert/strict';
import test from 'node:test';
import { Bot } from 'node-telegram-bot-api';
import { ExtendedBot, registerHandlers } from '../bot/handler';
import {
  getEffectiveSellingPrice,
  ADMIN_TELEGRAM_ID,
} from '../lib/pricing';
import {
  setCustomPrice,
  getCustomPrices,
  deleteCustomPrice,
  clearCustomPricesCache,
} from '../lib/custom-prices';
import { getAllEnrichedProducts } from '../lib/supplier';

interface MockSendPayload {
  chat_id: number | string;
  text: string;
  reply_markup?: {
    inline_keyboard?: Array<Array<{ text: string; callback_data?: string }>>;
  };
}

function createMockBot(): {
  testBot: ExtendedBot;
  getSentText: () => string;
  getLastMarkup: () => MockSendPayload['reply_markup'];
} {
  const testBot = new Bot('dummy_token') as ExtendedBot;
  let lastText = '';
  let lastMarkup: MockSendPayload['reply_markup'];

  testBot.api.sendMessage = async (payload: unknown) => {
    const p = payload as MockSendPayload;
    lastText = p.text;
    lastMarkup = p.reply_markup;
    return {} as never;
  };

  testBot.api.sendPhoto = async (payload: unknown) => {
    const p = payload as { caption?: string; reply_markup?: MockSendPayload['reply_markup'] };
    lastText = p.caption || '';
    lastMarkup = p.reply_markup;
    return {} as never;
  };

  testBot.api.deleteMessage = async () => true as never;
  testBot.api.answerCallbackQuery = async () => true as never;

  registerHandlers(testBot);
  return {
    testBot,
    getSentText: () => lastText,
    getLastMarkup: () => lastMarkup,
  };
}

test('Custom Pricing: setCustomPrice and getCustomPrices store and retrieve override prices', async () => {
  clearCustomPricesCache();

  const testProductId = '6a2fda51035a6d898f2106fe'; // Capcut Pro test ID
  const manualPrice = 27500;

  // Set custom price
  await setCustomPrice(testProductId, manualPrice, 'Capcut Pro 1 Month FW');

  const pricesMap = await getCustomPrices();
  assert.ok(pricesMap.has(testProductId), 'Price map must contain test product ID');
  assert.strictEqual(pricesMap.get(testProductId), manualPrice, 'Must return the manual price');

  // Verify getEffectiveSellingPrice uses manual price override
  const effective = getEffectiveSellingPrice(
    { id: testProductId, name: 'Capcut Pro 1 Month FW', price_idr: 25300 },
    pricesMap
  );
  assert.strictEqual(effective, manualPrice, 'Effective price must match custom price override');

  // Delete custom price
  await deleteCustomPrice(testProductId);
  const updatedMap = await getCustomPrices();
  assert.strictEqual(updatedMap.has(testProductId), false, 'Product ID must be removed after deletion');

  // Effective price reverts to default formula
  const revertedEffective = getEffectiveSellingPrice(
    { id: testProductId, name: 'Capcut Pro 1 Month FW', price_idr: 25300 },
    updatedMap
  );
  assert.strictEqual(revertedEffective, 30500, 'Reverted effective price must follow default tiered margin formula');
});

test('Custom Pricing: /editprice rejects non-admin users', async () => {
  const { testBot, getSentText } = createMockBot();

  await testBot.handleUpdate({
    update_id: 401,
    message: {
      message_id: 1,
      date: Math.floor(Date.now() / 1000),
      chat: { id: 99999, type: 'private' },
      from: { id: 99999, is_bot: false, first_name: 'Buyer' },
      text: '/editprice capcut 28000',
    },
  });

  const sent = getSentText();
  assert.ok(
    sent.includes('Akses Ditolak') || sent.includes('Owner'),
    'Non-admin must be rejected when attempting /editprice'
  );
});

test('Custom Pricing: /editprice allows Owner to update price by keyword', async () => {
  const { testBot, getSentText } = createMockBot();

  await testBot.handleUpdate({
    update_id: 402,
    message: {
      message_id: 2,
      date: Math.floor(Date.now() / 1000),
      chat: { id: Number(ADMIN_TELEGRAM_ID), type: 'private' },
      from: { id: Number(ADMIN_TELEGRAM_ID), is_bot: false, first_name: 'Owner' },
      text: '/editprice capcut 28500',
    },
  });

  const sent = getSentText();
  assert.ok(
    sent.includes('HARGA BERHASIL DIUBAH'),
    'Owner should receive success confirmation message'
  );
  assert.ok(sent.includes('28.500'), 'Confirmation message should include new formatted price');

  // Verify in getCustomPrices
  const map = await getCustomPrices();
  const capcutId = '6a2fda51035a6d898f2106fe';
  assert.strictEqual(map.get(capcutId), 28500, 'Custom price must be recorded in map');

  // Clean up
  await deleteCustomPrice(capcutId);
});

test('Custom Pricing: /resetprice reverts product price back to formula', async () => {
  const { testBot, getSentText } = createMockBot();
  const capcutId = '6a2fda51035a6d898f2106fe';

  // Set initial custom price
  await setCustomPrice(capcutId, 29000, 'Capcut Pro 1 Month FW');

  await testBot.handleUpdate({
    update_id: 403,
    message: {
      message_id: 3,
      date: Math.floor(Date.now() / 1000),
      chat: { id: Number(ADMIN_TELEGRAM_ID), type: 'private' },
      from: { id: Number(ADMIN_TELEGRAM_ID), is_bot: false, first_name: 'Owner' },
      text: '/resetprice capcut',
    },
  });

  const sent = getSentText();
  assert.ok(
    sent.includes('HARGA DIRESET KE FORMULA STANDAR'),
    'Owner should receive reset confirmation'
  );
});

test('Custom Pricing: getAllEnrichedProducts incorporates custom prices', async () => {
  const capcutId = '6a2fda51035a6d898f2106fe';
  const customTargetPrice = 32000;

  await setCustomPrice(capcutId, customTargetPrice, 'Capcut Pro 1 Month FW');

  const products = await getAllEnrichedProducts();
  const capcutProd = products.find((p) => p.id === capcutId);
  assert.ok(capcutProd, 'Must find capcut product');
  assert.strictEqual(
    capcutProd.sellingPrice,
    customTargetPrice,
    'Enriched product selling price must equal the custom price'
  );

  // Clean up
  await deleteCustomPrice(capcutId);
});

test('Products API: GET /api/products returns real-time enriched products with CORS headers', async () => {
  const { GET, OPTIONS } = await import('../app/api/products/route');

  const optionsRes = await OPTIONS();
  assert.strictEqual(optionsRes.status, 204);
  assert.strictEqual(optionsRes.headers.get('access-control-allow-origin'), '*');

  const getRes = await GET();
  assert.strictEqual(getRes.status, 200);
  assert.strictEqual(getRes.headers.get('access-control-allow-origin'), '*');
  assert.ok(getRes.headers.get('cache-control')?.includes('no-store'));

  const data = await getRes.json();
  assert.strictEqual(data.success, true);
  assert.ok(Array.isArray(data.products));
  assert.ok(data.products.length > 0);
  assert.ok(data.products[0].sellingPrice > 0);
});

