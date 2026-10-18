import { Context } from 'node-telegram-bot-api';
import { query, Product, User } from '../../lib/db';
import { ExtendedBot, sendSafeMessage, sendSafePhoto } from '../handler';

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
 * Generate a unique order code with format: ORD-<timestamp>-<5randomChars>
 */
export function generateOrderCode(): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `ORD-${timestamp}-${randomSuffix}`;
}

/**
 * Ensure a Telegram user exists in the PostgreSQL `users` table
 */
export async function ensureUser(
  telegramId: string,
  profile?: { username?: string; firstName?: string }
): Promise<User> {
  const cleanUsername = profile?.username ? profile.username.replace(/^@/, '') : null;
  const cleanFirstName = profile?.firstName || null;

  const existingUser = await query<User>(
    'SELECT * FROM users WHERE telegram_id = $1',
    [telegramId]
  );

  if (existingUser.rows.length > 0) {
    if (cleanUsername || cleanFirstName) {
      await query(
        `UPDATE users
         SET username = COALESCE($1, username),
             first_name = COALESCE($2, first_name)
         WHERE telegram_id = $3`,
        [cleanUsername, cleanFirstName, telegramId]
      ).catch(() => {});
    }
    return existingUser.rows[0];
  }

  const insertUser = await query<User>(
    `INSERT INTO users (telegram_id, role, username, first_name)
     VALUES ($1, 'buyer', $2, $3)
     ON CONFLICT (telegram_id) DO UPDATE SET
       username = COALESCE(EXCLUDED.username, users.username),
       first_name = COALESCE(EXCLUDED.first_name, users.first_name)
     RETURNING *`,
    [telegramId, cleanUsername, cleanFirstName]
  );

  return insertUser.rows[0];
}

/**
 * Handle product purchase and generate Midtrans dynamic QRIS invoice
 */
