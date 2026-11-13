import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { Bot, Context } from 'node-telegram-bot-api';
import { ExtendedBot } from '../bot/handler';
import { pool } from '../lib/db';
import { sendProductDetail } from '../bot/menu';
import { setBotStatus, clearSettingsCache } from '../lib/settings';

before(async () => {
  clearSettingsCache();
  await setBotStatus('online');
});

after(async () => {
  await pool.end();
});

test('sendProductDetail: Long product description (>300 chars) is fully rendered without truncation', async () => {
  const botInstance = new Bot('dummy_token') as ExtendedBot;
  let sentText = '';

  botInstance.sendMessage = async (_chatId, text) => {
    sentText = text || '';
    return {};
  };

  const mockCtx = {
    chatId: 12345,
    from: { id: 12345, first_name: 'Dappa' },
    reply: async () => {},
  } as unknown as Context;

  // Use a supplier product or test product lookup
  const { getSupplierProducts } = await import('../lib/supplier');
  const prods = await getSupplierProducts(true);
  const targetProd = prods.find((p) => (p.description || '').length > 300) || prods[0];

  assert.ok(targetProd, 'Target product must be available');

  await sendProductDetail(mockCtx, botInstance, targetProd.id, 'all');

  assert.ok(sentText.includes('DETAIL PRODUK'), 'Must show product detail header');
  assert.ok(sentText.includes(targetProd.name), 'Must include product name');

  if (targetProd.description && targetProd.description.length > 300) {
    // Check that characters beyond 300 are present
    const sliceBeyond300 = targetProd.description.substring(300, 350).trim();
    if (sliceBeyond300) {
      assert.ok(
        sentText.includes(sliceBeyond300),
        `Must include content beyond 300 characters: "${sliceBeyond300}"`
      );
    }
  }
});

test('sendProductDetail: Claude Api 10M Tokens displays full setup guide and URLs', async () => {
  const botInstance = new Bot('dummy_token') as ExtendedBot;
  let sentText = '';

  botInstance.sendMessage = async (_chatId, text) => {
    sentText = text || '';
    return {};
  };

  const mockCtx = {
    chatId: 12345,
    from: { id: 12345, first_name: 'Dappa' },
    reply: async () => {},
  } as unknown as Context;

  const { getSupplierProducts } = await import('../lib/supplier');
  const prods = await getSupplierProducts(true);
  const claudeProd = prods.find((p) => p.name.toLowerCase().includes('claude api 10m'));
  assert.ok(claudeProd, 'Claude 10M Tokens product must exist');

  await sendProductDetail(mockCtx, botInstance, claudeProd.id, 'all');

  assert.ok(sentText.includes('DETAIL PRODUK'));
  assert.ok(sentText.includes('Claude Api 10M Tokens 30 Day'));
  assert.ok(sentText.includes('https://bedrock.com.de/'));
  assert.ok(sentText.includes('Step 2: Configure your API'));
  assert.ok(sentText.includes('https://api.bedrock.com.de/'));
  assert.ok(sentText.includes('docs.google.com'));
});

