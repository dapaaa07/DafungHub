import { Context } from 'node-telegram-bot-api';
import { query, getClient, Product, User } from '../../lib/db';
import { ExtendedBot, sendSafeMessage, sendSafePhoto } from '../handler';
import type { CheckoutPaymentMethod } from '../../lib/membership';
import type { Voucher } from '../../lib/voucher';

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
  const { isAdmin } = await import('../../lib/pricing');
  const cleanUsername = profile?.username ? profile.username.replace(/^@/, '') : null;
  const cleanFirstName = profile?.firstName || null;
  const targetRole = isAdmin(telegramId) ? 'admin' : 'buyer';

  const existingUser = await query<User>(
    'SELECT * FROM users WHERE telegram_id = $1 LIMIT 1',
    [telegramId]
  );

  if (existingUser.rows.length > 0) {
    const current = existingUser.rows[0];
    const shouldUpdateUsername = Boolean(cleanUsername && current.username !== cleanUsername);
    const shouldUpdateFirstName = Boolean(cleanFirstName && current.first_name !== cleanFirstName);

    if (shouldUpdateUsername || shouldUpdateFirstName) {
      const updated = await query<User>(
        `UPDATE users
         SET username = COALESCE($1, username),
             first_name = COALESCE($2, first_name)
         WHERE telegram_id = $3
         RETURNING *`,
        [cleanUsername, cleanFirstName, telegramId]
      ).catch(() => null);
      if (updated && updated.rows.length > 0) {
        return updated.rows[0];
      }
    }
    return current;
  }

  const insertUser = await query<User>(
    `INSERT INTO users (telegram_id, role, username, first_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (telegram_id) DO UPDATE SET
       username = COALESCE(EXCLUDED.username, users.username),
       first_name = COALESCE(EXCLUDED.first_name, users.first_name)
     RETURNING *`,
    [telegramId, targetRole, cleanUsername, cleanFirstName]
  );

  return insertUser.rows[0];
}

/**
 * Resolve & validate product for checkout (shared between payment method selector and order execution).
 * Sends an explanatory message and returns null if maintenance/channel-gate/access/stock validation fails.
 */
export async function resolveProductForCheckout(
  ctx: Context,
  productId: string,
  botInstance: ExtendedBot
): Promise<Product | null> {
  const { getBotStatus } = await import('../../lib/settings');
  const { isAdmin } = await import('../../lib/pricing');
  const status = await getBotStatus();
  if (status === 'maintenance' && !isAdmin(ctx.from?.id)) {
    const { sendMaintenanceMessage } = await import('../menu');
    await sendMaintenanceMessage(ctx, botInstance);
    return null;
  }

  // Verify channel membership for non-admin buyers
  const { checkUserChannelMembership, sendChannelJoinPrompt } = await import('../../lib/channel-gate');
  const isMember = await checkUserChannelMembership(ctx.from?.id, botInstance);
  if (!isMember) {
    await sendChannelJoinPrompt(ctx, botInstance);
    return null;
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
    return null;
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
          return null;
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
      return null;
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
    return null;
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
    return null;
  }

  return product;
}

export interface OrderPricingBreakdown {
  paymentMethod: CheckoutPaymentMethod;
  basePrice: number;
  vipDiscount: number;
  isVipDiscountApplied: boolean;
  voucher: Voucher | null;
  voucherDiscount: number;
  voucherCashback: number;
  balanceDiscount: number;
  isBalanceDiscountApplied: boolean;
  fee: number;
  priceAfterDiscounts: number;
  balancePayableAmount: number;
  isDeposit: boolean;
  isMembership: boolean;
}

/**
 * Compute checkout pricing including VIP discount, active voucher, and Saldo discount (Rp 200)
 * without mutating/consuming the pending voucher session.
 */
