import { query, Order } from './db';
import { encrypt } from './encrypt';
import { getSupplierBalance, createSupplierOrder, getSupplierProducts } from '../suppliers/supplier-api';
import { config } from '../../config/bot.config';

function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface FulfillmentResult {
  success: boolean;
  mode: 'instant' | 'queued' | 'already_processed' | 'error';
  message: string;
  orderCode?: string;
  deliveredKey?: string;
}

export interface MinimalBot {
  sendMessage: (chatId: string | number, text: string, options?: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Smart Fallback Fulfillment Engine:
 * - Marks order as paid in DB
 * - If external supplier enabled and balance sufficient: executes instant H2H order and delivers key to customer
 * - If balance insufficient or manual mode: enters Queue Mode and sends dispatch alert to Owner
 */
export async function processOrderPayment(
  orderCode: string,
  botInstance: MinimalBot
): Promise<FulfillmentResult> {
  const orderRes = await query<Order & { telegram_id: string; product_name: string; product_price: number }>(
    `SELECT o.*, u.telegram_id, p.name as product_name, p.price as product_price
     FROM orders o
     JOIN users u ON o.user_id = u.id
     JOIN products p ON o.product_id = p.id
     WHERE o.order_code = $1 LIMIT 1`,
    [orderCode]
  );

  if (orderRes.rows.length === 0) {
    return {
      success: false,
      mode: 'error',
      message: `Order "${orderCode}" tidak ditemukan.`,
    };
  }

  const order = orderRes.rows[0];

  if (order.fulfillment_status === 'delivered') {
    return {
      success: true,
      mode: 'already_processed',
      message: `Order "${orderCode}" sudah selesai diproses sebelumnya.`,
      orderCode,
    };
  }

  // 1. Mark as PAID
  await query(`UPDATE orders SET payment_status = 'paid' WHERE id = $1`, [order.id]);

  let supplierProductId = order.product_id;
  let modalPrice = order.product_price;

  if (config.supplier.enabled) {
    try {
      const suppProducts = await getSupplierProducts();
      const matched = suppProducts.find(
        (p) => p.id === order.product_id || p.name.toLowerCase() === order.product_name.toLowerCase()
      );
      if (matched) {
        supplierProductId = matched.id;
        modalPrice = matched.price_idr;
      }
    } catch {}
  }

  let currentBalance = 0;
  if (config.supplier.enabled) {
    try {
      const balRes = await getSupplierBalance();
      currentBalance = balRes.balance || 0;
    } catch {}
  }

  const buyerChatId = order.telegram_id;

  // 2. Instant H2H Fulfillment Branch
  if (config.supplier.enabled && currentBalance >= modalPrice && modalPrice > 0) {
    try {
      const orderResp = await createSupplierOrder(supplierProductId, 1);
      const deliveredKey = orderResp.delivered_key || orderResp.delivered_keys?.[0];

      if (deliveredKey) {
        const encryptedKey = encrypt(deliveredKey);
        await query(
          `UPDATE orders
           SET fulfillment_status = 'delivered',
               credential_encrypted = $1,
               delivered_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [encryptedKey, order.id]
        );

        const buyerSuccessMessage =
          `🎉 <b>PEMBAYARAN SUKSES & PESANAN SELESAI!</b>\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `📦 <b>Produk:</b> ${escapeHtml(order.product_name)}\n` +
          `🆔 <b>Kode Order:</b> <code>${escapeHtml(order.order_code)}</code>\n` +
          `━━━━━━━━━━━━━━━━━━━\n\n` +
          `🔑 <b>Kredensial / Lisensi Akun:</b>\n` +
          `<code>${escapeHtml(deliveredKey)}</code>\n\n` +
          `📌 <i>Simpan kredensial ini baik-baik. Hubungi admin jika butuh bantuan atau klaim garansi. Terima kasih telah berbelanja di ${escapeHtml(config.store.name)}!</i>`;

        await botInstance.sendMessage(buyerChatId, buyerSuccessMessage, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🛍️ Beli Produk Lain', callback_data: 'menu_products' }],
              [{ text: '🔙 Menu Utama', callback_data: 'menu_main' }],
            ],
          },
        });

        // Notify Owner
        const ownerNotice =
          `⚡ <b>AUTO-ORDER BERHASIL (INSTANT H2H)</b>\n` +
          `• Order: <code>${escapeHtml(order.order_code)}</code>\n` +
          `• Produk: ${escapeHtml(order.product_name)}\n` +
          `• Pembeli: <code>${escapeHtml(buyerChatId)}</code>`;
        await botInstance.sendMessage(config.admin.ownerId, ownerNotice, { parse_mode: 'HTML' });

        return {
          success: true,
          mode: 'instant',
          message: 'Order berhasil diproses instan via H2H supplier.',
          orderCode,
          deliveredKey,
        };
      }
    } catch (suppErr) {
      console.warn('[Fulfillment] Supplier order attempt failed, switching to Queue Mode:', suppErr);
    }
  }