export async function handleBuy(
  ctx: Context,
  productId: string,
  botInstance: ExtendedBot,
  explicitVoucherCode?: string
): Promise<void> {
  const { getBotStatus } = await import('../../lib/settings');
  const { isAdmin } = await import('../../lib/pricing');
  const status = await getBotStatus();
  if (status === 'maintenance' && !isAdmin(ctx.from?.id)) {
    const { sendMaintenanceMessage } = await import('../menu');
    await sendMaintenanceMessage(ctx, botInstance);
    return;
  }

  // Verify channel membership for non-admin buyers
  const { checkUserChannelMembership, sendChannelJoinPrompt } = await import('../../lib/channel-gate');
  const isMember = await checkUserChannelMembership(ctx.from?.id, botInstance);
  if (!isMember) {
    await sendChannelJoinPrompt(ctx, botInstance);
    return;
  }

  const trimmedId = productId?.trim();

  if (!trimmedId) {
    await sendSafeMessage(
      ctx,
      botInstance,
      '⚠️ <b>Format Pembelian Produk:</b>\n' +
      'Silakan pilih produk dari menu katalog di bawah:',
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🛍️ Buka Katalog Produk', callback_data: 'menu_products' }],
            [{ text: '🔙 Menu Utama', callback_data: 'menu_main' }],
          ],
        },
      }
    );
    return;
  }

  // 1. Fetch product from database or supplier catalogue
  let product: Product | null = null;
  const { getEffectiveSellingPrice } = await import('../../lib/pricing');
  const { getCustomPrices } = await import('../../lib/custom-prices');
  const customPrices = await getCustomPrices().catch(() => new Map<string, number>());

  try {
    const res = await query<Product>(
      'SELECT * FROM products WHERE id = $1 AND is_active = true',
      [trimmedId]
    );
    if (res.rows.length > 0) {
      product = res.rows[0];
    }
  } catch {
    product = null;
  }

  // If not found in DB, check if it is a membership package purchase
  if (!product && trimmedId.startsWith('membership_')) {
    try {
      const { findMembershipPackage } = await import('../../lib/membership');
      const pkgId = trimmedId.replace('membership_', '');
      const pkg = findMembershipPackage(pkgId);
      if (pkg) {
        const existingByName = await query<Product>(
          'SELECT * FROM products WHERE name = $1 LIMIT 1',
          [pkg.name]
        );
        if (existingByName.rows.length > 0) {
          product = existingByName.rows[0];
          if (product.price !== pkg.price) {
            product.price = pkg.price;
            await query('UPDATE products SET price = $1 WHERE id = $2', [pkg.price, product.id]).catch(() => {});
          }
        } else {
          const ins = await query<Product>(
            `INSERT INTO products (name, price, stock, is_active)
             VALUES ($1, $2, 9999, true)
             RETURNING *`,
            [pkg.name, pkg.price]
          );
          product = ins.rows[0];
        }
      }
    } catch (mErr) {
      console.error('[Buy Command] Error resolving membership package:', mErr);
    }
  }

  // If not found in local DB, check supplier API catalogue
  if (!product) {
    try {
      const isCallerAdmin = isAdmin(ctx.from?.id);
      const { getSupplierProducts, isTestProduct } = await import('../../lib/supplier');
      const supplierProducts = await getSupplierProducts(isCallerAdmin).catch(() => []);
      const supp = supplierProducts.find(
        (p) => p.id === trimmedId || p.name.toLowerCase() === trimmedId.toLowerCase()
      );
      if (supp) {
        if (isTestProduct(supp) && !isCallerAdmin) {
          await sendSafeMessage(
            ctx,
            botInstance,
            '⚠️ <b>Akses Ditolak:</b> Produk ini adalah produk pengujian khusus untuk Administrator.',
            {
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🛍️ Buka Katalog Produk', callback_data: 'menu_products' }],
                  [{ text: '🔙 Menu Utama', callback_data: 'menu_main' }],
                ],
              },
            }
          );
          return;
        }

        const effectivePrice = getEffectiveSellingPrice(supp, customPrices);
        const existingByName = await query<Product>(
          'SELECT * FROM products WHERE name = $1 LIMIT 1',
          [supp.name]
        );
        if (existingByName.rows.length > 0) {
          product = existingByName.rows[0];
          if (product.price !== effectivePrice) {
            product.price = effectivePrice;
            await query(
              'UPDATE products SET price = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
              [effectivePrice, product.id]
            ).catch(() => {});
          }
        } else {
          const ins = await query<Product>(
            `INSERT INTO products (name, price, stock, is_active)
             VALUES ($1, $2, $3, true)
             RETURNING *`,
            [supp.name, effectivePrice, supp.availability === 'in_stock' ? 50 : 0]
          );
          product = ins.rows[0];
        }
      }
    } catch {
      // Ignore supplier lookup failure
    }
  } else {
    // If product was found in local DB, check if it is the test API product & caller is not admin
    const isTestApi =
      product?.id?.startsWith('loc_test') ||
      product?.id === 'test' ||
      /\btest api\b/i.test(product?.name || '');
    if (isTestApi && !isAdmin(ctx.from?.id)) {
      await sendSafeMessage(
        ctx,
        botInstance,
        '⚠️ <b>Akses Ditolak:</b> Produk ini adalah produk pengujian khusus untuk Administrator.',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🛍️ Buka Katalog Produk', callback_data: 'menu_products' }],
              [{ text: '🔙 Menu Utama', callback_data: 'menu_main' }],
            ],
          },
        }
      );
      return;
    }
    // If product was found in local DB, check if custom price override is set
    const hasOverride = customPrices.has(product.id) || (product.name && customPrices.has(product.name));
    if (hasOverride) {
      const customPrice = customPrices.get(product.id) ?? customPrices.get(product.name!);
      if (customPrice && product.price !== customPrice) {
        product.price = customPrice;
        await query(
          'UPDATE products SET price = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [customPrice, product.id]
        ).catch(() => {});
      }
    }
  }

  if (!product) {
    await sendSafeMessage(
      ctx,
      botInstance,
      `❌ Produk dengan ID "<b>${escapeHtml(trimmedId)}</b>" tidak ditemukan atau sudah tidak aktif.`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🛍️ Buka Katalog Produk', callback_data: 'menu_products' }],
            [{ text: '🔙 Menu Utama', callback_data: 'menu_main' }],
          ],
        },
      }
    );
    return;
  }

  // 2. Validate product stock
  if (product.stock <= 0) {
    await sendSafeMessage(
      ctx,
      botInstance,
      `❌ Maaf, stok untuk produk "<b>${escapeHtml(product.name)}</b>" saat ini sedang habis.`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🛍️ Lihat Produk Lain', callback_data: 'menu_products' }],
            [{ text: '🔙 Menu Utama', callback_data: 'menu_main' }],
          ],
        },
      }
    );
    return;
  }

  // 3. Ensure user exists in users table
  const chatId = ctx.chatId || ctx.callbackQuery?.message?.chat?.id || ctx.message?.chat?.id || ctx.from?.id;
  const telegramId = ctx.from?.id ? String(ctx.from.id) : String(chatId);
  const user = await ensureUser(telegramId, {
    username: ctx.from?.username,
    firstName: ctx.from?.first_name,
  });

  // 4. Calculate checkout pricing (VIP discount + hidden fee Rp 100)
  const { calculateCheckoutPrice, isMembershipProduct, isDepositProduct } = await import('../../lib/membership');
  const checkoutPricing = await calculateCheckoutPrice(telegramId, {
    name: product.name,
    price: product.price,
  });

  // Check for applied voucher (explicit parameter or active session)
  const { getPendingUserVoucher, clearPendingUserVoucher, validateVoucherForTransaction } = await import('../../lib/voucher');
  const voucherCode = explicitVoucherCode || getPendingUserVoucher(telegramId);
  let appliedVoucher: any = null;
  let voucherDiscount = 0;
  let voucherCashback = 0;

  if (voucherCode) {
    const isMembership = isMembershipProduct(product.name);
    const isDeposit = isDepositProduct(product.name);
    const txnType = isDeposit ? 'deposit' : (isMembership ? 'membership' : 'product');

    const vResult = await validateVoucherForTransaction({
      code: voucherCode,
      userId: user.id,
      telegramId,
      transactionType: txnType,
      productName: product.name,
      productId: product.id,
      amount: checkoutPricing.basePrice,
    });

    if (vResult.valid && vResult.voucher) {
      appliedVoucher = vResult.voucher;
      voucherDiscount = vResult.discountAmount;
      voucherCashback = vResult.cashbackAmount;
      clearPendingUserVoucher(telegramId);
    }
  }

  // Calculate final payable amount: (base - vipDiscount - voucherDiscount) + hidden fee + unique code
  const priceAfterDiscounts = Math.max(0, checkoutPricing.basePrice - checkoutPricing.discount - voucherDiscount);
  const baseWithFee = priceAfterDiscounts + checkoutPricing.fee;

  const { generateUniqueCheckoutAmount } = await import('../../lib/unique-code');
  const { payableAmount, uniqueCode } = await generateUniqueCheckoutAmount(baseWithFee);

  // 5. Generate unique order_code
  const orderCode = generateOrderCode();

  // 6. Create dynamic QRIS transaction via Sakurupiah (with Midtrans fallback)
  let qrisResult: {
    qrCodeUrl: string;
    qrString: string;
    checkoutUrl?: string;
    raw?: Record<string, unknown>;
  };

  try {
    const gateway = (process.env.PAYMENT_GATEWAY || 'shopeepay').toLowerCase();
    if (gateway === 'shopeepay') {
      const { createShopeePayInvoice } = await import('../../lib/shopeepay');
      qrisResult = await createShopeePayInvoice(orderCode, payableAmount);
    } else if (gateway === 'midtrans') {
      const { createQrisTransaction } = await import('../../lib/midtrans');
      qrisResult = await createQrisTransaction(orderCode, payableAmount);
    } else {
      const { createSakurupiahInvoice } = await import('../../lib/sakurupiah');
      // Ambil username Telegram buyer untuk data customerName di Sakurupiah
      const telegramUsername = ctx.from?.username
        ? `@${ctx.from.username}`
        : (ctx.from?.first_name || `User_${ctx.from?.id || 'Buyer'}`);

      qrisResult = await createSakurupiahInvoice(
        orderCode,
        payableAmount,
        product.name,
        telegramUsername
      );
    }
  } catch (error) {
    console.error('[Buy Command] Failed to create QRIS transaction:', error);
    await sendSafeMessage(
      ctx,
      botInstance,
      '❌ Gagal membuat invoice pembayaran QRIS. Silakan coba beberapa saat lagi.',
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Coba Lagi', callback_data: `buy_${trimmedId}` }],
            [{ text: '🛍️ Buka Katalog Produk', callback_data: 'menu_products' }],
            [{ text: '🔙 Menu Utama', callback_data: 'menu_main' }],
          ],
        },
      }
    );
    return;
  }

  // 7. Insert order into PostgreSQL `orders` table
  await query(
    `INSERT INTO orders (
       user_id,
       product_id,
       order_code,
       payment_status,
       fulfillment_status,
       invoice_data
     ) VALUES ($1, $2, $3, 'unpaid', 'pending', $4)`,
    [
      user.id,
      product.id,
      orderCode,
      JSON.stringify({
        ...(qrisResult.raw || {}),
        customer_username: ctx.from?.username || null,
        customer_first_name: ctx.from?.first_name || null,
        qr_code_url: qrisResult.qrCodeUrl,
        qr_string: qrisResult.qrString,
        checkout_url: qrisResult.checkoutUrl,
        base_price: checkoutPricing.basePrice,
        discount: checkoutPricing.discount,
        fee: checkoutPricing.fee,
        unique_code: uniqueCode,
        payable_amount: payableAmount,
        is_vip_discount: checkoutPricing.isVipDiscountApplied,
        voucher_id: appliedVoucher ? appliedVoucher.id : null,
        voucher_code: appliedVoucher ? appliedVoucher.code : null,
        voucher_discount: voucherDiscount,
        voucher_cashback: voucherCashback,
      }),
    ]
  );

  // 8. Format invoice message & send QRIS
  const formattedPrice = `Rp ${payableAmount.toLocaleString('id-ID')}`;
  let discountLabels = '';
  if (checkoutPricing.isVipDiscountApplied) {
    discountLabels += ` <i>(Hemat Rp 1.000 via VIP Member! 🌟)</i>`;
  }
  if (voucherDiscount > 0 && appliedVoucher) {
    discountLabels += ` <i>(Diskon Voucher ${escapeHtml(appliedVoucher.code)}: -Rp ${voucherDiscount.toLocaleString('id-ID')}! 🎟️)</i>`;
  }
  if (voucherCashback > 0 && appliedVoucher) {
    discountLabels += ` <i>(Bonus Cashback ${escapeHtml(appliedVoucher.code)}: +Rp ${voucherCashback.toLocaleString('id-ID')}! 🎁)</i>`;
  }

  const invoiceCaption =
    '🧾 <b>INVOICE PEMBAYARAN QRIS</b>\n' +
    '━━━━━━━━━━━━━━━━━━━\n' +
    `📦 <b>Produk:</b> ${escapeHtml(product.name)}\n` +
    `💰 <b>Total:</b> ${escapeHtml(formattedPrice)}${discountLabels}\n` +
    `🆔 <b>Kode Order:</b> <code>${escapeHtml(orderCode)}</code>\n` +
    '━━━━━━━━━━━━━━━━━━━\n\n' +
    '📌 <b>Instruksi Pembayaran:</b>\n' +
    '1. Scan kode QRIS di atas menggunakan GoPay, OVO, Dana, ShopeePay, BCA, atau Mobile Banking lainnya.\n' +
    '2. Pastikan nominal pembayaran sesuai.\n' +
    '3. Setelah pembayaran berhasil, kredensial akun akan dikirimkan otomatis ke sini.\n' +
    '4. Cek status pembayaran kapan saja dengan menekan tombol <b>🔄 Cek Status Pembayaran</b> di bawah.';

  const inlineKeyboardRows: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [
    [{ text: '🔄 Cek Status Pembayaran', callback_data: `status_${orderCode}` }],
  ];

  if (qrisResult.checkoutUrl) {
    inlineKeyboardRows.push([
      { text: '🌐 Buka Link Pembayaran (Web)', url: qrisResult.checkoutUrl },
    ]);
  }

  inlineKeyboardRows.push([
    { text: '🛍️ Beli Produk Lain', callback_data: 'menu_products' },
    { text: '🔙 Menu Utama', callback_data: 'menu_main' },
  ]);

  const invoiceButtons = {
    inline_keyboard: inlineKeyboardRows,
  };

  // Generate local high-resolution QR PNG buffer for guaranteed instant delivery
  let qrPhotoPayload: unknown = qrisResult.qrCodeUrl;
  if (qrisResult.qrString) {
    try {
      const { generateQrPngBuffer } = await import('../../lib/shopeepay');
      const buf = await generateQrPngBuffer(qrisResult.qrString);
      if (buf && buf.length > 0) {
        qrPhotoPayload = buf;
      }
    } catch (qrErr) {
      console.warn('[Buy Command] Failed to generate local QR PNG buffer, using URL:', qrErr);
    }
  }

  if (qrPhotoPayload) {
    try {
      const photoSent = await sendSafePhoto(ctx, botInstance, qrPhotoPayload, {
        caption: invoiceCaption,
        parse_mode: 'HTML',
        reply_markup: invoiceButtons,
      });
      if (photoSent) return;
    } catch (photoErr) {
      console.warn('[Buy Command] sendSafePhoto failed, falling back to message text:', photoErr);
    }
  }

  // Clean fallback without exposing raw QR strings or static decoded links
  await sendSafeMessage(ctx, botInstance, invoiceCaption, {
    parse_mode: 'HTML',
    reply_markup: invoiceButtons,
  });
}

/**
 * Register the /buy command into the bot
 */
export function registerBuyHandler(botInstance: ExtendedBot): void {
  // Command: /buy <product_id> [voucher_code]
  botInstance.command('buy', async (ctx: Context) => {
    const text = ctx.message?.text || '';
    const parts = text.trim().split(/\s+/);
    const productId = parts[1] || '';
    const voucherCode = parts[2] || undefined;
    await handleBuy(ctx, productId, botInstance, voucherCode);
  });
}
