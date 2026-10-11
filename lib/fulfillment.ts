import { query, Order } from './db';
import { encrypt } from './encrypt';
import { getSupplierBalance, createSupplierOrder, getSupplierProducts } from './supplier';
import { ExtendedBot, sendSafeMessage } from '../bot/handler';
import { ADMIN_TELEGRAM_ID } from './pricing';

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

/**
 * Smart Fallback Fulfillment Engine:
 * - Checks live balance at supplier.
 * - If balance is sufficient, executes instant H2H order and delivers key in seconds.
 * - If balance is insufficient (0 modal mode), switches to Queue Mode, notifies customer gently,
 *   and sends an actionable dispatch alert with 1-click retry button to the Owner (7133868769).
 */
export async function processOrderPayment(
  orderCode: string,
  botInstance: ExtendedBot
): Promise<FulfillmentResult> {
  // 1. Fetch Order and Buyer details
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
      message: `Order with code "${orderCode}" not found.`,
    };
  }

  const order = orderRes.rows[0];

  if (order.fulfillment_status === 'delivered') {
    return {
      success: true,
      mode: 'already_processed',
      message: `Order "${orderCode}" has already been fulfilled.`,
      orderCode,
    };
  }

  // 2. Mark order as PAID
  await query(
    `UPDATE orders SET payment_status = 'paid' WHERE id = $1`,
    [order.id]
  );

  // 3. Find supplier product to determine modal price and supplier ID
  let supplierProductId = order.product_id;
  let modalPrice = order.product_price;

  try {
    const suppProducts = await getSupplierProducts();
    const matchedSupp = suppProducts.find(
      (p) =>
        p.id === order.product_id ||
        p.name.toLowerCase() === order.product_name.toLowerCase()
    );
    if (matchedSupp) {
      supplierProductId = matchedSupp.id;
      modalPrice = matchedSupp.price_idr;
    }
  } catch {
    // Default to stored product price as modal
  }

  const sellingPrice = order.product_price;
  const netProfit = Math.max(0, sellingPrice - modalPrice);

  // 4. Check live supplier balance
  let currentBalance = 0;
  try {
    const balRes = await getSupplierBalance();
    currentBalance = balRes.balance || 0;
  } catch {
    currentBalance = 0;
  }

  const buyerChatId = order.telegram_id;

  // 5. DECISION: Instant H2H vs Queue Mode
  if (currentBalance >= modalPrice && modalPrice > 0) {
    // --- MODE 1: INSTANT H2H AUTO-FULFILLMENT ---
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

        // Send Key to Buyer
        const buyerSuccessMessage =
          `🎉 <b>PEMBAYARAN SUKSES & PESANAN SELESAI!</b>\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `📦 <b>Produk:</b> ${escapeHtml(order.product_name)}\n` +
          `🆔 <b>Kode Order:</b> <code>${escapeHtml(order.order_code)}</code>\n` +
          `━━━━━━━━━━━━━━━━━━━\n\n` +
          `🔑 <b>Kredensial / Lisensi Akun Anda:</b>\n` +
          `<code>${escapeHtml(deliveredKey)}</code>\n\n` +
          `📌 <i>Simpan kredensial ini baik-baik. Garansi berlaku sesuai ketentuan produk. Terima kasih telah berbelanja di DaFung Hub!</i>`;

        await sendSafeMessage(
          { chatId: buyerChatId } as never,
          botInstance,
          buyerSuccessMessage,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🛍️ Beli Produk Lain', callback_data: 'menu_products' }],
                [{ text: '🔙 Menu Utama', callback_data: 'menu_main' }],
              ],
            },
          }
        );

        // Notify Owner
        const ownerAlert =
          `✅ <b>ORDER SELESAI OTOMATIS (H2H INSTAN)</b>\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `• <b>Kode Order:</b> <code>${escapeHtml(order.order_code)}</code>\n` +
          `• <b>Produk:</b> ${escapeHtml(order.product_name)}\n` +
          `• <b>Pembeli:</b> <code>${escapeHtml(buyerChatId)}</code>\n` +
          `• <b>Uang Masuk:</b> Rp ${sellingPrice.toLocaleString('id-ID')}\n` +
          `• <b>Modal Supplier:</b> Rp ${modalPrice.toLocaleString('id-ID')}\n` +
          `• <b>Untung Bersih:</b> <b>+Rp ${netProfit.toLocaleString('id-ID')}</b>\n` +
          `• <b>Sisa Saldo Supplier:</b> Rp ${(currentBalance - modalPrice).toLocaleString('id-ID')}\n` +
          `━━━━━━━━━━━━━━━━━━━`;

        await sendSafeMessage(
          { chatId: ADMIN_TELEGRAM_ID } as never,
          botInstance,
          ownerAlert,
          { parse_mode: 'HTML' }
        );

        return {
          success: true,
          mode: 'instant',
          message: 'Order fulfilled instantly via supplier H2H.',
          orderCode,
          deliveredKey,
        };
      }
    } catch (suppErr) {
      console.warn('[Fulfillment] Supplier order attempt failed, switching to Queue Mode:', suppErr);
    }
  }

  // --- MODE 2: QUEUE MODE (0 MODAL FALLBACK) ---
  await query(
    `UPDATE orders SET fulfillment_status = 'processing' WHERE id = $1`,
    [order.id]
  );

  // Notify Buyer gently
  const buyerQueueMessage =
    `🧾 <b>PEMBAYARAN DITERIMA!</b>\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `📦 <b>Produk:</b> ${escapeHtml(order.product_name)}\n` +
    `💰 <b>Total:</b> Rp ${sellingPrice.toLocaleString('id-ID')}\n` +
    `🆔 <b>Kode Order:</b> <code>${escapeHtml(order.order_code)}</code>\n` +
    `━━━━━━━━━━━━━━━━━━━\n\n` +
    `⏳ <i>Pesanan Anda sedang disiapkan oleh antrean sistem kami (estimasi 1–10 menit).</i>\n` +
    `<i>Kredensial akun digital akan langsung dikirimkan otomatis ke chat ini begitu siap!</i>`;

  await sendSafeMessage(
    { chatId: buyerChatId } as never,
    botInstance,
    buyerQueueMessage,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Cek Status Pesanan', callback_data: `status_${order.order_code}` }],
          [{ text: '🔙 Menu Utama', callback_data: 'menu_main' }],
        ],
      },
    }
  );

  // Send Actionable Alert to Owner
  const ownerQueueAlert =
    `🔔 <b>PESANAN BARU MASUK (MODE ANTREAN)</b>\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `• <b>Kode Order:</b> <code>${escapeHtml(order.order_code)}</code>\n` +
    `• <b>Produk:</b> ${escapeHtml(order.product_name)}\n` +
    `• <b>Pembeli:</b> <code>${escapeHtml(buyerChatId)}</code>\n` +
    `• <b>Uang Masuk:</b> Rp ${sellingPrice.toLocaleString('id-ID')}\n` +
    `• <b>Modal Supplier:</b> Rp ${modalPrice.toLocaleString('id-ID')}\n` +
    `• <b>Estimasi Untung:</b> <b>+Rp ${netProfit.toLocaleString('id-ID')}</b>\n` +
    `• <b>Saldo Supplier:</b> Rp ${currentBalance.toLocaleString('id-ID')} (Kurang)\n` +
    `━━━━━━━━━━━━━━━━━━━\n\n` +
    `👉 <i>Pilihan eksekusi pengiriman:</i>\n` +
    `1. Klik tombol di bawah setelah Anda top up di supplier.\n` +
    `2. Atau kirim kredensial manual dengan perintah:\n` +
    `   <code>/kirim ${escapeHtml(order.order_code)} &lt;email:password&gt;</code>`;

  const ownerActionButtons = {
    inline_keyboard: [
      [
        {
          text: '🚀 Proses via Supplier (1-Klik)',
          callback_data: `admin_process_${order.order_code}`,
        },
      ],
      [{ text: '📦 Buka Antrean Pesanan', callback_data: 'admin_queue' }],
    ],
  };

  await sendSafeMessage(
    { chatId: ADMIN_TELEGRAM_ID } as never,
    botInstance,
    ownerQueueAlert,
    {
      parse_mode: 'HTML',
      reply_markup: ownerActionButtons,
    }
  );

  return {
    success: true,
    mode: 'queued',
    message: 'Order moved to queue mode. Owner notified.',
    orderCode,
  };
}

