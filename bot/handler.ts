import { Bot, Context } from 'node-telegram-bot-api';
import { registerBuyHandler } from './commands/buy';
import { sendMainMenu, sendMaintenanceMessage, registerMenuHandlers } from './menu';
import { getBotStatus } from '../lib/settings';
import { isAdmin } from '../lib/pricing';

// Auto-load .env for standalone scripts / bot runners outside Next.js runtime
if (!process.env.TELEGRAM_BOT_TOKEN) {
  try {
    process.loadEnvFile?.();
  } catch {
    // Ignore error if .env does not exist
  }
}

export interface ExtendedBot extends Bot {
  sendMessage: (
    chatId: number | string | Record<string, unknown>,
    text?: string,
    options?: Record<string, unknown>
  ) => Promise<unknown>;
  sendPhoto: (
    chatId: number | string | Record<string, unknown>,
    photo?: unknown,
    options?: Record<string, unknown>
  ) => Promise<unknown>;
  onText: (
    regex: RegExp,
    callback: (msg: unknown, match: RegExpExecArray | null) => void
  ) => void;
}

// Global declaration for Next.js hot-reload development singleton
declare global {
  var telegramBotGlobal: ExtendedBot | undefined;
}

/**
 * Active bot messages tracking per chat to enforce strictly 1 bot message
 */
const activeBotMessages = new Map<string, Set<number>>();

export function recordBotMessage(chatId: string | number, messageId: number): void {
  const key = String(chatId);
  if (!activeBotMessages.has(key)) {
    activeBotMessages.set(key, new Set());
  }
  activeBotMessages.get(key)!.add(messageId);
}

export async function clearPreviousBotMessages(
  chatId: string | number,
  botInstance: ExtendedBot,
  excludeMessageId?: number
): Promise<void> {
  const key = String(chatId);
  const msgSet = activeBotMessages.get(key);
  if (!msgSet || msgSet.size === 0) return;

  const idsToDelete = Array.from(msgSet).filter((id) => id !== excludeMessageId);
  for (const msgId of idsToDelete) {
    try {
      if (typeof botInstance?.api?.deleteMessage === 'function') {
        await botInstance.api.deleteMessage({ chat_id: chatId, message_id: msgId });
      }
    } catch {
      // Message may already have been deleted or invalid in test mocks
    }
    msgSet.delete(msgId);
  }
}

export async function cleanupChatMessages(
  ctx: Context,
  botInstance: ExtendedBot,
  keepNewMessageId?: number
): Promise<void> {
  const chatId = ctx.chatId || ctx.callbackQuery?.message?.chat?.id || ctx.message?.chat?.id || ctx.from?.id;
  if (!chatId) return;

  // 1. Delete user incoming message if any (e.g. /start or text commands)
  if (ctx.message?.message_id) {
    try {
      if (typeof botInstance?.api?.deleteMessage === 'function') {
        await botInstance.api.deleteMessage({
          chat_id: chatId,
          message_id: ctx.message.message_id,
        });
      }
    } catch {
      // Ignore if cannot delete user message
    }
  }

  // 2. Add callback_query message to tracking if present so it gets cleared
  if (ctx.callbackQuery?.message?.message_id) {
    recordBotMessage(chatId, ctx.callbackQuery.message.message_id);
  }

  // 3. Delete all previous bot messages except keepNewMessageId
  await clearPreviousBotMessages(chatId, botInstance, keepNewMessageId);
}

/**
 * Universal safe message dispatcher that works across real Telegram bots,
 * polling contexts, callback queries, and unit test mocks.
 * Automatically cleans up previous messages so only 1 bot message remains.
 */