export async function calculateOrderPricing(params: {
  userId: string;
  telegramId: string;
  product: { id: string; name: string; price: number };
  paymentMethod: CheckoutPaymentMethod;
  explicitVoucherCode?: string;
}): Promise<OrderPricingBreakdown> {
  const {
    BALANCE_PAYMENT_DISCOUNT,
    calculateCheckoutPrice,
    isMembershipProduct,
    isDepositProduct,
  } = await import('../../lib/membership');
  const { getPendingUserVoucher, validateVoucherForTransaction } = await import('../../lib/voucher');

  const isMembership = isMembershipProduct(params.product.name);
  const isDeposit = isDepositProduct(params.product.name);

  const checkoutPricing = await calculateCheckoutPrice(
    params.telegramId,
    {
      name: params.product.name,
      price: params.product.price,
    },
    { paymentMethod: params.paymentMethod }
  );

  const voucherCode = params.explicitVoucherCode || getPendingUserVoucher(params.telegramId);
  let appliedVoucher: Voucher | null = null;
  let voucherDiscount = 0;
  let voucherCashback = 0;

  if (voucherCode) {
    const txnType = isDeposit ? 'deposit' : (isMembership ? 'membership' : 'product');
    const vResult = await validateVoucherForTransaction({
      code: voucherCode,
      userId: params.userId,
      telegramId: params.telegramId,
      transactionType: txnType,
      productName: params.product.name,
      productId: params.product.id,
      amount: checkoutPricing.basePrice,
    });

    if (vResult.valid && vResult.voucher) {
      appliedVoucher = vResult.voucher;
      voucherDiscount = vResult.discountAmount;
      voucherCashback = vResult.cashbackAmount;
    }
  }

  const priceAfterDiscounts = Math.max(
    0,
    checkoutPricing.basePrice - checkoutPricing.discount - voucherDiscount
  );

  const balanceDiscount =
    params.paymentMethod === 'balance' && !isDeposit
      ? Math.min(BALANCE_PAYMENT_DISCOUNT, priceAfterDiscounts)
      : 0;
  const balancePayableAmount = Math.max(0, priceAfterDiscounts - balanceDiscount);

  return {
    paymentMethod: params.paymentMethod,
    basePrice: checkoutPricing.basePrice,
    vipDiscount: checkoutPricing.discount,
    isVipDiscountApplied: checkoutPricing.isVipDiscountApplied,
    voucher: appliedVoucher,
    voucherDiscount,
    voucherCashback,
    balanceDiscount,
    isBalanceDiscountApplied: balanceDiscount > 0,
    fee: checkoutPricing.fee,
    priceAfterDiscounts,
    balancePayableAmount,
    isDeposit,
    isMembership,
  };
}

/**
 * Handle product purchase using either dynamic QRIS or account balance (Saldo)
 */
