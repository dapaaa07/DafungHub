import { Bot, Context } from 'node-telegram-bot-api';
import { config, isBotAdmin } from '../../config/bot.config';
import { getBotStatus, setBotStatus } from '../core/settings';
import {
  sendMainMenu,
  sendPlatformsMenu,
  sendProductsMenu,
  sendProductDetail,
  sendAdminPanel,
  sendAdminPricesMenu,
  escapeHtml,
} from './menu';
import { handleBuy } from './commands/buy';
import { adminManualFulfill, adminRetrySupplierFulfill, processOrderPayment } from '../core/fulfillment';
import { query, Order } from '../core/db';
import { decrypt } from '../core/encrypt';
import { setCustomPrice, deleteCustomPrice } from '../core/custom-prices';

export interface ExtendedBot extends Bot {
  sendMessage: (chatId: number | string, text: string, options?: Record<string, unknown>) => Promise<unknown>;
  sendPhoto: (chatId: number | string, photo: unknown, options?: Record<string, unknown>) => Promise<unknown>;
  onText: (regex: RegExp, callback: (msg: unknown, match: RegExpExecArray | null) => void) => void;
}

export async function sendSafeMessage(
  ctx: Context,
  botInstance: ExtendedBot,
  text: string,
  options: Record<string, unknown> = {}
): Promise<unknown> {
  const chatId = ctx.chatId || ctx.callbackQuery?.message?.chat?.id || ctx.message?.chat?.id || ctx.from?.id;
  if (!chatId) return null;
  return await botInstance.sendMessage(chatId, text, options);
}