export async function sendSafeMessage(
  ctx: Context,
  botInstance: ExtendedBot,
  text: string,
  options?: Record<string, unknown>
): Promise<unknown> {
  const chatId = ctx.chatId || ctx.callbackQuery?.message?.chat?.id || ctx.message?.chat?.id || ctx.from?.id;

  let sentResult: unknown;

  if (typeof botInstance?.sendMessage === 'function' && chatId) {
    try {
      sentResult = await botInstance.sendMessage(chatId, text, options);
    } catch {
      // Fallback to api or reply
    }
  }

  if (!sentResult && typeof botInstance?.api?.sendMessage === 'function' && chatId) {
    try {
      sentResult = await botInstance.api.sendMessage({
        chat_id: chatId,
        text,
        ...(options || {}),
      } as Parameters<typeof botInstance.api.sendMessage>[0]);
    } catch {
      // Fallback to reply
    }
  }

  if (!sentResult && typeof ctx?.reply === 'function') {
    try {
      sentResult = await ctx.reply(text, options as Parameters<typeof ctx.reply>[1]);
    } catch {
      // Ignore
    }
  }

  // Auto-cleanup: remove previous messages so strictly 1 bot message remains
  if (chatId) {
    const newMsgId = (sentResult as { message_id?: number })?.message_id;
    if (newMsgId) {
      recordBotMessage(chatId, newMsgId);
    }
    await cleanupChatMessages(ctx, botInstance, newMsgId);
  }

  return sentResult;
}

/**
 * Universal safe photo dispatcher.
 * Automatically cleans up previous messages so only 1 bot message remains.
 */
export async function sendSafePhoto(
  ctx: Context,
  botInstance: ExtendedBot,
  photo: unknown,
  options?: Record<string, unknown>
): Promise<unknown> {
  const chatId = ctx.chatId || ctx.callbackQuery?.message?.chat?.id || ctx.message?.chat?.id || ctx.from?.id;

  let sentResult: unknown;

  if (typeof botInstance?.sendPhoto === 'function' && chatId) {
    try {
      sentResult = await botInstance.sendPhoto(chatId, photo, options);
    } catch {
      // Fallback
    }
  }

  if (!sentResult && typeof botInstance?.api?.sendPhoto === 'function' && chatId) {
    try {
      sentResult = await botInstance.api.sendPhoto({
        chat_id: chatId,
        photo,
        ...(options || {}),
      } as Parameters<typeof botInstance.api.sendPhoto>[0]);
    } catch {
      // Fallback
    }
  }

  // Direct HTTP Telegram API fallback for image URLs (essential for serverless Vercel runtime)
  if (!sentResult && typeof photo === 'string' && chatId && process.env.TELEGRAM_BOT_TOKEN) {
    try {
      const resp = await fetch(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            photo,
            ...(options || {}),
          }),
        }
      );
      const data = await resp.json();
      if (data.ok && data.result) {
        sentResult = data.result;
      }
    } catch {
      // Fallback
    }
  }

  // Auto-cleanup: remove previous messages so strictly 1 bot message remains
  if (chatId) {
    const newMsgId = (sentResult as { message_id?: number })?.message_id;
    if (newMsgId) {
      recordBotMessage(chatId, newMsgId);
    }
    await cleanupChatMessages(ctx, botInstance, newMsgId);
  }

  return sentResult;
}

/**
 * Register all command handlers and default text responders to the bot instance
 */
