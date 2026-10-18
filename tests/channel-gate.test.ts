import assert from 'node:assert/strict';
import test from 'node:test';
import { Bot } from 'node-telegram-bot-api';
import { registerHandlers, ExtendedBot } from '../bot/handler';
import {
  isForceChannelJoinEnabled,
  setForceChannelJoinEnabled,
  clearChannelGateCache,
  clearMembershipCache,
  checkUserChannelMembership,
  sendChannelJoinPrompt,
} from '../lib/channel-gate';
import { ADMIN_TELEGRAM_ID } from '../lib/pricing';

interface MockSendPayload {
  chat_id: number | string;
  text?: string;
  caption?: string;
  reply_markup?: {
    inline_keyboard?: Array<Array<{ text: string; callback_data?: string; url?: string }>>;
  };
}

function createMockBot(): {
  testBot: ExtendedBot;
  getSentText: () => string;
  getLastMarkup: () => MockSendPayload['reply_markup'];
  setMockMembership: (userId: number, status: string, isMember?: boolean) => void;
  getLastAlert: () => string;
} {
  const testBot = new Bot('dummy_token_for_tests') as ExtendedBot;
  let lastText = '';
  let lastMarkup: MockSendPayload['reply_markup'];
  let lastAlert = '';
  const memberStatuses = new Map<number, { status: string; is_member?: boolean }>();

  testBot.api.sendMessage = async (payload: unknown) => {
    const p = payload as MockSendPayload;
    lastText = p.text || '';
    lastMarkup = p.reply_markup;
    return { message_id: 101 } as never;
  };

  testBot.api.sendPhoto = async (payload: unknown) => {
    const p = payload as MockSendPayload;
    lastText = p.caption || '';
    lastMarkup = p.reply_markup;
    return { message_id: 102 } as never;
  };

  testBot.api.deleteMessage = async () => true as never;
  testBot.api.answerCallbackQuery = async (params: unknown) => {
    const p = params as { text?: string };
    if (p?.text) lastAlert = p.text;
    return true as never;
  };

  (testBot.api as unknown as { getChatMember: Function }).getChatMember = async (
    _chatId: string,
    userId: number
  ) => {
    const entry = memberStatuses.get(Number(userId));
    if (!entry) {
      const err = new Error('Bad Request: PARTICIPANT_ID_INVALID') as Error & { description: string };
      err.description = 'Bad Request: PARTICIPANT_ID_INVALID';
      throw err;
    }
    return {
      status: entry.status,
      is_member: entry.is_member,
    };
  };

  registerHandlers(testBot);
  return {
    testBot,
    getSentText: () => lastText,
    getLastMarkup: () => lastMarkup,
    setMockMembership: (userId: number, status: string, isMember = true) => {
      memberStatuses.set(Number(userId), { status, is_member: isMember });
    },
    getLastAlert: () => lastAlert,
  };
}

test('Channel Gate: Toggle force_channel_join setting', async () => {
  clearChannelGateCache();
  await setForceChannelJoinEnabled(true);
  let enabled = await isForceChannelJoinEnabled();
  assert.equal(enabled, true);

  await setForceChannelJoinEnabled(false);
  enabled = await isForceChannelJoinEnabled();
  assert.equal(enabled, false);

  // Restore to true
  await setForceChannelJoinEnabled(true);
  enabled = await isForceChannelJoinEnabled();
  assert.equal(enabled, true);
});

test('Channel Gate: Owner/Admin is always exempt', async () => {
  clearChannelGateCache();
  clearMembershipCache();
  await setForceChannelJoinEnabled(true);

  const { testBot } = createMockBot();
  const isOwnerMember = await checkUserChannelMembership(ADMIN_TELEGRAM_ID, testBot);
  assert.equal(isOwnerMember, true);
});

test('Channel Gate: Gate disabled allows all users', async () => {
  clearChannelGateCache();
  clearMembershipCache();
  await setForceChannelJoinEnabled(false);

  const { testBot } = createMockBot();
  const regularUser = 99999999;
  const isMember = await checkUserChannelMembership(regularUser, testBot);
  assert.equal(isMember, true);

  // Re-enable gate for further tests
  await setForceChannelJoinEnabled(true);
});

test('Channel Gate: Verifies member vs non-member accurately', async () => {
  clearChannelGateCache();
  clearMembershipCache();
  await setForceChannelJoinEnabled(true);

  const { testBot, setMockMembership } = createMockBot();
  const joinedUser = 111111;
  const nonJoinedUser = 222222;
  const leftUser = 333333;

  setMockMembership(joinedUser, 'member');
  setMockMembership(leftUser, 'left');

  const resJoined = await checkUserChannelMembership(joinedUser, testBot);
  assert.equal(resJoined, true);

  const resLeft = await checkUserChannelMembership(leftUser, testBot);
  assert.equal(resLeft, false);

  const resNonJoined = await checkUserChannelMembership(nonJoinedUser, testBot);
  assert.equal(resNonJoined, false);
});

test('Channel Gate: sendChannelJoinPrompt generates valid Telegram prompt & buttons', async () => {
  const { testBot, getSentText, getLastMarkup } = createMockBot();
  const mockCtx = {
    chatId: 123456,
    from: { id: 123456 },
  };

  await sendChannelJoinPrompt(mockCtx as never, testBot);
  const text = getSentText();
  const markup = getLastMarkup();

  assert.match(text, /VERIFIKASI ANGGOTA CHANNEL DIPERLUKAN/);
  assert.match(text, /@DafungHub/);

  const buttons = markup?.inline_keyboard || [];
  assert.equal(buttons.length, 2);
  assert.match(buttons[0][0].text, /Gabung Channel/);
  assert.match(buttons[0][0].url || '', /t\.me\/DafungHub/);
  assert.equal(buttons[1][0].callback_data, 'verify_channel_join');
});

