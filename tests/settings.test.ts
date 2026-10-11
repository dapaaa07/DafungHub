import assert from 'node:assert/strict';
import test from 'node:test';
import { Bot } from 'node-telegram-bot-api';
import { registerHandlers, ExtendedBot } from '../bot/handler';
import { getBotStatus, setBotStatus, clearSettingsCache } from '../lib/settings';
import { ADMIN_TELEGRAM_ID } from '../lib/pricing';

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

test('Bot Settings: getBotStatus and setBotStatus toggle properly', async () => {
  clearSettingsCache();
  // Ensure reset to online
  await setBotStatus('online');
  const status1 = await getBotStatus();
  assert.equal(status1, 'online');

  // Change to maintenance
  await setBotStatus('maintenance');
  const status2 = await getBotStatus();
  assert.equal(status2, 'maintenance');

  // Restore to online
  await setBotStatus('online');
  const status3 = await getBotStatus();
  assert.equal(status3, 'online');
});

test('Maintenance Mode: regular user receives maintenance message on /start', async () => {
  const { testBot, getSentText } = createMockBot();

  // Set bot to maintenance
  await setBotStatus('maintenance');

  await testBot.handleUpdate({
    update_id: 201,
    message: {
      message_id: 1,
      date: Math.floor(Date.now() / 1000),
      chat: { id: 99999, type: 'private' },
      from: { id: 99999, is_bot: false, first_name: 'Buyer' },
      text: '/start',
    },
  });

  const sent = getSentText();
  assert.ok(
    sent.includes('MOHON MAAF, BOT SEDANG DALAM PEMELIHARAAN') || sent.includes('maintenance'),
    'Regular user must see maintenance notice'
  );
  assert.ok(
    !sent.includes('👑 Panel Owner'),
    'Regular user must not see owner panel'
  );

  // Restore
  await setBotStatus('online');
});

test('Maintenance Mode: admin user can bypass maintenance mode and access menu', async () => {
  const { testBot, getSentText } = createMockBot();

  // Set bot to maintenance
  await setBotStatus('maintenance');

  await testBot.handleUpdate({
    update_id: 202,
    message: {
      message_id: 2,
      date: Math.floor(Date.now() / 1000),
      chat: { id: Number(ADMIN_TELEGRAM_ID), type: 'private' },
      from: { id: Number(ADMIN_TELEGRAM_ID), is_bot: false, first_name: 'Owner' },
      text: '/start',
    },
  });

  const sent = getSentText();
  assert.ok(
    sent.includes('Hello') || sent.includes('Owner'),
    'Owner should be able to view main menu even during maintenance'
  );

  // Restore
  await setBotStatus('online');
});

test('Admin Panel: shows toggle button between Online and Maintenance', async () => {
  const { testBot, getSentText, getLastMarkup } = createMockBot();

  // 1. When online
  await setBotStatus('online');
  await testBot.handleUpdate({
    update_id: 203,
    callback_query: {
      id: 'cb_admin_1',
      from: { id: Number(ADMIN_TELEGRAM_ID), is_bot: false, first_name: 'Owner' },
      chat_instance: 'ci_1',
      message: { message_id: 10, date: Math.floor(Date.now() / 1000), chat: { id: Number(ADMIN_TELEGRAM_ID), type: 'private' } },
      data: 'admin_panel',
    },
  });

  let text = getSentText();
  let markup = getLastMarkup();
  assert.ok(text.includes('ONLINE'), 'Panel should show ONLINE status');
  const hasMaintenanceBtn = markup?.inline_keyboard?.some((row) =>
    row.some((btn) => btn.callback_data === 'admin_set_maintenance')
  );
  assert.ok(hasMaintenanceBtn, 'Panel should offer button to switch to MAINTENANCE');

  // 2. Switch to maintenance via callback
  await testBot.handleUpdate({
    update_id: 204,
    callback_query: {
      id: 'cb_admin_2',
      from: { id: Number(ADMIN_TELEGRAM_ID), is_bot: false, first_name: 'Owner' },
      chat_instance: 'ci_1',
      message: { message_id: 10, date: Math.floor(Date.now() / 1000), chat: { id: Number(ADMIN_TELEGRAM_ID), type: 'private' } },
      data: 'admin_set_maintenance',
    },
  });

  text = getSentText();
  markup = getLastMarkup();
  assert.ok(text.includes('MAINTENANCE'), 'Panel should show MAINTENANCE status');
  const hasOnlineBtn = markup?.inline_keyboard?.some((row) =>
    row.some((btn) => btn.callback_data === 'admin_set_online')
  );
  assert.ok(hasOnlineBtn, 'Panel should offer button to switch to ONLINE');

  // Restore to online
  await setBotStatus('online');
});

test('Callback Interceptor: non-admin callback queries blocked during maintenance', async () => {
  const { testBot, getSentText } = createMockBot();

  await setBotStatus('maintenance');

  await testBot.handleUpdate({
    update_id: 205,
    callback_query: {
      id: 'cb_buyer_1',
      from: { id: 88888, is_bot: false, first_name: 'Buyer' },
      chat_instance: 'ci_1',
      message: { message_id: 20, date: Math.floor(Date.now() / 1000), chat: { id: 88888, type: 'private' } },
      data: 'menu_products',
    },
  });

  const sent = getSentText();
  assert.ok(
    sent.includes('MOHON MAAF, BOT SEDANG DALAM PEMELIHARAAN'),
    'Buyer callback should be redirected to maintenance notice'
  );

  // Restore
  await setBotStatus('online');
});
