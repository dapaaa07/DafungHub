import assert from 'node:assert/strict';
import test from 'node:test';
import { bot, registerHandlers, ExtendedBot, initBot, handleWebhookUpdate } from '../bot/handler';
import { Bot } from 'node-telegram-bot-api';

interface MockSendPayload {
  chat_id: number | string;
  text: string;
}

function createMockBot(): { testBot: ExtendedBot; getSentText: () => string; getSentHistory: () => string[] } {
  const testBot = new Bot('dummy_token') as ExtendedBot;
  let lastText = '';
  const history: string[] = [];

  testBot.api.sendMessage = async (payload: unknown) => {
    const p = payload as MockSendPayload;
    lastText = p.text;
    history.push(p.text);
    return {} as never;
  };

  registerHandlers(testBot);
  return {
    testBot,
    getSentText: () => lastText,
    getSentHistory: () => history,
  };
}

test('Telegram Bot Instance: bot instance is defined and configured', () => {
  assert.ok(bot, 'Bot instance must be defined');
  assert.ok(typeof bot.command === 'function', 'bot.command must be a function');
  assert.ok(typeof bot.on === 'function', 'bot.on must be a function');
  assert.ok(typeof bot.handleUpdate === 'function', 'bot.handleUpdate must be a function');
  assert.ok(typeof bot.sendMessage === 'function', 'bot.sendMessage must be a function');
  assert.ok(typeof bot.sendPhoto === 'function', 'bot.sendPhoto must be a function');
});

test('Telegram Bot Handlers: responds to /start command', async () => {
  const { testBot, getSentText } = createMockBot();

  await testBot.handleUpdate({
    update_id: 101,
    message: {
      message_id: 1,
      date: Math.floor(Date.now() / 1000),
      chat: { id: 99999, type: 'private' },
      text: '/start',
    },
  });

  const sent = getSentText();
  assert.ok(sent.includes('DaFung Hub') || sent.includes('Hello'), 'Response should display menu or DaFung Hub');
});

test('Telegram Bot Handlers: responds to /help command', async () => {
  const { testBot, getSentText } = createMockBot();

  await testBot.handleUpdate({
    update_id: 102,
    message: {
      message_id: 2,
      date: Math.floor(Date.now() / 1000),
      chat: { id: 99999, type: 'private' },
      text: '/help',
    },
  });

  const sent = getSentText();
  assert.ok(sent.includes('Bantuan'), 'Response should mention Bantuan');
  assert.ok(sent.toLowerCase().includes('garansi'), 'Response should mention garansi');
});

test('Telegram Bot Handlers: responds to /status and /buy guidance', async () => {
  const { testBot, getSentHistory } = createMockBot();

  await testBot.handleUpdate({
    update_id: 103,
    message: {
      message_id: 3,
      date: Math.floor(Date.now() / 1000),
      chat: { id: 99999, type: 'private' },
      text: '/status',
    },
  });

  await testBot.handleUpdate({
    update_id: 104,
    message: {
      message_id: 4,
      date: Math.floor(Date.now() / 1000),
      chat: { id: 99999, type: 'private' },
      text: '/buy',
    },
  });

  const history = getSentHistory();
  assert.ok(history[0].includes('Cek Status Pesanan'));
  assert.ok(history[1].includes('Pembelian Produk'));
});

test('Telegram Bot Handlers: responds to basic non-command message', async () => {
  const { testBot, getSentText } = createMockBot();

  await testBot.handleUpdate({
    update_id: 105,
    message: {
      message_id: 5,
      date: Math.floor(Date.now() / 1000),
      chat: { id: 99999, type: 'private' },
      text: 'Halo min, produk ready?',
    },
  });

  assert.ok(
    getSentText().includes('Pesan diterima'),
    'Bot should acknowledge message and recommend /start'
  );
});

test('Telegram Bot Mode: initBot and handleWebhookUpdate execute without error', async () => {
  // Test webhook mode initialization
  await initBot({ mode: 'webhook' });

  // Test handleWebhookUpdate dispatch
  let updateProcessed = false;
  bot.api.sendMessage = async () => {
    updateProcessed = true;
    return {} as never;
  };

  await handleWebhookUpdate({
    update_id: 106,
    message: {
      message_id: 6,
      date: Math.floor(Date.now() / 1000),
      chat: { id: 11111, type: 'private' },
      text: '/help',
    },
  });

  assert.strictEqual(updateProcessed, true, 'handleWebhookUpdate should process the update');
});
