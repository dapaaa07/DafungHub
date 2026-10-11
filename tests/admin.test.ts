import assert from 'node:assert/strict';
import test from 'node:test';
import { Bot } from 'node-telegram-bot-api';
import { ExtendedBot, registerHandlers } from '../bot/handler';
import { getMainMenuInlineKeyboard } from '../bot/menu';
import { ADMIN_TELEGRAM_ID } from '../lib/pricing';

test('Owner Panel & Authorization: getMainMenuInlineKeyboard includes owner button only for owner', () => {
  const buyerKeyboard = getMainMenuInlineKeyboard(false);
  const ownerKeyboard = getMainMenuInlineKeyboard(true);

  // Buyer should not see Owner Panel button
  const hasBuyerAdminBtn = buyerKeyboard.inline_keyboard.some((row) =>
    row.some((btn) => btn.text.includes('Panel Owner'))
  );
  assert.strictEqual(hasBuyerAdminBtn, false, 'Buyer must not see Owner Panel button');

  // Owner must see Owner Panel button
  const hasOwnerAdminBtn = ownerKeyboard.inline_keyboard.some((row) =>
    row.some((btn) => btn.text.includes('Panel Owner'))
  );
  assert.strictEqual(hasOwnerAdminBtn, true, 'Owner must see Owner Panel button');
});

test('Owner Authorization: /admin command rejects non-admin users', async () => {
  const botInstance = new Bot('dummy_token') as ExtendedBot;
  let sentText = '';

  botInstance.sendMessage = async (_chatId, text) => {
    sentText = text || '';
    return {};
  };

  registerHandlers(botInstance);

  await botInstance.handleUpdate({
    update_id: 301,
    message: {
      message_id: 11,
      date: Math.floor(Date.now() / 1000),
      chat: { id: 123456, type: 'private' },
      from: { id: 123456, is_bot: false, first_name: 'RegularBuyer' },
      text: '/admin',
    },
  });

  assert.ok(sentText.includes('Akses Ditolak'), 'Non-admin user must be rejected with Akses Ditolak');
});

test('Owner Authorization: /admin command grants access to owner (7133868769)', async () => {
  const botInstance = new Bot('dummy_token') as ExtendedBot;
  let sentText = '';

  botInstance.sendMessage = async (_chatId, text) => {
    sentText = text || '';
    return {};
  };

  registerHandlers(botInstance);

  await botInstance.handleUpdate({
    update_id: 302,
    message: {
      message_id: 12,
      date: Math.floor(Date.now() / 1000),
      chat: { id: Number(ADMIN_TELEGRAM_ID), type: 'private' },
      from: { id: Number(ADMIN_TELEGRAM_ID), is_bot: false, first_name: 'Dappa' },
      text: '/admin',
    },
  });

  assert.ok(sentText.includes('PANEL OWNER'), 'Owner must be able to open Owner Panel');
  assert.ok(sentText.includes(ADMIN_TELEGRAM_ID), 'Owner panel displays admin telegram ID');
});

test('Owner Authorization: /kirim rejects non-admin users', async () => {
  const botInstance = new Bot('dummy_token') as ExtendedBot;
  let sentText = '';

  botInstance.sendMessage = async (_chatId, text) => {
    sentText = text || '';
    return {};
  };

  registerHandlers(botInstance);

  await botInstance.handleUpdate({
    update_id: 303,
    message: {
      message_id: 13,
      date: Math.floor(Date.now() / 1000),
      chat: { id: 999888, type: 'private' },
      from: { id: 999888, is_bot: false, first_name: 'Hacker' },
      text: '/kirim ORD-123 user:pass',
    },
  });

  assert.ok(sentText.includes('Akses Ditolak'), '/kirim must reject non-admin users');
});