  // 3. Queue Mode Branch (Manual / Low Balance Fallback)
  await query(`UPDATE orders SET fulfillment_status = 'processing' WHERE id = $1`, [order.id]);

  const buyerQueueMessage =
    `🧾 <b>PEMBAYARAN DITERIMA!</b>\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `📦 <b>Produk:</b> ${escapeHtml(order.product_name)}\n` +
    `🆔 <b>Kode Order:</b> <code>${escapeHtml(order.order_code)}</code>\n` +
    `━━━━━━━━━━━━━━━━━━━\n\n` +
    `⏳ <i>Pesanan Anda sedang disiapkan oleh antrean sistem kami (estimasi 1–15 menit).</i>\n` +
    `<i>Kredensial akun akan langsung dikirim otomatis ke chat ini begitu siap!</i>`;

  await botInstance.sendMessage(buyerChatId, buyerQueueMessage, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔄 Cek Status Pesanan', callback_data: `status_${order.order_code}` }],
        [{ text: '🔙 Menu Utama', callback_data: 'menu_main' }],
      ],
    },
  });

  // Actionable Alert to Owner
  const ownerQueueAlert =
    `🔔 <b>PESANAN BARU MASUK (MODE ANTREAN)</b>\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `• <b>Kode Order:</b> <code>${escapeHtml(order.order_code)}</code>\n` +
    `• <b>Produk:</b> ${escapeHtml(order.product_name)}\n` +
    `• <b>Pembeli:</b> <code>${escapeHtml(buyerChatId)}</code>\n` +
    `• <b>Total:</b> Rp ${order.product_price.toLocaleString('id-ID')}\n` +
    `━━━━━━━━━━━━━━━━━━━\n\n` +
    `💡 <b>Aksi Admin:</b>\n` +
    `Klik tombol <b>Eksekusi Supplier</b> di bawah, atau ketik:\n` +
    `<code>/kirim ${order.order_code} &lt;kredensial&gt;</code>`;

  await botInstance.sendMessage(config.admin.ownerId, ownerQueueAlert, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🚀 Eksekusi Supplier Sekarang', callback_data: `admin_process_${order.order_code}` }],
        [{ text: '✉️ Kirim Manual', callback_data: `admin_manual_${order.order_code}` }],
      ],
    },
  });

  return {
    success: true,
    mode: 'queued',
    message: 'Pembayaran diterima. Order ditempatkan dalam antrean sistem.',
    orderCode,
  };
}

/**
 * Admin manual fulfillment via command: /kirim <orderCode> <credential>
 */