export function registerBotHandlers(botInstance: ExtendedBot): void {
  // Command: /start
  botInstance.onText(/\/start(?:\s+(.+))?/, async (msg: any, match: RegExpExecArray | null) => {
    const payload = match?.[1]?.trim();
    const mockCtx = {
      chatId: msg.chat.id,
      from: msg.from,
      message: msg,
    } as unknown as Context;

    const status = await getBotStatus();
    if (status === 'maintenance' && !isBotAdmin(msg.from?.id)) {
      await sendSafeMessage(
        mockCtx,
        botInstance,
        config.messages.maintenanceNotice,
        { parse_mode: 'HTML' }
      );
      return;
    }

    if (payload?.startsWith('buy_')) {
      const prodId = payload.replace('buy_', '');
      await handleBuy(mockCtx, prodId, botInstance);
      return;
    }

    await sendMainMenu(mockCtx, botInstance);
  });

  // Command: /admin
  botInstance.onText(/\/admin/, async (msg: any) => {
    const mockCtx = {
      chatId: msg.chat.id,
      from: msg.from,
      message: msg,
    } as unknown as Context;

    if (!isBotAdmin(msg.from?.id)) {
      await sendSafeMessage(mockCtx, botInstance, '⛔ <b>Akses Ditolak:</b> Anda bukan admin.', { parse_mode: 'HTML' });
      return;
    }

    await sendAdminPanel(mockCtx, botInstance);
  });

  // Command: /help
  botInstance.onText(/\/help/, async (msg: any) => {
    const mockCtx = { chatId: msg.chat.id, from: msg.from, message: msg } as unknown as Context;
    const text =
      `ℹ️ <b>BANTUAN & PANDUAN PENGGUNA</b>\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `• /start - Membuka menu utama toko\n` +
      `• /help - Menampilkan panduan ini\n` +
      `• /status &lt;kode_order&gt; - Mengecek status pesanan\n\n` +
      `📞 <b>Customer Support:</b>\n` +
      `WhatsApp: ${config.store.supportWhatsApp}`;
    await sendSafeMessage(mockCtx, botInstance, text, { parse_mode: 'HTML' });
  });

  // Command: /status <orderCode>
  botInstance.onText(/\/status(?:\s+(.+))?/, async (msg: any, match: RegExpExecArray | null) => {
    const orderCode = match?.[1]?.trim();
    const mockCtx = { chatId: msg.chat.id, from: msg.from, message: msg } as unknown as Context;

    if (!orderCode) {
      await sendSafeMessage(mockCtx, botInstance, 'Gunakan format: <code>/status &lt;kode_order&gt;</code>', { parse_mode: 'HTML' });
      return;
    }

    const res = await query<Order & { product_name: string }>(
      `SELECT o.*, p.name as product_name
       FROM orders o
       JOIN products p ON o.product_id = p.id
       WHERE o.order_code = $1 LIMIT 1`,
      [orderCode]
    );

    if (res.rows.length === 0) {
      await sendSafeMessage(mockCtx, botInstance, `❌ Order <code>${escapeHtml(orderCode)}</code> tidak ditemukan.`, { parse_mode: 'HTML' });
      return;
    }

    const order = res.rows[0];
    let keyInfo = '';
    if (order.fulfillment_status === 'delivered' && order.credential_encrypted) {
      const decrypted = decrypt(order.credential_encrypted);
      keyInfo = `\n\n🔑 <b>Kredensial Akun:</b>\n<code>${escapeHtml(decrypted)}</code>`;
    }

    const text =
      `📦 <b>STATUS PESANAN</b>\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `• <b>Kode Order:</b> <code>${escapeHtml(order.order_code)}</code>\n` +
      `• <b>Produk:</b> ${escapeHtml(order.product_name)}\n` +
      `• <b>Pembayaran:</b> <b>${order.payment_status.toUpperCase()}</b>\n` +
      `• <b>Pengiriman:</b> <b>${order.fulfillment_status.toUpperCase()}</b>` +
      keyInfo;

    await sendSafeMessage(mockCtx, botInstance, text, { parse_mode: 'HTML' });
  });

  // Command: /kirim <orderCode> <credential>
  botInstance.onText(/\/kirim(?:\s+(\S+))?(?:\s+([\s\S]+))?/, async (msg: any, match: RegExpExecArray | null) => {
    const mockCtx = { chatId: msg.chat.id, from: msg.from, message: msg } as unknown as Context;
    if (!isBotAdmin(msg.from?.id)) {
      await sendSafeMessage(mockCtx, botInstance, '⛔ Hanya admin yang dapat menggunakan perintah ini.', { parse_mode: 'HTML' });
      return;
    }

    const orderCode = match?.[1]?.trim();
    const credential = match?.[2]?.trim();

    if (!orderCode || !credential) {
      await sendSafeMessage(mockCtx, botInstance, 'Format: <code>/kirim &lt;kode_order&gt; &lt;kredensial&gt;</code>', { parse_mode: 'HTML' });
      return;
    }

    const res = await adminManualFulfill(orderCode, credential, botInstance);
    await sendSafeMessage(mockCtx, botInstance, res.message, { parse_mode: 'HTML' });
  });

  // Command: /editprice <id/query> <price>
  botInstance.onText(/\/editprice(?:\s+(\S+))?(?:\s+(\d+))?/, async (msg: any, match: RegExpExecArray | null) => {
    const mockCtx = { chatId: msg.chat.id, from: msg.from, message: msg } as unknown as Context;
    if (!isBotAdmin(msg.from?.id)) return;

    const targetId = match?.[1]?.trim();
    const priceStr = match?.[2]?.trim();

    if (!targetId || !priceStr) {
      await sendSafeMessage(mockCtx, botInstance, 'Format: <code>/editprice &lt;id_produk&gt; &lt;harga&gt;</code>', { parse_mode: 'HTML' });
      return;
    }

    const price = parseInt(priceStr, 10);
    await setCustomPrice(targetId, price);
    await sendSafeMessage(
      mockCtx,
      botInstance,
      `✅ Harga produk <code>${escapeHtml(targetId)}</code> berhasil diubah menjadi <b>Rp ${price.toLocaleString('id-ID')}</b>!`,
      { parse_mode: 'HTML' }
    );
  });

  // Command: /resetprice <id>
  botInstance.onText(/\/resetprice(?:\s+(\S+))?/, async (msg: any, match: RegExpExecArray | null) => {
    const mockCtx = { chatId: msg.chat.id, from: msg.from, message: msg } as unknown as Context;
    if (!isBotAdmin(msg.from?.id)) return;

    const targetId = match?.[1]?.trim();
    if (!targetId) {
      await sendSafeMessage(mockCtx, botInstance, 'Format: <code>/resetprice &lt;id_produk&gt;</code>', { parse_mode: 'HTML' });
      return;
    }

    await deleteCustomPrice(targetId);
    await sendSafeMessage(
      mockCtx,
      botInstance,
      `✅ Harga produk <code>${escapeHtml(targetId)}</code> berhasil direset kembali ke rumus auto-markup default!`,
      { parse_mode: 'HTML' }
    );
  });

  // Handle Callback Queries
  if (typeof (botInstance as any).on === 'function') {
    (botInstance as any).on('callback_query', async (queryObj: any) => {
      const data = queryObj.data;
      const ctx = {
        chatId: queryObj.message?.chat?.id,
        from: queryObj.from,
        callbackQuery: queryObj,
      } as unknown as Context;

      try {
        if (data === 'menu_main') {
          await sendMainMenu(ctx, botInstance);
        } else if (data === 'menu_products') {
          await sendPlatformsMenu(ctx, botInstance);
        } else if (data.startsWith('plat_')) {
          const platId = data.replace('plat_', '');
          await sendProductsMenu(ctx, botInstance, 0, platId);
        } else if (data.startsWith('pnav_')) {
          const parts = data.replace('pnav_', '').split('_');
          await sendProductsMenu(ctx, botInstance, parseInt(parts[1], 10) || 0, parts[0]);
        } else if (data.startsWith('pdetail:')) {
          const parts = data.replace('pdetail:', '').split(':');
          await sendProductDetail(ctx, botInstance, parts[1], parts[0]);
        } else if (data.startsWith('buy:')) {
          const prodId = data.replace('buy:', '');
          await handleBuy(ctx, prodId, botInstance);
        } else if (data === 'admin_panel') {
          await sendAdminPanel(ctx, botInstance);
        } else if (data === 'admin_set_maintenance') {
          await setBotStatus('maintenance');
          await sendAdminPanel(ctx, botInstance);
        } else if (data === 'admin_set_online') {
          await setBotStatus('online');
          await sendAdminPanel(ctx, botInstance);
        } else if (data === 'admin_prices') {
          await sendAdminPricesMenu(ctx, botInstance, 0);
        } else if (data.startsWith('admin_prices_page_')) {
          const page = parseInt(data.replace('admin_prices_page_', ''), 10) || 0;
          await sendAdminPricesMenu(ctx, botInstance, page);
        } else if (data.startsWith('admin_resetprice_')) {
          const prodId = data.replace('admin_resetprice_', '');
          await deleteCustomPrice(prodId);
          await sendSafeMessage(ctx, botInstance, `✅ Harga produk <code>${escapeHtml(prodId)}</code> berhasil direset!`, { parse_mode: 'HTML' });
        } else if (data.startsWith('admin_process_')) {
          const orderCode = data.replace('admin_process_', '');
          const res = await adminRetrySupplierFulfill(orderCode, botInstance);
          await sendSafeMessage(ctx, botInstance, res.message, { parse_mode: 'HTML' });
        }
      } catch (err) {
        console.error('[Callback Query Error]:', err);
      }
    });
  }
}