/**
 * Admin Manual Fulfillment:
 * Owner fulfills the order manually using command `/kirim <orderCode> <credentials>`
 */
export async function adminManualFulfill(
  orderCode: string,
  credentialsText: string,
  botInstance: ExtendedBot
): Promise<{ success: boolean; message: string }> {
  const cleanKey = credentialsText?.trim();
  if (!cleanKey) {
    return { success: false, message: 'Kredensial akun tidak boleh kosong.' };
  }

  const orderRes = await query<Order & { telegram_id: string; product_name: string }>(
    `SELECT o.*, u.telegram_id, p.name as product_name
     FROM orders o
     JOIN users u ON o.user_id = u.id
     JOIN products p ON o.product_id = p.id
     WHERE o.order_code = $1 LIMIT 1`,
    [orderCode]
  );

  if (orderRes.rows.length === 0) {
    return { success: false, message: `Order "${orderCode}" tidak ditemukan.` };
  }

  const order = orderRes.rows[0];
  const encryptedKey = encrypt(cleanKey);

  await query(
    `UPDATE orders
     SET fulfillment_status = 'delivered',
         credential_encrypted = $1,
         delivered_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [encryptedKey, order.id]
  );

  // Send account credentials to the buyer
  const buyerMessage =
    `🎉 <b>PESANAN ANDA TELAH SELESAI!</b>\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `📦 <b>Produk:</b> ${escapeHtml(order.product_name)}\n` +
    `🆔 <b>Kode Order:</b> <code>${escapeHtml(order.order_code)}</code>\n` +
    `━━━━━━━━━━━━━━━━━━━\n\n` +
    `🔑 <b>Kredensial / Detail Akun:</b>\n` +
    `<code>${escapeHtml(cleanKey)}</code>\n\n` +
    `📌 <i>Terima kasih telah berbelanja di DaFung Hub! Hubungi admin jika butuh bantuan atau klaim garansi.</i>`;

  await sendSafeMessage(
    { chatId: order.telegram_id } as never,
    botInstance,
    buyerMessage,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🛍️ Beli Produk Baru', callback_data: 'menu_products' }],
          [{ text: '🔙 Menu Utama', callback_data: 'menu_main' }],
        ],
      },
    }
  );

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
  botInstance: ExtendedBot
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
export async function getPendingQueueOrders(): Promise<
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
     ORDER BY o.created_at ASC
     LIMIT 10`
  );
  return res.rows;
}
