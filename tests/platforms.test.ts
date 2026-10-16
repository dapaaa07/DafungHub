import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { Bot, Context } from 'node-telegram-bot-api';
import { ExtendedBot } from '../bot/handler';
import { pool } from '../lib/db';
import { setBotStatus, clearSettingsCache } from '../lib/settings';
import {
  PLATFORMS,
  filterProductsByPlatform,
  getPlatformsWithCounts,
  getPlatformLogoPath,
  sendPlatformsMenu,
  sendProductsMenu,
  sendProductDetail,
  registerMenuHandlers,
} from '../bot/menu';
import { getSupplierProducts } from '../lib/supplier';
import fs from 'fs';

before(async () => {
  clearSettingsCache();
  await setBotStatus('online');
});

after(async () => {
  await pool.end();
});

test('Platform Categorization: PLATFORMS definitions do not contain emojis in name', () => {
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  for (const plat of PLATFORMS) {
    assert.strictEqual(
      emojiRegex.test(plat.name),
      false,
      `Platform name "${plat.name}" must not contain emojis`
    );
  }
});

test('Platform Categorization: Official logo files exist in assets/logos/', () => {
  const essentialPlatforms = ['netflix', 'canva', 'capcut', 'duolingo', 'gemini', 'claude'];
  for (const id of essentialPlatforms) {
    const logoPath = getPlatformLogoPath(id);
    assert.ok(logoPath !== null, `Logo path for ${id} must not be null`);
    assert.strictEqual(fs.existsSync(logoPath!), true, `Logo file for ${id} must exist`);
  }
});

test('Platform Categorization: filterProductsByPlatform filters accurately', async () => {
  const allProds = await getSupplierProducts();

  // 1. Netflix products filter
  const netflixProds = filterProductsByPlatform(allProds, 'netflix');
  assert.ok(netflixProds.length > 0, 'Must find Netflix products');
  for (const p of netflixProds) {
    assert.ok(p.name.toLowerCase().includes('netflix'), `Product ${p.name} must be Netflix`);
  }

  // 2. Canva products filter
  const canvaProds = filterProductsByPlatform(allProds, 'canva');
  assert.ok(canvaProds.length > 0, 'Must find Canva products');
  for (const p of canvaProds) {
    assert.ok(p.name.toLowerCase().includes('canva'), `Product ${p.name} must be Canva`);
  }

  // 3. Fallback all returns entire catalogue
  const allResult = filterProductsByPlatform(allProds, 'all');
  assert.strictEqual(allResult.length, allProds.length);
});

test('Platform Categorization: getPlatformsWithCounts calculates active platform counts', async () => {
  const allProds = await getSupplierProducts();
  const counted = getPlatformsWithCounts(allProds);

  assert.ok(counted.length > 0, 'Must return active platforms');
  const netflixEntry = counted.find((p) => p.id === 'netflix');
  assert.ok(netflixEntry, 'Netflix must be an active platform');
  assert.ok(netflixEntry!.count > 0, 'Netflix count must be > 0');
});

test('Platform Categorization: sendPlatformsMenu generates clean 2-column buttons without emojis', async () => {
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
    from: { id: 12345, first_name: 'Dappa' },
    reply: async () => {},
  } as unknown as Context;

  await sendPlatformsMenu(mockCtx, botInstance);

  assert.ok(sentText.includes('KATALOG PRODUK BERDASARKAN PLATFORM'), 'Must show platform header');
  assert.ok(Array.isArray(sentMarkup.inline_keyboard), 'Must contain inline_keyboard');

  // Verify platform buttons exist
  const allButtonTexts = sentMarkup.inline_keyboard!.flat().map((b) => b.text);
  assert.ok(allButtonTexts.some((t) => t.includes('Netflix')), 'Must have Netflix button');
  assert.ok(allButtonTexts.some((t) => t.includes('Canva')), 'Must have Canva button');

  // Verify buttons have brand logo icons on the left
  const netflixBtn = allButtonTexts.find((t) => t.includes('Netflix'));
  assert.ok(netflixBtn && netflixBtn.startsWith('🔴'), 'Netflix button must have 🔴 icon on left');

  const canvaBtn = allButtonTexts.find((t) => t.includes('Canva'));
  assert.ok(canvaBtn && canvaBtn.startsWith('🎨'), 'Canva button must have 🎨 icon on left');
});

test('Platform Categorization: sendProductsMenu for Netflix shows only Netflix products', async () => {
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
    from: { id: 12345, first_name: 'Dappa' },
    reply: async () => {},
  } as unknown as Context;

  await sendProductsMenu(mockCtx, botInstance, 0, 'netflix');

  assert.ok(sentText.includes('NETFLIX'), 'Must show Netflix platform header');
  assert.ok(Array.isArray(sentMarkup.inline_keyboard));

  // Verify all products in buttons are Netflix products
  const productButtons = sentMarkup.inline_keyboard!.slice(0, -2).flat();
  for (const btn of productButtons) {
    assert.ok(
      btn.text.toLowerCase().includes('netflix'),
      `Product button "${btn.text}" must be a Netflix variant`
    );
  }

  // Verify navigation has "Pilih Platform Lain"
  const allTexts = sentMarkup.inline_keyboard!.flat().map((b) => b.text);
  assert.ok(allTexts.some((t) => t.includes('Pilih Platform Lain')));
});

