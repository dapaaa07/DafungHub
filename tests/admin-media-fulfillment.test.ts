import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { Bot } from 'node-telegram-bot-api';
import { ExtendedBot, registerHandlers } from '../bot/handler';
import { ADMIN_TELEGRAM_ID } from '../lib/pricing';
import {
  saveLastAdminMedia,
  getLastAdminMedia,
  clearLastAdminMedia,
  saveAdminFulfillDraft,
  getAdminFulfillDraft,
  clearAdminFulfillDraft,
} from '../lib/admin-media';
import {
  sendAdminFulfillChoice,
  sendAdminFulfillPreview,
  sendAdminBroadcastChoice,
  sendAdminBroadcastPreview,
  setAdminPendingBroadcastText,
  getAdminPendingBroadcastText,
  getAdminWaitingFulfillNotes,
  setAdminWaitingFulfillNotes,
} from '../bot/menu';
import { pool } from '../lib/db';

after(async () => {
  await pool.end();
});

test('Admin Media: saveLastAdminMedia and getLastAdminMedia cache and retrieve media', async () => {
  const adminId = '7133868769';
  await clearLastAdminMedia(adminId);

  const initial = await getLastAdminMedia(adminId);
  assert.strictEqual(initial, null, 'Initial last media should be null');

  await saveLastAdminMedia(adminId, {
    hasMedia: true,
    type: 'document',
    fileId: 'doc_file_12345',
    fileName: 'akun_claude_pro.txt',
    mimeType: 'text/plain',
    fromChatId: Number(adminId),
    messageId: 991,
    savedAt: Date.now(),
  });

  const retrieved = await getLastAdminMedia(adminId);
  assert.ok(retrieved, 'Retrieved media should exist');
  assert.strictEqual(retrieved?.fileId, 'doc_file_12345');
  assert.strictEqual(retrieved?.fileName, 'akun_claude_pro.txt');
  assert.strictEqual(retrieved?.type, 'document');

  await clearLastAdminMedia(adminId);
  const cleared = await getLastAdminMedia(adminId);
  assert.strictEqual(cleared, null, 'Cleared media should be null');
});

test('Admin Media: saveAdminFulfillDraft stores and retrieves fulfill draft', async () => {
  const adminId = '7133868769';
  await clearAdminFulfillDraft(adminId);

  await saveAdminFulfillDraft(adminId, {
    orderCode: 'ORD-TEST-999',
    notes: 'email@test.com:pass123',
    withMedia: true,
  });

  const draft = await getAdminFulfillDraft(adminId);
  assert.ok(draft, 'Draft should exist');
  assert.strictEqual(draft?.orderCode, 'ORD-TEST-999');
  assert.strictEqual(draft?.notes, 'email@test.com:pass123');
  assert.strictEqual(draft?.withMedia, true);

  await clearAdminFulfillDraft(adminId);
});

test('Admin Chat: standalone media sent by admin is automatically saved with confirmation', async () => {
  const botInstance = new Bot('dummy_token') as ExtendedBot;
  let sentText = '';
  let sentReplyMarkup: any = null;

  botInstance.sendMessage = async (_chatId, text, options) => {
    sentText = text || '';
    sentReplyMarkup = options?.reply_markup;
    return { message_id: 888 };
  };

  registerHandlers(botInstance);

  await botInstance.handleUpdate({
    update_id: 501,
    message: {
      message_id: 44,
      date: Math.floor(Date.now() / 1000),
      chat: { id: Number(ADMIN_TELEGRAM_ID), type: 'private' },
      from: { id: Number(ADMIN_TELEGRAM_ID), is_bot: false, first_name: 'Owner' },
      document: {
        file_id: 'file_netflix_txt',
        file_name: 'netflix_premium.txt',
        mime_type: 'text/plain',
      },
    },
  });

  assert.ok(
    sentText.includes('MEDIA BERHASIL DITERIMA &amp; DISIMPAN') || sentText.includes('MEDIA BERHASIL DITERIMA & DISIMPAN'),
    'Bot should confirm media storage to admin'
  );
  assert.ok(sentText.includes('netflix_premium.txt'), 'Confirmation must display the file name');

  const lastMedia = await getLastAdminMedia(ADMIN_TELEGRAM_ID);
  assert.ok(lastMedia, 'Last admin media must be persisted');
  assert.strictEqual(lastMedia?.fileName, 'netflix_premium.txt');
});

test('Admin Broadcast: sendAdminBroadcastChoice presents choice between With Media and Without Media', async () => {
  const botInstance = new Bot('dummy_token') as ExtendedBot;
  let sentText = '';
  let sentButtons: any[] = [];

  botInstance.sendMessage = async (_chatId, text, options: any) => {
    sentText = text || '';
    sentButtons = options?.reply_markup?.inline_keyboard || [];
    return { message_id: 889 };
  };

  // Ensure last media is present
  await saveLastAdminMedia(ADMIN_TELEGRAM_ID, {
    hasMedia: true,
    type: 'document',
    fileId: 'promo_doc_77',
    fileName: 'pricelist.pdf',
    mimeType: 'application/pdf',
    fromChatId: Number(ADMIN_TELEGRAM_ID),
    messageId: 101,
    savedAt: Date.now(),
  });

  const ctx = {
    chatId: Number(ADMIN_TELEGRAM_ID),
    from: { id: Number(ADMIN_TELEGRAM_ID) },
  };

  await sendAdminBroadcastChoice(ctx as any, botInstance, '🔥 Promo Flash Sale Malam Ini!');

  assert.ok(sentText.includes('PILIH FORMAT PESAN SIARAN'), 'Should display broadcast format choice screen');
  assert.ok(sentText.includes('pricelist.pdf'), 'Should show detected last media');

  // Verify inline buttons
  const hasWithMediaBtn = sentButtons.some((row) =>
    row.some((b: any) => b.callback_data === 'admin_bc_choose_with_media')
  );
  const hasWithoutMediaBtn = sentButtons.some((row) =>
    row.some((b: any) => b.callback_data === 'admin_bc_choose_nomedia')
  );

  assert.strictEqual(hasWithMediaBtn, true, 'Must have button to broadcast with media');
  assert.strictEqual(hasWithoutMediaBtn, true, 'Must have button to broadcast without media (text only)');
});