export async function adminManualFulfill(
  orderCode: string,
  credentialText: string,
  botInstance: MinimalBot
): Promise<{ success: boolean; message: string }> {
  const orderRes = await query<Order & { telegram_id: string; product_name: string }>(
    `SELECT o.*, u.telegram_id, p.name as product_name
     FROM orders o
     JOIN users u ON o.user_id = u.id
     JOIN products p ON o.product_id = p.id
     WHERE o.order_code = $1 LIMIT 1`,
    [orderCode]
  );

  if (orderRes.rows.length === 0) {
    return { success: false, message: `❌ Order <code>${escapeHtml(orderCode)}</code> tidak ditemukan.` };
  }

  const order = orderRes.rows[0];
  const cleanKey = credentialText.trim();
  const encryptedKey = encrypt(cleanKey);

  await query(
    `UPDATE orders
     SET fulfillment_status = 'delivered',
         payment_status = 'paid',
         credential_encrypted = $1,
         delivered_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [encryptedKey, order.id]
  );

  const buyerMessage =
    `🎉 <b>PESANAN ANDA TELAH SELESAI!</b>\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `📦 <b>Produk:</b> ${escapeHtml(order.product_name)}\n` +
    `🆔 <b>Kode Order:</b> <code>${escapeHtml(order.order_code)}</code>\n` +
    `━━━━━━━━━━━━━━━━━━━\n\n` +
    `🔑 <b>Kredensial / Detail Akun:</b>\n` +
    `<code>${escapeHtml(cleanKey)}</code>\n\n` +
    `📌 <i>Terima kasih telah berbelanja di ${escapeHtml(config.store.name)}! Hubungi admin jika butuh bantuan atau klaim garansi.</i>`;

  await botInstance.sendMessage(order.telegram_id, buyerMessage, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🛍️ Beli Produk Baru', callback_data: 'menu_products' }],
        [{ text: '🔙 Menu Utama', callback_data: 'menu_main' }],
      ],
    },
  });

  return {
    success: true,
    message: `✅ Akun untuk order <code>${orderCode}</code> berhasil dikirimkan ke pembeli!`,
  };
}

/**
 * Admin 1-Click Supplier Retry Fulfillment:
 * Owner clicks button `admin_process_<orderCode>` after topping up at supplier
 */
export async function adminRetrySupplierFulfill(
  orderCode: string,
  botInstance: MinimalBot
): Promise<{ success: boolean; message: string }> {
  const result = await processOrderPayment(orderCode, botInstance);

  if (result.mode === 'instant') {
    return {
      success: true,
      message: `🚀 <b>Berhasil!</b> Order <code>${orderCode}</code> telah dieksekusi via supplier dan akun sudah otomatis terkirim ke pembeli.`,
    };
  }

  if (result.mode === 'already_processed') {
    return {
      success: true,
      message: `ℹ️ Order <code>${orderCode}</code> sudah selesai sebelumnya.`,
    };
  }

  let currentBal = 0;
  try {
    currentBal = (await getSupplierBalance()).balance || 0;
  } catch {}

  return {
    success: false,
    message:
      `⚠️ Saldo supplier Anda saat ini <b>Rp ${currentBal.toLocaleString('id-ID')}</b> masih belum cukup untuk order ini.\n\n` +
      `Silakan top up di supplier terlebih dahulu, lalu klik tombol ini lagi, atau gunakan perintah <code>/kirim ${orderCode} &lt;kredensial&gt;</code>.`,
  };
}

/**
 * Get all active queued/processing orders for the Owner Panel
 */
export async function getPendingQueueOrders(limit: number = 50): Promise<
  Array<Order & { product_name: string; telegram_id: string; product_price: number }>
> {
  const res = await query<
    Order & { product_name: string; telegram_id: string; product_price: number }
  >(
    `SELECT o.*, p.name as product_name, p.price as product_price, u.telegram_id
     FROM orders o
     JOIN products p ON o.product_id = p.id
     JOIN users u ON o.user_id = u.id
     WHERE o.fulfillment_status = 'processing'
     ORDER BY o.created_at DESC
     LIMIT $1`,
    [limit]
  );
  return res.rows;
}