test('Product Detail: handles supplier product IDs with underscores correctly', async () => {
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
    from: { id: 12345, first_name: 'Dappa' },
    reply: async () => {},
  } as unknown as Context;

  // Retrieve an actual Netflix product from supplier dynamically
  const allProds = await getSupplierProducts();
  const netflixProds = filterProductsByPlatform(allProds, 'netflix');
  const targetProd = netflixProds[0] || allProds[0];
  const netflixProdId = targetProd.id;
  await sendProductDetail(mockCtx, botInstance, netflixProdId, 'netflix');

  assert.ok(sentText.includes('DETAIL PRODUK'), 'Must show product detail header');
  assert.ok(sentText.includes('Netflix'), 'Must show Netflix product name');
  assert.ok(!sentText.includes('Produk Tidak Ditemukan'), 'Must not report product not found');

  const buyButton = sentMarkup.inline_keyboard?.flat().find((b) => b.callback_data?.startsWith('buy_'));
  assert.ok(buyButton, 'Must provide buy button');
  assert.strictEqual(buyButton?.callback_data, `buy_${netflixProdId}`);
});

test('Product Detail: registerMenuHandlers correctly parses colon-separated pdetail with underscores', async () => {
  const botInstance = new Bot('dummy_token') as ExtendedBot;
  let sentText = '';

  botInstance.sendMessage = async (_chatId, text) => {
    sentText = text || '';
    return {};
  };

  registerMenuHandlers(botInstance);

  const allProds = await getSupplierProducts();
  const netflixProds = filterProductsByPlatform(allProds, 'netflix');
  const targetProd = netflixProds[0] || allProds[0];
  const netflixProdId = targetProd.id;
  await botInstance.handleUpdate({
    update_id: 301,
    callback_query: {
      id: 'cb_test_netflix',
      from: { id: 12345, is_bot: false, first_name: 'Dappa' },
      chat_instance: 'ci_2',
      data: `pdetail:netflix:${netflixProdId}`,
      message: {
        message_id: 20,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 12345, type: 'private' },
      },
    },
  });

  assert.ok(sentText.includes('DETAIL PRODUK'), 'Must successfully open product detail');
  assert.ok(sentText.includes('Netflix'), 'Must display Netflix details');
});

test('Fallback Navigation: invalid product provides interactive restart buttons without typing /start', async () => {
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
    from: { id: 12345, first_name: 'Dappa' },
    reply: async () => {},
  } as unknown as Context;

  await sendProductDetail(mockCtx, botInstance, 'non_existent_product_xyz', 'all');

  assert.ok(sentText.includes('Produk Tidak Ditemukan'), 'Must notify user product is not found');
  const buttonTexts = sentMarkup.inline_keyboard?.flat().map((b) => b.text) || [];
  assert.ok(buttonTexts.some((t) => t.includes('Buka Katalog Produk')), 'Must offer restart button to catalog');
  assert.ok(buttonTexts.some((t) => t.includes('Menu Utama')), 'Must offer restart button to main menu');
});

test('Testing Products Filter: test and sandbox products are excluded from catalog and bot', async () => {
  const { isTestProduct, getAllEnrichedProducts } = await import('../lib/supplier');

  // Verify test product identification logic
  assert.strictEqual(isTestProduct({ id: 'loc_test1', name: 'Test Api product' }), true);
  assert.strictEqual(isTestProduct({ id: 'test_product', name: 'Dummy Item' }), true);
  assert.strictEqual(isTestProduct({ id: '123', name: 'Sandbox Netflix Account' }), true);
  assert.strictEqual(isTestProduct({ id: '123', name: 'Valid Netflix Account', description: 'Testing developer sandbox' }), true);
  assert.strictEqual(isTestProduct({ id: '6a2fda51035a6d898f2106fe', name: 'Capcut Pro 1 Month' }), false);
  assert.strictEqual(isTestProduct({ id: '6a2fe23a1c8697b163aedcbd', name: 'Microsoft Office 365' }), false);

  // Verify live supplier and enriched products contain NO test products
  const liveProducts = await getSupplierProducts();
  const testItemsInLive = liveProducts.filter((p) => isTestProduct(p));
  assert.strictEqual(testItemsInLive.length, 0, 'Supplier products list must contain no test products');

  const enriched = await getAllEnrichedProducts();
  const testItemsInEnriched = enriched.filter((p) => isTestProduct(p));
  assert.strictEqual(testItemsInEnriched.length, 0, 'Enriched catalogue must contain no test products');
});

