import { query } from './db';
import { ExtendedBot } from '../bot/handler';

if (!process.env.TELEGRAM_BOT_TOKEN) {
  try {
    process.loadEnvFile?.();
  } catch {
    // Ignore error if .env does not exist
  }
}

const DEFAULT_BROADCAST_CHANNEL =
  process.env.TELEGRAM_BROADCAST_CHANNEL ||
  process.env.TELEGRAM_CHANNEL_USERNAME ||
  '@DafungHub';

const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || 'dafung_hub_bot';

function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Format order code with middle characters masked for privacy (e.g. ORD-•••-X89)
 */
export function maskOrderCode(orderCode: string): string {
  if (!orderCode) return 'ORD-•••';
  const parts = orderCode.split('-');
  if (parts.length >= 3) {
    return `${parts[0]}-•••-${parts[parts.length - 1]}`;
  }
  if (orderCode.length > 8) {
    return `${orderCode.substring(0, 4)}•••${orderCode.substring(orderCode.length - 4)}`;
  }
  return orderCode;
}

/**
 * Format date in Indonesian WIB timezone (e.g. 18 Okt 2026, 19:30 WIB)
 */
export function formatWibDateTime(dateInput?: Date | string | null): string {
  const d = dateInput ? new Date(dateInput) : new Date();
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
  ];

  // Adjust to UTC+7 (WIB)
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const wib = new Date(utc + 7 * 3600000);

  const day = wib.getDate();
  const month = months[wib.getMonth()];
  const year = wib.getFullYear();
  const hours = String(wib.getHours()).padStart(2, '0');
  const minutes = String(wib.getMinutes()).padStart(2, '0');

  return `${day} ${month} ${year}, ${hours}:${minutes} WIB`;
}

/**
 * Get configured broadcast target channel
 */
export async function getBroadcastChannel(): Promise<string> {
  try {
    const res = await query<{ value: string }>(
      `SELECT value FROM bot_settings WHERE key = 'broadcast_channel' LIMIT 1`
    );
    if (res.rows.length > 0 && res.rows[0].value?.trim()) {
      return res.rows[0].value.trim();
    }
  } catch {
    // Fallback to environment variable or default
  }
  return DEFAULT_BROADCAST_CHANNEL;
}

/**
 * Update broadcast target channel
 */
export async function setBroadcastChannel(channel: string): Promise<void> {
  const clean = channel.trim();
  const formatted = clean.startsWith('@') || clean.startsWith('-100') ? clean : `@${clean}`;
  await query(
    `INSERT INTO bot_settings (key, value, updated_at)
     VALUES ('broadcast_channel', $1, CURRENT_TIMESTAMP)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
    [formatted]
  );
}

/**
 * Check if automated order broadcast is enabled
 */
export async function isAutoOrderBroadcastEnabled(): Promise<boolean> {
  try {
    const res = await query<{ value: string }>(
      `SELECT value FROM bot_settings WHERE key = 'broadcast_auto_order' LIMIT 1`
    );
    if (res.rows.length > 0) {
      return res.rows[0].value !== 'false';
    }
  } catch {
    // Default to true
  }
  return true;
}

/**
 * Toggle automated order broadcast
 */
export async function setAutoOrderBroadcastEnabled(enabled: boolean): Promise<void> {
  await query(
    `INSERT INTO bot_settings (key, value, updated_at)
     VALUES ('broadcast_auto_order', $1, CURRENT_TIMESTAMP)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
    [enabled ? 'true' : 'false']
  );
}

/**
 * Format initial username / masked username for privacy and social proof (e.g. @da***c or @Dap***)
 */
export function maskUsername(username?: string | null, firstName?: string | null): string {
  const cleanUser = (username || '').replace(/^@/, '').trim();
  if (cleanUser.length > 0) {
    if (cleanUser.length <= 2) {
      return `@${cleanUser[0]}***`;
    }
    const visibleChars = Math.min(3, Math.max(2, Math.floor(cleanUser.length / 3)));
    return `@${cleanUser.slice(0, visibleChars)}***`;
  }

  const cleanName = (firstName || '').trim();
  if (cleanName.length > 0) {
    if (cleanName.length <= 2) {
      return `${cleanName[0]}***`;
    }
    return `${cleanName.slice(0, 2)}***`;
  }

  return 'User-***';
}

