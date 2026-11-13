import { query, Order } from './db';
import { encrypt } from './encrypt';
import { getSupplierBalance, createSupplierOrder, getSupplierProducts } from './supplier';
import {
  ExtendedBot,
  sendSafeMessage,
  sendPreservedMessage,
  markMessageAsPreserved,
  clearPreviousBotMessages,
} from '../bot/handler';
import { ADMIN_TELEGRAM_ID } from './pricing';
import { broadcastOrderSuccess } from './broadcast';

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
  mode: 'instant' | 'queued' | 'already_processed' | 'error' | 'deposit';
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
  botInstance: ExtendedBot,
  transactionMeta?: {
    transactionId?: string | number;
    transaction_id?: string | number;
    id?: string | number;
    [key: string]: unknown;
  },
  options?: { allowRetryQueued?: boolean }
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
  const wasPreviouslyPaid = order.payment_status === 'paid';

  if (order.fulfillment_status === 'delivered') {
    return {
      success: true,
      mode: 'already_processed',
      message: `Order "${orderCode}" has already been fulfilled.`,
      orderCode,
    };
  }

  if (wasPreviouslyPaid && !options?.allowRetryQueued) {
    return {
      success: true,
      mode: 'already_processed',
      message: `Order "${orderCode}" payment has already been confirmed.`,
      orderCode,
    };
  }

  // 2. Mark order as PAID & lock transaction ID in invoice_data if provided
  const invData = (order.invoice_data as Record<string, unknown>) || {};
  const isBalancePayment = invData.payment_method === 'balance' || invData.gateway === 'balance';
  const rawTxId =
    transactionMeta?.transactionId ??
    transactionMeta?.transaction_id ??
    transactionMeta?.id;
  const txId = rawTxId !== undefined && rawTxId !== null ? String(rawTxId).trim() : '';

  if (txId) {
    const txFieldPath = isBalancePayment ? '{balance_tx_id}' : '{shopeepay_tx_id}';
    await query(
      `UPDATE orders
       SET payment_status = 'paid',
           invoice_data = jsonb_set(
             COALESCE(invoice_data::jsonb, '{}'::jsonb),
             $1::text[],
             to_jsonb($2::text)
           )
       WHERE id = $3`,
      [txFieldPath, txId, order.id]
    ).catch(() => {
      return query(`UPDATE orders SET payment_status = 'paid' WHERE id = $1`, [order.id]);
    });
  } else if (!wasPreviouslyPaid) {
    await query(
      `UPDATE orders SET payment_status = 'paid' WHERE id = $1`,
      [order.id]
    );
  }

  // 2a. Record voucher usage & broadcast immediately upon initial payment confirmation
  if (!wasPreviouslyPaid) {
    if (invData.voucher_id) {
      const { applyVoucherUsage } = await import('./voucher');
      const discountAmount = Number(invData.voucher_discount || invData.voucher_cashback || 0);
      await applyVoucherUsage({
        voucherId: String(invData.voucher_id),
        userId: order.user_id,
        orderId: order.id,
        discountAmount,
      });
    }

    // Broadcast payment confirmation to channel (@DafungHub) immediately upon payment
    broadcastOrderSuccess(order.order_code, botInstance).catch((bErr) => {
      console.warn('[Broadcast Warning] Failed to broadcast order payment success:', bErr);
    });

    // Send real-time push notification to Admin Mobile App
    try {
      const { sendAdminPushNotification } = await import('./push-notifications');
      const customerDisplay = invData.customer_username
        ? `@${invData.customer_username}`
        : (invData.customer_first_name as string) || 'Pelanggan';

      sendAdminPushNotification({
        orderCode: order.order_code,
        productName: order.product_name || 'Produk Dafung Hub',
        price: Number(order.price || invData.amount || invData.payable_amount || 0),
        customerName: customerDisplay,
      }).catch((pushErr) => {
        console.warn('[Push Notification] Failed to notify admin mobile app:', pushErr);
      });
    } catch (pushErr) {
      console.warn('[Push Notification] Error loading push module:', pushErr);
    }
  }

  // 2b. Special Handling: Membership VIP Subscription
  const {
    isMembershipProduct,
    findMembershipPackage,
    activateOrExtendMembership,
    formatWibDate,
    recordDiscountUsage,
    getUserMembership,
  } = await import('./membership');

  if (isMembershipProduct(order.product_name)) {
    const pkg = findMembershipPackage(order.product_name);
    const durationDays = pkg ? pkg.durationDays : 30;
    const act = await activateOrExtendMembership(order.user_id, durationDays);

    const note = `Membership VIP diaktifkan hingga ${act.newExpiresAt.toISOString()}`;
    const encryptedNote = encrypt(note);
    await query(
      `UPDATE orders
       SET fulfillment_status = 'delivered',
           credential_encrypted = $1,
           delivered_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [encryptedNote, order.id]
    );

    const balancePaidStr =
      typeof invData.payable_amount === 'number'
        ? `Rp ${invData.payable_amount.toLocaleString('id-ID')}`
        : `Rp ${Number(order.product_price || 0).toLocaleString('id-ID')}`;
    const balanceLineBuyer = isBalancePayment
      ? `💳 <b>Dibayar via Saldo:</b> ${balancePaidStr}` +
        (typeof invData.balance_after === 'number'
          ? ` • Sisa Saldo: <b>Rp ${invData.balance_after.toLocaleString('id-ID')}</b>\n`
          : '\n')
      : '';

    const buyerMembershipMessage =
      `🎉 <b>SELAMAT! MEMBERSHIP VIP ANDA TELAH AKTIF! ⭐</b>\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `💎 <b>Paket:</b> ${escapeHtml(order.product_name)}\n` +
      `📅 <b>Masa Aktif:</b> Hingga <b>${formatWibDate(act.newExpiresAt)}</b>\n` +
      balanceLineBuyer +
      `━━━━━━━━━━━━━━━━━━━\n\n` +
      `🌟 <b>Keuntungan Eksklusif VIP Anda:</b>\n` +
      `• 🏷️ <b>Potongan Rp 1.000</b> untuk setiap pembelian akun digital.\n` +
      `• 📊 <b>Kuota Diskon Mingguan:</b> Rp 20.000 / minggu (Hemat s/d Rp 80.000+ per bulan!).\n` +
      `• ⚡ <b>Antrean Prioritas:</b> Pesanan diproses paling awal saat antrean manual.\n` +
      `• 🛡️ <b>Layanan Garansi VIP:</b> Klaim & penggantian akun lebih cepat.\n` +
      `• 🎁 <b>Promo & Restock Spesial:</b> Akses lebih awal ke akun langka.\n\n` +
      `🛒 <i>Mulai belanja akun premium dengan harga lebih murah sekarang lewat katalog bot!</i>`;

    await sendPreservedMessage(
      { chatId: order.telegram_id } as never,
      botInstance,
      buyerMembershipMessage,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🛍️ Buka Katalog Produk', callback_data: 'menu_products' }],
            [{ text: '👤 Cek Profil Saya', callback_data: 'menu_profile' }],
            [{ text: '🔙 Menu Utama', callback_data: 'menu_main' }],
          ],
        },
      }
    );

    // Notify Owner
    const ownerMembershipAlert =
      `💎 <b>PEMBELIAN MEMBERSHIP VIP BARU</b>\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `• <b>Kode Order:</b> <code>${escapeHtml(order.order_code)}</code>\n` +
      `• <b>Pembeli:</b> <code>${escapeHtml(order.telegram_id)}</code>\n` +
      `• <b>Paket:</b> ${escapeHtml(order.product_name)}\n` +
      `• <b>Metode Bayar:</b> ${isBalancePayment ? `💰 Saldo Akun (${balancePaidStr})` : '📱 QRIS'}\n` +
      `• <b>Masa Aktif:</b> s/d ${formatWibDate(act.newExpiresAt)}\n` +
      `━━━━━━━━━━━━━━━━━━━`;

    await sendSafeMessage(
      { chatId: ADMIN_TELEGRAM_ID } as never,
      botInstance,
      ownerMembershipAlert,
      { parse_mode: 'HTML' }
    );

    return {
      success: true,
      mode: 'deposit',
      message: 'VIP Membership activated successfully.',
      orderCode,
      deliveredKey: note,
    };
  }

  // 2c. Special Handling: Top-Up / Deposit Saldo
  if (order.product_name.toLowerCase().includes('deposit saldo') || order.product_name.toLowerCase().startsWith('deposit')) {
    const depositAmount = order.product_price;
    const cashback = Number(invData.voucher_cashback || 0);
    const totalCredit = depositAmount + cashback;

    await query(
      `UPDATE users SET balance = balance + $1 WHERE id = $2`,
      [totalCredit, order.user_id]
    );

    const cashbackNote = cashback > 0 ? ` (+Bonus Cashback Voucher Rp ${cashback.toLocaleString('id-ID')})` : '';
    const confirmationMsg = `Top-up saldo akun sebesar Rp ${depositAmount.toLocaleString('id-ID')}${cashbackNote} berhasil.`;
    const encryptedNote = encrypt(confirmationMsg);
    await query(
      `UPDATE orders
       SET fulfillment_status = 'delivered',
           credential_encrypted = $1,
           delivered_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [encryptedNote, order.id]
    );

    const buyerDepositMessage =
      `🎉 <b>DEPOSIT SALDO BERHASIL DITAMBAHKAN!</b>\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `💰 <b>Nominal Pokok:</b> Rp ${depositAmount.toLocaleString('id-ID')}\n` +
      (cashback > 0 ? `🎁 <b>Bonus Cashback Voucher:</b> +Rp ${cashback.toLocaleString('id-ID')} (<code>${escapeHtml(String(invData.voucher_code || 'VOUCHER'))}</code>)\n` : '') +
      `💳 <b>Total Saldo Masuk:</b> <b>Rp ${totalCredit.toLocaleString('id-ID')}</b>\n` +
      `🆔 <b>Kode Transaksi:</b> <code>${escapeHtml(order.order_code)}</code>\n` +
      `━━━━━━━━━━━━━━━━━━━\n\n` +
      `Saldo telah berhasil masuk ke akun DaFung Hub Anda. Silakan cek menu <b>👤 Profil</b> untuk melihat total saldo Anda.`;

    await sendPreservedMessage(
      { chatId: order.telegram_id } as never,
      botInstance,
      buyerDepositMessage,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '👤 Lihat Profil & Saldo', callback_data: 'menu_profile' }],
            [{ text: '🛍️ Beli Produk', callback_data: 'menu_products' }],
            [{ text: '🔙 Menu Utama', callback_data: 'menu_main' }],
          ],
        },
      }
    );

    // Notify Owner
    const ownerDepositAlert =
      `💰 <b>DEPOSIT USER BERHASIL MASUK</b>\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `• <b>Kode Order:</b> <code>${escapeHtml(order.order_code)}</code>\n` +
      `• <b>Pembeli:</b> <code>${escapeHtml(order.telegram_id)}</code>\n` +
      `• <b>Nominal Deposit:</b> <b>Rp ${depositAmount.toLocaleString('id-ID')}</b>\n` +
      (cashback > 0 ? `• <b>Cashback Voucher:</b> +Rp ${cashback.toLocaleString('id-ID')} (${escapeHtml(String(invData.voucher_code))})\n` : '') +
      `━━━━━━━━━━━━━━━━━━━`;

    await sendSafeMessage(
      { chatId: ADMIN_TELEGRAM_ID } as never,
      botInstance,
      ownerDepositAlert,
      { parse_mode: 'HTML' }
    );

    return {
      success: true,
      mode: 'deposit',
      message: 'Deposit balance credited successfully.',
      orderCode,
      deliveredKey: confirmationMsg,
    };
  }

  // 2d. Record VIP Discount usage if discount was applied on this order
  if (!wasPreviouslyPaid && (order.invoice_data as Record<string, unknown>)?.is_vip_discount) {
    await recordDiscountUsage(order.user_id, 1000);
  }

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

  const paidBalanceAmount =
    isBalancePayment && typeof invData.payable_amount === 'number'
      ? invData.payable_amount
      : null;
  const balanceAfterPayment =
    isBalancePayment && typeof invData.balance_after === 'number'
      ? invData.balance_after
      : null;
  const sellingPrice =
    isBalancePayment && paidBalanceAmount !== null
      ? paidBalanceAmount
      : order.product_price;
  const netProfit = Math.max(0, sellingPrice - modalPrice);
  const paymentMethodLineBuyer = isBalancePayment
    ? `💳 <b>Metode Bayar:</b> Saldo Akun (Rp ${sellingPrice.toLocaleString('id-ID')})` +
      (balanceAfterPayment !== null
        ? ` • Sisa Saldo: <b>Rp ${balanceAfterPayment.toLocaleString('id-ID')}</b>`
        : '') +
      `\n`
    : '';
  const paymentMethodLineOwner = `• <b>Metode Bayar:</b> ${isBalancePayment ? '💰 Saldo Akun (Hemat Rp 200)' : '📱 QRIS'}\n`;

  // 4. Check live supplier balance
  let currentBalance = 0;
  try {
    const balRes = await getSupplierBalance();
    currentBalance = balRes.balance || 0;
  } catch {
    currentBalance = 0;
  }

  // 4b. Check if product is manual / non-supplier
  const prodCheck = await query<{ is_manual: boolean }>(
    'SELECT is_manual FROM products WHERE id = $1 LIMIT 1',
    [order.product_id]
  ).catch(() => ({ rows: [] as Array<{ is_manual: boolean }> }));
  const isManualProduct = Boolean(prodCheck.rows?.[0]?.is_manual);

  const buyerChatId = order.telegram_id;

  // 5. DECISION: Instant H2H vs Queue Mode
  if (!isManualProduct && currentBalance >= modalPrice && modalPrice > 0) {
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
          paymentMethodLineBuyer +
          `━━━━━━━━━━━━━━━━━━━\n\n` +
          `🔑 <b>Kredensial / Lisensi Akun Anda:</b>\n` +
          `<code>${escapeHtml(deliveredKey)}</code>\n\n` +
          `📌 <i>Simpan kredensial ini baik-baik. Garansi berlaku sesuai ketentuan produk. Terima kasih telah berbelanja di DaFung Hub!</i>`;

        await sendPreservedMessage(
          { chatId: buyerChatId } as never,
          botInstance,
          buyerSuccessMessage,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📩 Riwayat Pesanan', callback_data: 'menu_orders' }, { text: '🛍️ Beli Produk Lain', callback_data: 'menu_products' }],
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
          paymentMethodLineOwner +
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

        // Broadcast successful order to Telegram channel
        broadcastOrderSuccess(order.order_code, botInstance).catch((bErr) => {
          console.warn('[Broadcast Warning] Failed to broadcast order success:', bErr);
        });

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
    `💰 <b>Total:</b> Rp ${sellingPrice.toLocaleString('id-ID')}${isBalancePayment ? ' <i>(Bayar via Saldo • Hemat Rp 200)</i>' : ''}\n` +
    (isBalancePayment && balanceAfterPayment !== null
      ? `💳 <b>Sisa Saldo:</b> <b>Rp ${balanceAfterPayment.toLocaleString('id-ID')}</b>\n`
      : '') +
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

  const memberInfo = await getUserMembership(order.user_id).catch(() => null);
  const vipPriorityBadge = memberInfo?.isVip ? ' ⭐ <b>[VIP MEMBER - PRIORITAS]</b>' : '';

  // Send Actionable Alert to Owner
  const ownerQueueAlert =
    `🔔 <b>PESANAN BARU MASUK (MODE ANTREAN)</b>\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `• <b>Kode Order:</b> <code>${escapeHtml(order.order_code)}</code> <i>(Sentuh untuk salin)</i>\n` +
    `• <b>Produk:</b> ${escapeHtml(order.product_name)}\n` +
    `• <b>Pembeli:</b> <code>${escapeHtml(buyerChatId)}</code>${vipPriorityBadge}\n` +
    paymentMethodLineOwner +
    `• <b>Uang Masuk:</b> Rp ${sellingPrice.toLocaleString('id-ID')}\n` +
    `• <b>Modal Supplier:</b> Rp ${modalPrice.toLocaleString('id-ID')}\n` +
    `• <b>Estimasi Untung:</b> <b>+Rp ${netProfit.toLocaleString('id-ID')}</b>\n` +
    `• <b>Saldo Supplier:</b> Rp ${currentBalance.toLocaleString('id-ID')} (Kurang)\n` +
    `━━━━━━━━━━━━━━━━━━━\n\n` +
    `👉 <i>Pilihan eksekusi pengiriman:</i>\n` +
    `1. Klik tombol <b>📋 Salin Kode Order</b> di bawah (1-klik salin untuk desktop & mobile).\n` +
    `2. Kirim manual ke pembeli dengan format:\n` +
    `   <code>/kirim ${escapeHtml(order.order_code)} &lt;email:password&gt;</code>\n` +
    `3. Atau klik <b>🚀 Proses via Supplier</b> setelah saldo supplier diisi.`;

  const ownerActionButtons = {
    inline_keyboard: [
      [
        {
          text: `📋 Salin Kode: ${order.order_code}`,
          copy_text: { text: order.order_code },
        },
      ],
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

export interface AdminFulfillMedia {
  hasMedia: boolean;
  type: 'document' | 'photo' | 'video' | 'audio' | 'voice' | 'sticker' | 'animation' | 'none';
  fileId?: string;
  fileName?: string;
  mimeType?: string;
  fromChatId?: number | string;
  messageId?: number;
}

/**
 * Admin Manual Fulfillment:
 * Owner fulfills the order manually using command `/kirim <orderCode> <credentials>`
 * Supports text credentials, document/file (.txt etc.), photos, or any media attachments.
 */
export async function adminManualFulfill(
  orderCode: string,
  credentialsText: string,
  botInstance: ExtendedBot,
  mediaData?: AdminFulfillMedia
): Promise<{ success: boolean; message: string }> {
  const hasMedia = Boolean(mediaData && mediaData.hasMedia && (mediaData.fileId || mediaData.messageId));
  const cleanKey = credentialsText?.trim() || '';

  if (!cleanKey && !hasMedia) {
    return {
      success: false,
      message:
        'Kredensial atau file akun tidak boleh kosong.\n\n' +
        '⚡ <b>Format pengiriman:</b>\n' +
        '• <b>Kirim file (.txt dll):</b> Upload file dengan caption <code>/kirim &lt;order_code&gt; [keterangan]</code> atau reply file tersebut.\n' +
        '• <b>Kirim teks biasa:</b> <code>/kirim &lt;order_code&gt; &lt;email:password&gt;</code>',
    };
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
    return { success: false, message: `Order "<code>${escapeHtml(orderCode)}</code>" tidak ditemukan.` };
  }

  const order = orderRes.rows[0];
  const storedCredential = hasMedia
    ? `[FILE: ${(mediaData!.type || 'MEDIA').toUpperCase()}${mediaData!.fileName ? ` - ${mediaData!.fileName}` : ''}] ${cleanKey}`
    : cleanKey;
  const encryptedKey = encrypt(storedCredential);

  await query(
    `UPDATE orders
     SET payment_status = 'paid',
         fulfillment_status = 'delivered',
         credential_encrypted = $1,
         delivered_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [encryptedKey, order.id]
  );

  // If order was unpaid, apply voucher usage now
  if (order.payment_status !== 'paid') {
    const invData = (order.invoice_data as Record<string, unknown>) || {};
    if (invData.voucher_id) {
      const { applyVoucherUsage } = await import('./voucher');
      const discountAmount = Number(invData.voucher_discount || invData.voucher_cashback || 0);
      await applyVoucherUsage({
        voucherId: String(invData.voucher_id),
        userId: order.user_id,
        orderId: order.id,
        discountAmount,
      }).catch(() => {});
    }
  }

  const buyerChatId = order.telegram_id;
  const replyMarkup = {
    inline_keyboard: [
      [
        { text: '📩 Riwayat Pesanan', callback_data: 'menu_orders' },
        { text: '🛍️ Beli Produk Baru', callback_data: 'menu_products' },
      ],
      [{ text: '🔙 Menu Utama', callback_data: 'menu_main' }],
    ],
  };

  // If media is present, deliver via Telegram API (document, photo, video, etc.)
  if (hasMedia && mediaData) {
    const { sendTelegramApi } = await import('./broadcast');

    const buyerCaption =
      `🎉 <b>PESANAN ANDA TELAH SELESAI!</b>\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `📦 <b>Produk:</b> ${escapeHtml(order.product_name)}\n` +
      `🆔 <b>Kode Order:</b> <code>${escapeHtml(order.order_code)}</code>\n` +
      `━━━━━━━━━━━━━━━━━━━\n\n` +
      `📁 <b>File Kredensial Terlampir:</b>\n` +
      `<code>${escapeHtml(mediaData.fileName || mediaData.type)}</code>\n` +
      (cleanKey ? `\n💬 <b>Keterangan / Detail:</b>\n<code>${escapeHtml(cleanKey)}</code>\n` : '') +
      `\n📌 <i>Simpan file ini baik-baik. Garansi berlaku sesuai ketentuan produk. Terima kasih telah berbelanja di DaFung Hub!</i>`;

    let deliveredMedia = false;
    let deliveredMediaMsgId: number | undefined;
    let deliveredFileId: string | undefined = mediaData.fileId;

    // 1. Try copyMessage if original messageId & fromChatId exist
    if (mediaData.messageId && mediaData.fromChatId) {
      const copyRes = await sendTelegramApi('copyMessage', {
        chat_id: buyerChatId,
        from_chat_id: mediaData.fromChatId,
        message_id: mediaData.messageId,
        caption: buyerCaption,
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      });
      if (copyRes.ok) {
        deliveredMedia = true;
        deliveredMediaMsgId = (copyRes.result as { message_id?: number } | undefined)?.message_id;
      }
    }

    // 2. Direct methods based on fileId if copyMessage didn't deliver
    if (!deliveredMedia && mediaData.fileId) {
      if (mediaData.type === 'document') {
        const docRes = await sendTelegramApi('sendDocument', {
          chat_id: buyerChatId,
          document: mediaData.fileId,
          caption: buyerCaption,
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        });
        if (docRes.ok) {
          deliveredMedia = true;
          const resData = docRes.result as { message_id?: number; document?: { file_id?: string } } | undefined;
          deliveredMediaMsgId = resData?.message_id;
          deliveredFileId = resData?.document?.file_id || deliveredFileId;
        }
      } else if (mediaData.type === 'photo') {
        const photoRes = await sendTelegramApi('sendPhoto', {
          chat_id: buyerChatId,
          photo: mediaData.fileId,
          caption: buyerCaption,
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        });
        if (photoRes.ok) {
          deliveredMedia = true;
          const resData = photoRes.result as { message_id?: number; photo?: Array<{ file_id?: string }> } | undefined;
          deliveredMediaMsgId = resData?.message_id;
          if (Array.isArray(resData?.photo) && resData.photo.length > 0) {
            deliveredFileId = resData.photo[resData.photo.length - 1]?.file_id || deliveredFileId;
          }
        }
      } else if (mediaData.type === 'video') {
        const vidRes = await sendTelegramApi('sendVideo', {
          chat_id: buyerChatId,
          video: mediaData.fileId,
          caption: buyerCaption,
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        });
        if (vidRes.ok) {
          deliveredMedia = true;
          const resData = vidRes.result as { message_id?: number; video?: { file_id?: string } } | undefined;
          deliveredMediaMsgId = resData?.message_id;
          deliveredFileId = resData?.video?.file_id || deliveredFileId;
        }
      } else if (mediaData.type === 'audio') {
        const audRes = await sendTelegramApi('sendAudio', {
          chat_id: buyerChatId,
          audio: mediaData.fileId,
          caption: buyerCaption,
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        });
        if (audRes.ok) {
          deliveredMedia = true;
          const resData = audRes.result as { message_id?: number; audio?: { file_id?: string } } | undefined;
          deliveredMediaMsgId = resData?.message_id;
          deliveredFileId = resData?.audio?.file_id || deliveredFileId;
        }
      } else if (mediaData.type === 'animation') {
        const animRes = await sendTelegramApi('sendAnimation', {
          chat_id: buyerChatId,
          animation: mediaData.fileId,
          caption: buyerCaption,
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        });
        if (animRes.ok) {
          deliveredMedia = true;
          const resData = animRes.result as { message_id?: number; animation?: { file_id?: string } } | undefined;
          deliveredMediaMsgId = resData?.message_id;
          deliveredFileId = resData?.animation?.file_id || deliveredFileId;
        }
      } else if (mediaData.type === 'voice') {
        const voiceRes = await sendTelegramApi('sendVoice', {
          chat_id: buyerChatId,
          voice: mediaData.fileId,
          caption: buyerCaption,
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        });
        if (voiceRes.ok) {
          deliveredMedia = true;
          const resData = voiceRes.result as { message_id?: number; voice?: { file_id?: string } } | undefined;
          deliveredMediaMsgId = resData?.message_id;
          deliveredFileId = resData?.voice?.file_id || deliveredFileId;
        }
      } else if (mediaData.type === 'sticker') {
        const stickerRes = await sendTelegramApi('sendSticker', {
          chat_id: buyerChatId,
          sticker: mediaData.fileId,
          reply_markup: replyMarkup,
        });
        if (stickerRes.ok) {
          deliveredMedia = true;
          const resData = stickerRes.result as { message_id?: number; sticker?: { file_id?: string } } | undefined;
          deliveredMediaMsgId = resData?.message_id;
          deliveredFileId = resData?.sticker?.file_id || deliveredFileId;
        }
      }
    }

    if (deliveredMediaMsgId) {
      markMessageAsPreserved(buyerChatId, deliveredMediaMsgId);
      await clearPreviousBotMessages(buyerChatId, botInstance, deliveredMediaMsgId);
    }

    if (deliveredFileId) {
      await query(
        `UPDATE orders
         SET invoice_data = jsonb_set(
           COALESCE(invoice_data::jsonb, '{}'::jsonb),
           '{delivered_media}',
           $1::jsonb
         )
         WHERE id = $2`,
        [
          JSON.stringify({
            type: mediaData.type,
            fileId: deliveredFileId,
            fileName: mediaData.fileName || (mediaData.type === 'photo' ? 'foto.jpg' : 'lampiran'),
            mimeType: mediaData.mimeType || null,
          }),
          order.id,
        ]
      ).catch((dmErr) => {
        console.warn('[Fulfillment] Failed to persist delivered_media metadata:', dmErr);
      });
    }

    // Fallback if media could not be forwarded directly: send preserved message alert to buyer
    if (!deliveredMedia) {
      await sendPreservedMessage(
        { chatId: buyerChatId } as never,
        botInstance,
        buyerCaption,
        {
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        }
      );
    }
  } else {
    // Standard text delivery
    const buyerMessage =
      `🎉 <b>PESANAN ANDA TELAH SELESAI!</b>\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `📦 <b>Produk:</b> ${escapeHtml(order.product_name)}\n` +
      `🆔 <b>Kode Order:</b> <code>${escapeHtml(order.order_code)}</code>\n` +
      `━━━━━━━━━━━━━━━━━━━\n\n` +
      `🔑 <b>Kredensial / Detail Akun:</b>\n` +
      `<code>${escapeHtml(cleanKey)}</code>\n\n` +
      `📌 <i>Terima kasih telah berbelanja di DaFung Hub! Hubungi admin jika butuh bantuan atau klaim garansi.</i>`;

    await sendPreservedMessage(
      { chatId: buyerChatId } as never,
      botInstance,
      buyerMessage,
      {
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      }
    );
  }

  // Broadcast successful order to Telegram channel
  broadcastOrderSuccess(order.order_code, botInstance).catch((bErr) => {
    console.warn('[Broadcast Warning] Failed to broadcast manual fulfillment:', bErr);
  });

  const mediaNote = hasMedia ? ` beserta file (<b>${escapeHtml(mediaData!.fileName || mediaData!.type)}</b>)` : '';
  return {
    success: true,
    message: `✅ Kredensial${mediaNote} untuk order <code>${escapeHtml(orderCode)}</code> berhasil dikirimkan ke pembeli!`,
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
  const result = await processOrderPayment(orderCode, botInstance, undefined, {
    allowRetryQueued: true,
  });

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

let lastSessionExpiredAlert = 0;

/**
 * Periodically or on-demand checks all recent unpaid ShopeePay orders against incoming transactions.
 * Also performs continuous session keep-alive pings to prevent ShopeePay idle timeouts.
 */
export async function checkAndProcessUnpaidShopeeOrders(
  botInstance: ExtendedBot
): Promise<number> {
  const gateway = (process.env.PAYMENT_GATEWAY || 'shopeepay').toLowerCase();
  if (gateway !== 'shopeepay') return 0;

  let confirmedCount = 0;
  try {
    const unpaidOrders = await query<Order & { product_price?: number | string | null }>(
      `SELECT o.*, p.price as product_price
       FROM orders o
       LEFT JOIN products p ON o.product_id = p.id
       WHERE o.payment_status = 'unpaid'
         AND o.created_at >= NOW() - INTERVAL '24 hours'
       ORDER BY o.created_at DESC
       LIMIT 10`
    );

    const expiredAlertMsg =
      `🚨 <b>PERINGATAN GATEWAY: Sesi ShopeePay Kedaluwarsa!</b>\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `Gateway melaporkan: <code>login timeout, please login again (code 200020)</code>.\n\n` +
      `🔧 <b>Solusi Cepat:</b>\n` +
      `Kirim token Shopee terbaru langsung ke chat ini dengan perintah:\n` +
      `<code>/settoken &lt;token_baru&gt;</code>\n\n` +
      `⚠️ <i>Untuk sementara, gunakan menu <b>⏳ Konfirmasi Order Belum Bayar</b> atau perintah <code>/konfirmasi &lt;kode_order&gt;</code>.</i>`;

    // If no unpaid orders in queue, perform lightweight keep-alive heartbeat ping to Shopee gateway
    if (unpaidOrders.rows.length === 0) {
      try {
        const { SHOPEEPAY_BASE_URL, SHOPEEPAY_API_KEY } = await import('./shopeepay');
        const baseUrl = SHOPEEPAY_BASE_URL.replace(/\/+$/, '');
        const pingRes = await fetch(`${baseUrl}/transactions?page_size=1`, {
          method: 'GET',
          headers: {
            'x-api-key': SHOPEEPAY_API_KEY,
            'Content-Type': 'application/json',
          },
        });
        if (!pingRes.ok) {
          const errData = await pingRes.json().catch(() => null);
          const errMsg = errData?.error || '';
          if (errMsg.includes('login timeout') || errData?.code === 200020) {
            const now = Date.now();
            if (now - lastSessionExpiredAlert > 2 * 60 * 60 * 1000) {
              lastSessionExpiredAlert = now;
              const { ADMIN_TELEGRAM_ID } = await import('./pricing');
              const { sendSafeMessage } = await import('../bot/handler');
              await sendSafeMessage(
                { chatId: ADMIN_TELEGRAM_ID } as never,
                botInstance,
                expiredAlertMsg,
                { parse_mode: 'HTML' }
              ).catch(() => {});
            }
          }
        }
      } catch {
        // Suppress ping error
      }
      return 0;
    }

    for (const ord of unpaidOrders.rows) {
      const invData =
        typeof ord.invoice_data === 'string'
          ? JSON.parse(ord.invoice_data || '{}')
          : (ord.invoice_data || {});

      const orderGateway = String(invData.gateway || gateway).toLowerCase();
      if (orderGateway !== 'shopeepay') continue;

      const actualAmount =
        Number(invData.payable_amount) ||
        Number(invData.amount) ||
        Number(ord.product_price) ||
        0;

      if (actualAmount > 0) {
        const { checkShopeePayPayment } = await import('./shopeepay');
        const checkResult = await checkShopeePayPayment({
          token: invData.token,
          orderCode: ord.order_code,
          amount: actualAmount,
          orderCreatedAt: ord.created_at,
        });

        if (checkResult.paid) {
          console.log(`[Auto-Check] Payment confirmed for order: ${ord.order_code}`);
          const txMeta =
            checkResult.transaction && typeof checkResult.transaction === 'object'
              ? (checkResult.transaction as Record<string, unknown>)
              : undefined;
          await processOrderPayment(ord.order_code, botInstance, txMeta);
          confirmedCount++;
        } else if (checkResult.status === 'gateway_session_expired') {
          const now = Date.now();
          if (now - lastSessionExpiredAlert > 2 * 60 * 60 * 1000) {
            lastSessionExpiredAlert = now;
            const { ADMIN_TELEGRAM_ID } = await import('./pricing');
            const { sendSafeMessage } = await import('../bot/handler');
            await sendSafeMessage(
              { chatId: ADMIN_TELEGRAM_ID } as never,
              botInstance,
              expiredAlertMsg,
              { parse_mode: 'HTML' }
            ).catch(() => {});
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Auto-Check] Error checking unpaid orders:', err);
  }
  return confirmedCount;
}