export async function handleBuy(
  ctx: Context,
  productId: string,
  botInstance: ExtendedBot,
  explicitVoucherCode?: string,
  paymentMethod: CheckoutPaymentMethod = 'qris'
): Promise<void> {
  const product = await resolveProductForCheckout(ctx, productId, botInstance);
  if (!product) {
    return;
  }

  // Ensure user exists in users table
  const chatId = ctx.chatId || ctx.callbackQuery?.message?.chat?.id || ctx.message?.chat?.id || ctx.from?.id;
  const telegramId = ctx.from?.id ? String(ctx.from.id) : String(chatId);
  const user = await ensureUser(telegramId, {
    username: ctx.from?.username,
    firstName: ctx.from?.first_name,
  });

  const pricing = await calculateOrderPricing({
    userId: user.id,
    telegramId,
    product,
    paymentMethod,
    explicitVoucherCode,
  });

  const { clearPendingUserVoucher } = await import('../../lib/voucher');

  // === PAYMENT METHOD 1: ACCOUNT BALANCE (SALDO) ===
  if (paymentMethod === 'balance') {
    if (pricing.isDeposit) {
      await sendSafeMessage(
        ctx,
        botInstance,
        '⚠️ <b>Metode Tidak Tersedia:</b> Top-up deposit saldo hanya dapat dibayar menggunakan QRIS.',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📱 Bayar Deposit pakai QRIS', callback_data: `pay_qris:${product.id}` }],
              [{ text: '🔙 Menu Utama', callback_data: 'menu_main' }],
            ],
          },
        }
      );
      return;
    }

    const payableWithBalance = pricing.balancePayableAmount;
    const orderCode = generateOrderCode();
    const client = await getClient();
    let balanceBefore = Number(user.balance ?? 0);
    let balanceAfter = balanceBefore;

    try {
      await client.query('BEGIN');

      const deductRes = await client.query<{ balance: number }>(
        `UPDATE users
         SET balance = balance - $1
         WHERE id = $2 AND COALESCE(balance, 0) >= $1
         RETURNING balance`,
        [payableWithBalance, user.id]
      );

      if (deductRes.rows.length === 0) {
        const latestBalRes = await client.query<{ balance: number }>(
          'SELECT COALESCE(balance, 0)::int as balance FROM users WHERE id = $1 LIMIT 1',
          [user.id]
        );
        const latestBalance = Number(latestBalRes.rows[0]?.balance ?? user.balance ?? 0);
        await client.query('ROLLBACK');

        const shortfall = Math.max(0, payableWithBalance - latestBalance);
        const qrisDisplayPrice = pricing.priceAfterDiscounts;
        await sendSafeMessage(
          ctx,
          botInstance,
          `⚠️ <b>SALDO AKUN TIDAK MENCUKUPI</b>\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `📦 <b>Produk:</b> ${escapeHtml(product.name)}\n` +
          `💰 <b>Total Bayar (Saldo -Rp ${pricing.balanceDiscount.toLocaleString('id-ID')}):</b> <b>Rp ${payableWithBalance.toLocaleString('id-ID')}</b>\n` +
          `💳 <b>Saldo Anda:</b> <b>Rp ${latestBalance.toLocaleString('id-ID')}</b>\n` +
          `❗ <b>Kurang:</b> <b>Rp ${shortfall.toLocaleString('id-ID')}</b>\n` +
          `━━━━━━━━━━━━━━━━━━━\n\n` +
          `Silakan Top Up saldo terlebih dahulu atau lanjutkan pembayaran via QRIS:`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '💰 Saldo (tidak mencukupi | Top up sekarang)', callback_data: 'menu_deposit' }],
                [{ text: `📱 Bayar dengan QRIS (Rp ${qrisDisplayPrice.toLocaleString('id-ID')})`, callback_data: `pay_qris:${product.id}` }],
                [{ text: '🔙 Menu Utama', callback_data: 'menu_main' }],
              ],
            },
          }
        );
        return;
      }

      balanceAfter = Number(deductRes.rows[0].balance ?? 0);
      balanceBefore = balanceAfter + payableWithBalance;

      await client.query(
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
            payment_method: 'balance',
            gateway: 'balance',
            customer_username: ctx.from?.username || null,
            customer_first_name: ctx.from?.first_name || null,
            base_price: pricing.basePrice,
            discount: pricing.vipDiscount,
            balance_discount: pricing.balanceDiscount,
            fee: 0,
            unique_code: 0,
            payable_amount: payableWithBalance,
            paid_with_balance: payableWithBalance,
            balance_before: balanceBefore,
            balance_after: balanceAfter,
            is_vip_discount: pricing.isVipDiscountApplied,
            is_balance_discount: pricing.isBalanceDiscountApplied,
            voucher_id: pricing.voucher ? pricing.voucher.id : null,
            voucher_code: pricing.voucher ? pricing.voucher.code : null,
            voucher_discount: pricing.voucherDiscount,
            voucher_cashback: pricing.voucherCashback,
          }),
        ]
      );

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[Buy Command] Balance transaction error:', txErr);
      await sendSafeMessage(
        ctx,
        botInstance,
        '❌ Gagal memproses pembayaran menggunakan saldo. Saldo Anda tetap aman. Silakan coba kembali.',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Coba Lagi', callback_data: `buy_${product.id}` }],
              [{ text: '🔙 Menu Utama', callback_data: 'menu_main' }],
            ],
          },
        }
      );
      return;
    } finally {
      client.release();
    }

    if (pricing.voucher) {
      clearPendingUserVoucher(telegramId);
    }

    try {
      const { processOrderPayment } = await import('../../lib/fulfillment');
      await processOrderPayment(orderCode, botInstance, { transactionId: `BAL-${orderCode}` });
    } catch (fulfillErr) {
      console.error('[Buy Command] Post-balance payment fulfillment error:', fulfillErr);
      const statusCheck = await query<{ payment_status: string }>(
        'SELECT payment_status FROM orders WHERE order_code = $1 LIMIT 1',
        [orderCode]
      ).catch(() => ({ rows: [] as Array<{ payment_status: string }> }));

      if (statusCheck.rows[0]?.payment_status === 'unpaid') {
        await query(
          'UPDATE users SET balance = balance + $1 WHERE id = $2',
          [payableWithBalance, user.id]
        ).catch(() => {});
        await query(
          "UPDATE orders SET payment_status = 'expired' WHERE order_code = $1",
          [orderCode]
        ).catch(() => {});
        await sendSafeMessage(
          ctx,
          botInstance,
          '❌ Terjadi kendala saat memproses pesanan. Saldo Anda telah dikembalikan otomatis.',
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔄 Coba Lagi', callback_data: `buy_${product.id}` }],
                [{ text: '🔙 Menu Utama', callback_data: 'menu_main' }],
              ],
            },
          }
        );
      }
    }
    return;
  }

  // === PAYMENT METHOD 2: DYNAMIC QRIS ===
  const baseWithFee = pricing.priceAfterDiscounts + pricing.fee;
  const { generateUniqueCheckoutAmount } = await import('../../lib/unique-code');
  const { payableAmount, uniqueCode } = await generateUniqueCheckoutAmount(baseWithFee);

  // Generate unique order_code
  const orderCode = generateOrderCode();

  // Create dynamic QRIS transaction via configured gateway
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
            [{ text: '🔄 Coba Lagi', callback_data: `pay_qris:${product.id}` }],
            [{ text: '🛍️ Buka Katalog Produk', callback_data: 'menu_products' }],
            [{ text: '🔙 Menu Utama', callback_data: 'menu_main' }],
          ],
        },
      }
    );
    return;
  }

  if (pricing.voucher) {
    clearPendingUserVoucher(telegramId);
  }

  // Insert order into PostgreSQL `orders` table
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
        payment_method: 'qris',
        customer_username: ctx.from?.username || null,
        customer_first_name: ctx.from?.first_name || null,
        qr_code_url: qrisResult.qrCodeUrl,
        qr_string: qrisResult.qrString,
        checkout_url: qrisResult.checkoutUrl,
        base_price: pricing.basePrice,
        discount: pricing.vipDiscount,
        balance_discount: 0,
        fee: pricing.fee,
        unique_code: uniqueCode,
        payable_amount: payableAmount,
        is_vip_discount: pricing.isVipDiscountApplied,
        is_balance_discount: false,
        voucher_id: pricing.voucher ? pricing.voucher.id : null,
        voucher_code: pricing.voucher ? pricing.voucher.code : null,
        voucher_discount: pricing.voucherDiscount,
        voucher_cashback: pricing.voucherCashback,
      }),
    ]
  );

  // Format invoice message & send QRIS
  const formattedPrice = `Rp ${payableAmount.toLocaleString('id-ID')}`;
  let discountLabels = '';
  if (pricing.isVipDiscountApplied) {
    discountLabels += ` <i>(Hemat Rp 1.000 via VIP Member! 🌟)</i>`;
  }
  if (pricing.voucherDiscount > 0 && pricing.voucher) {
    discountLabels += ` <i>(Diskon Voucher ${escapeHtml(pricing.voucher.code)}: -Rp ${pricing.voucherDiscount.toLocaleString('id-ID')}! 🎟️)</i>`;
  }
  if (pricing.voucherCashback > 0 && pricing.voucher) {
    discountLabels += ` <i>(Bonus Cashback ${escapeHtml(pricing.voucher.code)}: +Rp ${pricing.voucherCashback.toLocaleString('id-ID')}! 🎁)</i>`;
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
    if (voucherCode) {
      await handleBuy(ctx, productId, botInstance, voucherCode);
      return;
    }
    const { sendCheckoutMethodMenu } = await import('../menu');
    await sendCheckoutMethodMenu(ctx, botInstance, productId);
  });
}