/**
 * Build clean, anti-slop copy for successful order announcement
 */
export function buildOrderBroadcastMessage(order: {
  order_code: string;
  product_name: string;
  product_price: number;
  delivered_at?: Date | string | null;
  created_at?: Date | string | null;
  username?: string | null;
  first_name?: string | null;
}): string {
  const maskedCode = maskOrderCode(order.order_code);
  const maskedUser = maskUsername(order.username, order.first_name);
  const timeStr = formatWibDateTime(order.delivered_at || order.created_at || new Date());
  const priceStr = `Rp ${Number(order.product_price || 0).toLocaleString('id-ID')}`;

  return (
    `✨ <b>PESANAN BERHASIL TERVERIFIKASI</b>\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `👤 <b>Pembeli:</b> <code>${escapeHtml(maskedUser)}</code>\n` +
    `📦 <b>Produk:</b> ${escapeHtml(order.product_name)}\n` +
    `🏷️ <b>Order ID:</b> <code>${escapeHtml(maskedCode)}</code>\n` +
    `💰 <b>Nominal:</b> ${escapeHtml(priceStr)}\n` +
    `🕒 <b>Waktu:</b> ${escapeHtml(timeStr)}\n` +
    `⚡ <b>Status:</b> Pembayaran Lunas (Sukses)\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `🛒 <i>Pemesanan instan & otomatis 24 jam via bot @${escapeHtml(BOT_USERNAME)}</i>`
  );
}

/**
 * Send HTTP request directly to Telegram API (works across serverless & persistent runtimes)
 */