test('Channel Gate: Non-member executing /start is prompted to join channel', async () => {
  clearChannelGateCache();
  clearMembershipCache();
  await setForceChannelJoinEnabled(true);

  const { testBot, getSentText, getLastMarkup } = createMockBot();
  const nonMemberUser = 444444;

  await testBot.handleUpdate({
    update_id: 1,
    message: {
      message_id: 10,
      chat: { id: nonMemberUser, type: 'private' },
      from: { id: nonMemberUser, is_bot: false, first_name: 'Buyer' },
      text: '/start',
      date: Math.floor(Date.now() / 1000),
    },
  });

  const text = getSentText();
  const markup = getLastMarkup();

  assert.match(text, /VERIFIKASI ANGGOTA CHANNEL DIPERLUKAN/);
  assert.equal(markup?.inline_keyboard?.[1]?.[0]?.callback_data, 'verify_channel_join');
});

test('Channel Gate: Member executing /start receives Main Menu', async () => {
  clearChannelGateCache();
  clearMembershipCache();
  await setForceChannelJoinEnabled(true);

  const { testBot, setMockMembership, getSentText } = createMockBot();
  const memberUser = 555555;
  setMockMembership(memberUser, 'member');

  await testBot.handleUpdate({
    update_id: 2,
    message: {
      message_id: 11,
      chat: { id: memberUser, type: 'private' },
      from: { id: memberUser, is_bot: false, first_name: 'Alice' },
      text: '/start',
      date: Math.floor(Date.now() / 1000),
    },
  });

  const text = getSentText();
  assert.match(text, /Hello, Alice/);
});

test('Channel Gate: verify_channel_join callback unlocks menu once user joins', async () => {
  clearChannelGateCache();
  clearMembershipCache();
  await setForceChannelJoinEnabled(true);

  const { testBot, setMockMembership, getSentText, getLastAlert } = createMockBot();
  const buyerId = 666666;

  // 1. User clicks verify before joining -> blocked with warning
  await testBot.handleUpdate({
    update_id: 3,
    callback_query: {
      id: 'cb_1',
      chat_instance: 'ci_1',
      from: { id: buyerId, is_bot: false, first_name: 'Bob' },
      message: { message_id: 50, date: Math.floor(Date.now() / 1000), chat: { id: buyerId, type: 'private' } },
      data: 'verify_channel_join',
    },
  });

  assert.match(getLastAlert(), /Anda belum bergabung/);
  assert.match(getSentText(), /VERIFIKASI ANGGOTA CHANNEL DIPERLUKAN/);

  // 2. User joins channel and clicks verify again -> unlocked
  setMockMembership(buyerId, 'member');
  clearMembershipCache(buyerId);

  await testBot.handleUpdate({
    update_id: 4,
    callback_query: {
      id: 'cb_2',
      chat_instance: 'ci_2',
      from: { id: buyerId, is_bot: false, first_name: 'Bob' },
      message: { message_id: 51, date: Math.floor(Date.now() / 1000), chat: { id: buyerId, type: 'private' } },
      data: 'verify_channel_join',
    },
  });

  assert.match(getLastAlert(), /Keanggotaan terverifikasi/);
  assert.match(getSentText(), /Hello, Bob/);
});

test('Channel Gate: Admin can toggle force join gate from admin panel', async () => {
  clearChannelGateCache();
  clearMembershipCache();
  await setForceChannelJoinEnabled(true);

  const { testBot, getSentText, getLastMarkup } = createMockBot();
  const adminId = Number(ADMIN_TELEGRAM_ID);

  // Open admin panel
  await testBot.handleUpdate({
    update_id: 5,
    message: {
      message_id: 12,
      chat: { id: adminId, type: 'private' },
      from: { id: adminId, is_bot: false, first_name: 'Owner' },
      text: '/admin',
      date: Math.floor(Date.now() / 1000),
    },
  });

  let text = getSentText();
  assert.match(text, /PANEL OWNER & ADMIN/);
  assert.match(text, /Wajib Join Channel:.*AKTIF/);

  // Toggle force join off via callback
  await testBot.handleUpdate({
    update_id: 6,
    callback_query: {
      id: 'cb_3',
      chat_instance: 'ci_3',
      from: { id: adminId, is_bot: false, first_name: 'Owner' },
      message: { message_id: 52, date: Math.floor(Date.now() / 1000), chat: { id: adminId, type: 'private' } },
      data: 'admin_toggle_force_join',
    },
  });

  text = getSentText();
  assert.match(text, /Wajib Join Channel:.*NONAKTIF/);
  const isEnabled = await isForceChannelJoinEnabled();
  assert.equal(isEnabled, false);

  // Toggle back on
  await testBot.handleUpdate({
    update_id: 7,
    callback_query: {
      id: 'cb_4',
      chat_instance: 'ci_4',
      from: { id: adminId, is_bot: false, first_name: 'Owner' },
      message: { message_id: 53, date: Math.floor(Date.now() / 1000), chat: { id: adminId, type: 'private' } },
      data: 'admin_toggle_force_join',
    },
  });

  assert.equal(await isForceChannelJoinEnabled(), true);
});