export function registerHandlers(botInstance: ExtendedBot): void {
  // /start command (interactive menu panel)
  botInstance.command('start', async (ctx: Context) => {
    const status = await getBotStatus();
    if (status === 'maintenance' && !isAdmin(ctx.from?.id)) {
      await sendMaintenanceMessage(ctx, botInstance);
      return;
    }

    const { checkUserChannelMembership, sendChannelJoinPrompt } = await import('../lib/channel-gate');
    const isMember = await checkUserChannelMembership(ctx.from?.id, botInstance);
    if (!isMember) {
      await sendChannelJoinPrompt(ctx, botInstance);
      return;
    }

    await sendMainMenu(ctx, botInstance);
  });

  // /help command
  botInstance.command('help', async (ctx: Context) => {
    const status = await getBotStatus();
    if (status === 'maintenance' && !isAdmin(ctx.from?.id)) {
      await sendMaintenanceMessage(ctx, botInstance);
      return;
    }

    const helpMessage =
      'ℹ️ <b>Panduan Bantuan & Garansi DaFung Hub:</b>\n\n' +
      '1. Setelah pembayaran QRIS berhasil, kredensial akun akan dikirimkan otomatis.\n' +
      '2. Jika ada kendala pesanan, silakan sertakan kode order kamu.\n' +
      '3. Admin akan meninjau komplain dan memproses penggantian atau refund.';

    await sendSafeMessage(ctx, botInstance, helpMessage, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🛍️ Buka Katalog Produk', callback_data: 'menu_products' }],
          [{ text: '🔙 Menu Utama', callback_data: 'menu_main' }],
        ],
      },
    });
  });

  // /status command
  botInstance.command('status', async (ctx: Context) => {
    const status = await getBotStatus();
    if (status === 'maintenance' && !isAdmin(ctx.from?.id)) {
      await sendMaintenanceMessage(ctx, botInstance);
      return;
    }

    const { checkUserChannelMembership, sendChannelJoinPrompt } = await import('../lib/channel-gate');
    const isMember = await checkUserChannelMembership(ctx.from?.id, botInstance);
    if (!isMember) {
      await sendChannelJoinPrompt(ctx, botInstance);
      return;
    }

    const text = ctx.message?.text || '';
    const parts = text.trim().split(/\s+/);
    const orderCode = parts[1];

    if (orderCode) {
      const { sendOrderStatus } = await import('./menu');
      await sendOrderStatus(ctx, botInstance, orderCode);
      return;
    }

    const statusGuidance =
      '📦 <b>Cek Status Pesanan:</b>\n\n' +
      'Ketik <code>/status &lt;order_code&gt;</code> untuk mengecek status pesanan kamu, atau sentuh tombol di bawah untuk melihat daftar pesanan kamu:';

    await sendSafeMessage(ctx, botInstance, statusGuidance, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📩 Cek Riwayat Pesanan', callback_data: 'menu_orders' }],
          [{ text: '🔙 Menu Utama', callback_data: 'menu_main' }],
        ],
      },
    });
  });

  // /buy command
  registerBuyHandler(botInstance);

  // Interactive Menu & Button Handlers
  registerMenuHandlers(botInstance);

  // Admin / Owner Commands (Secured to 7133868769)
  botInstance.command('admin', async (ctx: Context) => {
    const { isAdmin } = await import('../lib/pricing');
    if (!isAdmin(ctx.from?.id)) {
      await sendSafeMessage(
        ctx,
        botInstance,
        '⛔ <b>Akses Ditolak:</b> Perintah ini khusus untuk Owner / Admin DaFung Hub.',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: '🔙 Menu Utama', callback_data: 'menu_main' }]],
          },
        }
      );
      return;
    }
    const { sendAdminPanel } = await import('./menu');
    await sendAdminPanel(ctx, botInstance);
  });

  botInstance.command('kirim', async (ctx: Context) => {
    const { isAdmin } = await import('../lib/pricing');
    if (ctx.from?.id && !isAdmin(ctx.from?.id)) {
      await sendSafeMessage(
        ctx,
        botInstance,
        '⛔ <b>Akses Ditolak:</b> Perintah ini khusus untuk Owner / Admin DaFung Hub.',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: '🔙 Menu Utama', callback_data: 'menu_main' }]],
          },
        }
      );
      return;
    }

    const text = ctx.message?.text || '';
    const parts = text.trim().split(/\s+/);
    const orderCode = parts[1];
    const credentials = parts.slice(2).join(' ');

    if (!orderCode || !credentials) {
      await sendSafeMessage(
        ctx,
        botInstance,
        '⚡ Format pengiriman admin: <code>/kirim &lt;order_code&gt; &lt;username/akun&gt;</code>',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: '🔙 Panel Owner', callback_data: 'admin_panel' }]],
          },
        }
      );
      return;
    }

    const { adminManualFulfill } = await import('../lib/fulfillment');
    const result = await adminManualFulfill(orderCode, credentials, botInstance);
    await sendSafeMessage(ctx, botInstance, result.message, { parse_mode: 'HTML' });
  });

  botInstance.command('addstock', async (ctx: Context) => {
    await sendSafeMessage(
      ctx,
      botInstance,
      '📦 Format tambah stok: <code>/addstock &lt;product_id&gt; &lt;jumlah&gt;</code>',
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '🔙 Panel Owner', callback_data: 'admin_panel' }]],
        },
      }
    );
  });

  botInstance.command('editprice', async (ctx: Context) => {
    if (!isAdmin(ctx.from?.id)) {
      await sendSafeMessage(
        ctx,
        botInstance,
        '⛔ <b>Akses Ditolak:</b> Perintah ini hanya dapat dijalankan oleh Owner DaFung Hub.',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: '🔙 Menu Utama', callback_data: 'menu_main' }]],
          },
        }
      );
      return;
    }

    const text = ctx.message?.text || '';
    const parts = text.trim().split(/\s+/);
    const targetQuery = parts[1];
    const newPriceStr = parts[2];

    if (!targetQuery || !newPriceStr) {
      await sendSafeMessage(
        ctx,
        botInstance,
        '💰 <b>Format Ubah Harga Produk:</b>\n' +
        '<code>/editprice &lt;id_atau_nama&gt; &lt;harga_baru&gt;</code>\n\n' +
        'Contoh:\n' +
        '• <code>/editprice capcut 28000</code>\n' +
        '• <code>/editprice netflix 85000</code>\n' +
        '• <code>/editprice 6a2fda51035a6d898f2106fe 27000</code>\n\n' +
        '<i>Harga akan otomatis tersinkronisasi ke Bot dan Website secara real-time.</i>',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📋 Buka Daftar Harga Produk', callback_data: 'admin_prices' }],
              [{ text: '🔙 Panel Owner', callback_data: 'admin_panel' }],
            ],
          },
        }
      );
      return;
    }

    const newPrice = parseInt(newPriceStr.replace(/[^0-9]/g, ''), 10);
    if (isNaN(newPrice) || newPrice < 0) {
      await sendSafeMessage(
        ctx,
        botInstance,
        '❌ <b>Harga tidak valid:</b> Harap masukkan angka nominal rupiah yang benar (misal: <code>28000</code>).',
        { parse_mode: 'HTML' }
      );
      return;
    }

    try {
      const { getSupplierProducts } = await import('../lib/supplier');
      const { setCustomPrice } = await import('../lib/custom-prices');
      const products = await getSupplierProducts().catch(() => []);

      const q = targetQuery.toLowerCase();
      // 1. Match by exact ID
      let matched = products.find((p) => p.id.toLowerCase() === q);

      // 2. Match by exact name
      if (!matched) {
        matched = products.find((p) => p.name.toLowerCase() === q);
      }

      // 3. Match by keyword (e.g. 'capcut', 'netflix', 'canva')
      if (!matched) {
        const matches = products.filter((p) => p.name.toLowerCase().includes(q));
        if (matches.length > 0) {
          matched = matches[0];
        }
      }

      if (!matched) {
        await sendSafeMessage(
          ctx,
          botInstance,
          `❌ Produk dengan ID atau nama "<b>${targetQuery}</b>" tidak ditemukan di katalog.`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📋 Cek ID di Daftar Harga', callback_data: 'admin_prices' }],
                [{ text: '🔙 Panel Owner', callback_data: 'admin_panel' }],
              ],
            },
          }
        );
        return;
      }

      await setCustomPrice(matched.id, newPrice, matched.name);
      const profit = newPrice - matched.price_idr;

      const successText =
        `✅ <b>HARGA BERHASIL DIUBAH!</b>\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `📦 <b>Produk:</b> ${matched.name}\n` +
        `🆔 <b>ID:</b> <code>${matched.id}</code>\n` +
        `💰 <b>Harga Baru:</b> <b>Rp ${newPrice.toLocaleString('id-ID')}</b>\n` +
        `📦 <b>Modal Supplier:</b> Rp ${matched.price_idr.toLocaleString('id-ID')}\n` +
        `📈 <b>Margin Laba:</b> <b>+Rp ${profit.toLocaleString('id-ID')}</b>\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `⚡ <i>Tersinkronisasi otomatis ke Bot Telegram & Website secara Real-Time!</i>`;

      await sendSafeMessage(ctx, botInstance, successText, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📋 Lihat di Daftar Harga', callback_data: 'admin_prices' }],
            [{ text: '🛍️ Cek Tampilan Katalog', callback_data: 'plat_all' }],
            [{ text: '🔙 Panel Owner', callback_data: 'admin_panel' }],
          ],
        },
      });
    } catch (err) {
      console.error('[Admin] Error executing /editprice:', err);
      await sendSafeMessage(ctx, botInstance, '⚠️ Gagal mengubah harga produk. Silakan coba kembali.');
    }
  });

  botInstance.command('resetprice', async (ctx: Context) => {
    if (!isAdmin(ctx.from?.id)) {
      await sendSafeMessage(
        ctx,
        botInstance,
        '⛔ <b>Akses Ditolak:</b> Khusus Owner DaFung Hub.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    const text = ctx.message?.text || '';
    const parts = text.trim().split(/\s+/);
    const targetQuery = parts[1];

    if (!targetQuery) {
      await sendSafeMessage(
        ctx,
        botInstance,
        '🔄 Format reset harga: <code>/resetprice &lt;id_atau_nama&gt;</code>\nContoh: <code>/resetprice capcut</code>',
        { parse_mode: 'HTML' }
      );
      return;
    }

    try {
      const { getSupplierProducts } = await import('../lib/supplier');
      const { deleteCustomPrice } = await import('../lib/custom-prices');
      const { calculateSellingPrice } = await import('../lib/pricing');
      const products = await getSupplierProducts().catch(() => []);

      const q = targetQuery.toLowerCase();
      let matched = products.find((p) => p.id.toLowerCase() === q);
      if (!matched) {
        const matches = products.filter((p) => p.name.toLowerCase().includes(q));
        if (matches.length > 0) matched = matches[0];
      }

      if (!matched) {
        await sendSafeMessage(
          ctx,
          botInstance,
          `❌ Produk "<b>${targetQuery}</b>" tidak ditemukan.`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      await deleteCustomPrice(matched.id);
      const defaultPrice = calculateSellingPrice(matched.price_idr);

      await sendSafeMessage(
        ctx,
        botInstance,
        `🔄 <b>HARGA DIRESET KE FORMULA STANDAR</b>\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `📦 <b>Produk:</b> ${matched.name}\n` +
        `💰 <b>Harga Normal:</b> <b>Rp ${defaultPrice.toLocaleString('id-ID')}</b>\n` +
        `⚡ <i>Sinkronisasi real-time berhasil diperbarui.</i>`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📋 Buka Daftar Harga', callback_data: 'admin_prices' }],
              [{ text: '🔙 Panel Owner', callback_data: 'admin_panel' }],
            ],
          },
        }
      );
    } catch (err) {
      console.error('[Admin] Error executing /resetprice:', err);
      await sendSafeMessage(ctx, botInstance, '⚠️ Gagal mereset harga produk.');
    }
  });

  const handleBroadcastCommand = async (ctx: Context) => {
    if (!isAdmin(ctx.from?.id)) {
      await sendSafeMessage(
        ctx,
        botInstance,
        '⛔ <b>Akses Ditolak:</b> Perintah broadcast khusus untuk Owner / Admin DaFung Hub.',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: '🔙 Menu Utama', callback_data: 'menu_main' }]],
          },
        }
      );
      return;
    }

    const text = ctx.message?.text || '';
    const parts = text.trim().split(/\s+/);
    const broadcastBody = parts.slice(1).join(' ').trim();

    if (!broadcastBody) {
      const { sendAdminBroadcastMenu } = await import('./menu');
      await sendAdminBroadcastMenu(ctx, botInstance);
      return;
    }

    const { sendAdminBroadcastPreview } = await import('./menu');
    await sendAdminBroadcastPreview(ctx, botInstance, broadcastBody);
  };

  botInstance.command('broadcast', handleBroadcastCommand);
  botInstance.command('bc', handleBroadcastCommand);

  // Fallback for general non-command text messages (interactive panel, no typing required)
  botInstance.on('message', async (ctx: Context) => {
    const text = ctx.message?.text?.trim();

    // Check if admin is currently in waiting_broadcast_text state
    const chatId = ctx.chatId || ctx.message?.chat?.id || ctx.from?.id;
    if (chatId && text && isAdmin(ctx.from?.id)) {
      const { getAdminWaitingBroadcast, clearAdminBroadcastState, sendAdminBroadcastPreview, sendAdminBroadcastMenu } = await import('./menu');
      if (getAdminWaitingBroadcast(chatId)) {
        clearAdminBroadcastState(chatId);
        if (text === '/cancel' || text.toLowerCase() === 'batal') {
          await sendAdminBroadcastMenu(ctx, botInstance);
          return;
        }
        await sendAdminBroadcastPreview(ctx, botInstance, text);
        return;
      }
    }

    // Ignore commands as they are handled by command handlers
    if (text && text.startsWith('/')) {
      return;
    }

    if (text) {
      const status = await getBotStatus();
      if (status === 'maintenance' && !isAdmin(ctx.from?.id)) {
        await sendMaintenanceMessage(ctx, botInstance);
        return;
      }

      const { checkUserChannelMembership, sendChannelJoinPrompt } = await import('../lib/channel-gate');
      const isMember = await checkUserChannelMembership(ctx.from?.id, botInstance);
      if (!isMember) {
        await sendChannelJoinPrompt(ctx, botInstance);
        return;
      }

      await sendSafeMessage(
        ctx,
        botInstance,
        'Pesan diterima. Untuk melihat katalog produk atau mengakses menu DaFung Hub, silakan sentuh tombol di bawah:',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🛍️ Buka Katalog Produk', callback_data: 'menu_products' }],
              [{ text: '🔙 Mulai Ulang / Menu Utama', callback_data: 'menu_main' }],
            ],
          },
        }
      );
    }
  });
}

function createBotInstance(): ExtendedBot {
  const token = process.env.TELEGRAM_BOT_TOKEN || 'dummy_token_for_build';
  const instance = new Bot(token) as ExtendedBot;

  // Convenience proxy methods for compatibility
  instance.sendMessage = (
    chatId: number | string | Record<string, unknown>,
    text?: string,
    options?: Record<string, unknown>
  ) => {
    if (typeof chatId === 'object') {
      return instance.api.sendMessage(chatId as Parameters<typeof instance.api.sendMessage>[0]);
    }
    return instance.api.sendMessage({
      chat_id: chatId,
      text: text || '',
      ...(options || {}),
    } as Parameters<typeof instance.api.sendMessage>[0]);
  };

  instance.sendPhoto = (
    chatId: number | string | Record<string, unknown>,
    photo?: unknown,
    options?: Record<string, unknown>
  ) => {
    if (typeof chatId === 'object') {
      return instance.api.sendPhoto(chatId as Parameters<typeof instance.api.sendPhoto>[0]);
    }
    return instance.api.sendPhoto({
      chat_id: chatId,
      photo,
      ...(options || {}),
    } as Parameters<typeof instance.api.sendPhoto>[0]);
  };

  instance.onText = (regex: RegExp, callback) => {
    instance.on('message', (ctx: Context) => {
      const text = ctx.message?.text;
      if (text) {
        const match = regex.exec(text);
        if (match) {
          callback(ctx.message, match);
        }
      }
    });
  };

  instance.catch((err, ctx) => {
    console.error(`[Telegram Bot Error] Update ${ctx?.update?.update_id}:`, err);
  });

  registerHandlers(instance);
  return instance;
}

export const bot: ExtendedBot = globalThis.telegramBotGlobal ?? createBotInstance();

if (process.env.NODE_ENV !== 'production') {
  globalThis.telegramBotGlobal = bot;
}

/**
 * Initialize bot based on environment (Polling mode in development, Webhook mode in production)
 */
export async function initBot(options?: { mode?: 'polling' | 'webhook' }): Promise<void> {
  const mode =
    options?.mode ||
    process.env.TELEGRAM_BOT_MODE ||
    (process.env.NODE_ENV === 'production' ? 'webhook' : 'polling');

  if (mode === 'polling') {
    if (!bot.isRunning()) {
      console.log('[Telegram Bot] Starting polling mode...');
      bot.startPolling();
    }
  } else {
    console.log('[Telegram Bot] Configured in webhook mode.');
  }
}

/**
 * Process a webhook update payload from Telegram
 */
export async function handleWebhookUpdate(update: unknown): Promise<void> {
  await bot.handleUpdate(update as Parameters<typeof bot.handleUpdate>[0]);
}

export default bot;