async function sendTelegramApi(
  method: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; result?: any; description?: string; error_code?: number }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return { ok: false, description: 'TELEGRAM_BOT_TOKEN is not configured' };
  }

  const url = `https://api.telegram.org/bot${token}/${method}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  return data;
}

/**
 * Automatically broadcast successful order to the target Telegram channel
 */
export async function broadcastOrderSuccess(
  orderCode: string,
  botInstance?: ExtendedBot
): Promise<{ success: boolean; messageId?: number; error?: string }> {
  try {
    const isEnabled = await isAutoOrderBroadcastEnabled();
    if (!isEnabled) {
      return { success: true, error: 'Auto-broadcast is disabled in settings' };
    }

    // Check if order exists and if already broadcasted
    const orderRes = await query<{
      id: string;
      order_code: string;
      product_name: string;
      product_price: number;
      is_broadcasted: boolean;
      delivered_at: Date | null;
      created_at: Date;
      username?: string | null;
      first_name?: string | null;
      invoice_data?: Record<string, unknown> | null;
    }>(
      `SELECT o.id, o.order_code, o.is_broadcasted, o.delivered_at, o.created_at, o.invoice_data,
              p.name as product_name, p.price as product_price,
              u.username, u.first_name
       FROM orders o
       JOIN products p ON o.product_id = p.id
       JOIN users u ON o.user_id = u.id
       WHERE o.order_code = $1 LIMIT 1`,
      [orderCode]
    );

    if (orderRes.rows.length === 0) {
      return { success: false, error: `Order ${orderCode} not found` };
    }

    const ord = orderRes.rows[0];
    if (ord.is_broadcasted) {
      return { success: true, error: 'Order already broadcasted' };
    }

    const rawUsername =
      ord.username ||
      ((ord.invoice_data as Record<string, unknown>)?.customer_username as string | undefined);
    const rawFirstName =
      ord.first_name ||
      ((ord.invoice_data as Record<string, unknown>)?.customer_first_name as string | undefined);

    const channel = await getBroadcastChannel();
    const text = buildOrderBroadcastMessage({
      ...ord,
      username: rawUsername,
      first_name: rawFirstName,
    });
    const replyMarkup = {
      inline_keyboard: [
        [
          {
            text: '🛍️ Order via Bot',
            url: `https://t.me/${BOT_USERNAME}`,
          },
        ],
      ],
    };

    let sentOk = false;
    let messageId: number | undefined;

    // 1. Try botInstance if available
    if (botInstance && typeof botInstance.sendMessage === 'function') {
      try {
        const res = (await botInstance.sendMessage(channel, text, {
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        })) as { message_id?: number };
        if (res?.message_id) {
          sentOk = true;
          messageId = res.message_id;
        }
      } catch (botErr) {
        // Fallback to direct HTTP API
      }
    }

    // 2. Direct Telegram API fallback
    if (!sentOk) {
      const apiRes = await sendTelegramApi('sendMessage', {
        chat_id: channel,
        text,
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      });

      if (apiRes.ok && apiRes.result?.message_id) {
        sentOk = true;
        messageId = apiRes.result.message_id;
      } else {
        const errMsg = apiRes.description || 'Unknown Telegram error';
        console.warn(`[Broadcast] Failed to send order broadcast to ${channel}: ${errMsg}`);
        return { success: false, error: errMsg };
      }
    }

    // 3. Mark order as broadcasted in DB
    await query(
      `UPDATE orders SET is_broadcasted = true WHERE id = $1`,
      [ord.id]
    ).catch(() => {});

    console.log(`[Broadcast] Order ${orderCode} broadcasted successfully to ${channel} (Message ID: ${messageId})`);
    return { success: true, messageId };
  } catch (err) {
    const errorMsg = (err as Error).message || String(err);
    console.error(`[Broadcast Error]: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}

/**
 * Send manual broadcast message from admin to the target channel
 */
export async function sendManualBroadcast(
  messageText: string,
  botInstance?: ExtendedBot,
  options?: { photoUrl?: string }
): Promise<{ success: boolean; messageId?: number; channel?: string; error?: string }> {
  try {
    const channel = await getBroadcastChannel();
    const cleanText = messageText?.trim();

    if (!cleanText) {
      return { success: false, error: 'Pesan broadcast tidak boleh kosong.' };
    }

    let sentOk = false;
    let messageId: number | undefined;

    // If photo is provided
    if (options?.photoUrl) {
      if (botInstance && typeof botInstance.sendPhoto === 'function') {
        try {
          const res = (await botInstance.sendPhoto(channel, options.photoUrl, {
            caption: cleanText,
            parse_mode: 'HTML',
          })) as { message_id?: number };
          if (res?.message_id) {
            sentOk = true;
            messageId = res.message_id;
          }
        } catch {}
      }

      if (!sentOk) {
        const apiRes = await sendTelegramApi('sendPhoto', {
          chat_id: channel,
          photo: options.photoUrl,
          caption: cleanText,
          parse_mode: 'HTML',
        });
        if (apiRes.ok) {
          sentOk = true;
          messageId = apiRes.result?.message_id;
        } else {
          return { success: false, channel, error: apiRes.description };
        }
      }
    } else {
      // Text message
      if (botInstance && typeof botInstance.sendMessage === 'function') {
        try {
          const res = (await botInstance.sendMessage(channel, cleanText, {
            parse_mode: 'HTML',
          })) as { message_id?: number };
          if (res?.message_id) {
            sentOk = true;
            messageId = res.message_id;
          }
        } catch {}
      }

      if (!sentOk) {
        const apiRes = await sendTelegramApi('sendMessage', {
          chat_id: channel,
          text: cleanText,
          parse_mode: 'HTML',
        });
        if (apiRes.ok) {
          sentOk = true;
          messageId = apiRes.result?.message_id;
        } else {
          return { success: false, channel, error: apiRes.description };
        }
      }
    }

    return { success: true, messageId, channel };
  } catch (err) {
    const errorMsg = (err as Error).message || String(err);
    return { success: false, error: errorMsg };
  }
}
