import { query, getClient, Product, User } from './db';
import { calculateCheckoutPrice, CheckoutPaymentMethod } from './membership';
import { validateVoucherForTransaction, Voucher } from './voucher';
import { getCustomPrices } from './custom-prices';
import { getEffectiveSellingPrice } from './pricing';
import { generateUniqueCheckoutAmount } from './unique-code';

export function generateOrderCode(): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `ORD-${timestamp}-${randomSuffix}`;
}

export interface WebProductPricing {
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
  payableAmount: number;
  uniqueCode: number;
  isDeposit: boolean;
  isMembership: boolean;
}

/**
 * Resolve product for web checkout: checks local DB, membership packages, and supplier catalog
 */
export async function resolveWebProduct(productId: string): Promise<Product | null> {
  const trimmedId = productId?.trim();
  if (!trimmedId) return null;

  const customPrices = await getCustomPrices().catch(() => new Map<string, number>());
  let product: Product | null = null;

  // 1. Direct query in database
  try {
    const res = await query<Product>(
      'SELECT * FROM products WHERE id = $1 AND is_active = true LIMIT 1',
      [trimmedId]
    );
    if (res.rows.length > 0) {
      product = res.rows[0];
    }
  } catch {
    product = null;
  }

  // 2. If not found in DB, check if membership package
  if (!product && trimmedId.startsWith('membership_')) {
    try {
      const { findMembershipPackage } = await import('./membership');
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
      console.error('[Web Order] Error resolving membership package:', mErr);
    }
  }

  // 2b. If deposit product (e.g. deposit_10000 or dep_10000)
  if (!product && (trimmedId.startsWith('deposit_') || trimmedId.startsWith('dep_'))) {
    try {
      const amount = parseInt(trimmedId.replace(/^(deposit_|dep_)/, ''), 10);
      if (amount && !isNaN(amount) && amount >= 1000) {
        const prodName = `Deposit Saldo Rp ${amount.toLocaleString('id-ID')}`;
        const existingByName = await query<Product>(
          'SELECT * FROM products WHERE name = $1 LIMIT 1',
          [prodName]
        );
        if (existingByName.rows.length > 0) {
          product = existingByName.rows[0];
          if (product.price !== amount) {
            product.price = amount;
            await query('UPDATE products SET price = $1 WHERE id = $2', [amount, product.id]).catch(() => {});
          }
        } else {
          const ins = await query<Product>(
            `INSERT INTO products (name, price, stock, is_active)
             VALUES ($1, $2, 9999, true)
             RETURNING *`,
            [prodName, amount]
          );
          product = ins.rows[0];
        }
      }
    } catch (dErr) {
      console.error('[Web Order] Error resolving deposit product:', dErr);
    }
  }

  // 3. If not found in DB, check supplier catalog
  if (!product) {
    try {
      const { getSupplierProducts } = await import('./supplier');
      const supplierProducts = await getSupplierProducts(false).catch(() => []);
      const supp = supplierProducts.find(
        (p) =>
          p.id === trimmedId ||
          p.name.toLowerCase() === trimmedId.toLowerCase()
      );

      if (supp) {
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
    // Custom price override check
    const hasOverride = customPrices.has(product.id) || (product.name && customPrices.has(product.name));
    if (hasOverride) {
      const customPrice = customPrices.get(product.id) ?? customPrices.get(product.name);
      if (customPrice && product.price !== customPrice) {
        product.price = customPrice;
        await query(
          'UPDATE products SET price = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [customPrice, product.id]
        ).catch(() => {});
      }
    }
  }

  return product;
}

/**
 * Calculate pricing for web order
 */
export async function calculateWebPricing(params: {
  userId: string;
  product: Product;
  paymentMethod: CheckoutPaymentMethod;
  voucherCode?: string;
}): Promise<WebProductPricing> {
  const { isDepositProduct, isMembershipProduct } = await import('./membership');
  const isDeposit = isDepositProduct(params.product.name);
  const isMembership = isMembershipProduct(params.product.name);

  const checkoutPricing = await calculateCheckoutPrice(
    params.userId,
    {
      name: params.product.name,
      price: params.product.price,
    },
    { paymentMethod: params.paymentMethod }
  );

  let appliedVoucher: Voucher | null = null;
  let voucherDiscount = 0;
  let voucherCashback = 0;

  if (params.voucherCode) {
    const txnType = isDeposit ? 'deposit' : isMembership ? 'membership' : 'product';
    const vResult = await validateVoucherForTransaction({
      code: params.voucherCode,
      userId: params.userId,
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

  const BALANCE_DISCOUNT = 200;
  const balanceDiscount =
    params.paymentMethod === 'balance' && !isDeposit
      ? Math.min(BALANCE_DISCOUNT, priceAfterDiscounts)
      : 0;

  let payableAmount = 0;
  let uniqueCode = 0;

  if (params.paymentMethod === 'balance') {
    payableAmount = Math.max(0, priceAfterDiscounts - balanceDiscount);
  } else {
    const baseWithFee = priceAfterDiscounts + checkoutPricing.fee;
    const uniqueResult = await generateUniqueCheckoutAmount(baseWithFee);
    payableAmount = uniqueResult.payableAmount;
    uniqueCode = uniqueResult.uniqueCode;
  }

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
    fee: params.paymentMethod === 'balance' ? 0 : checkoutPricing.fee,
    payableAmount,
    uniqueCode,
    isDeposit,
    isMembership,
  };
}

export interface CreateWebOrderParams {
  userId: string;
  productId: string;
  paymentMethod: CheckoutPaymentMethod;
  voucherCode?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
}

export interface CreateWebOrderResult {
  success: boolean;
  orderCode?: string;
  paymentMethod?: CheckoutPaymentMethod;
  payableAmount?: number;
  qrCodeUrl?: string;
  qrString?: string;
  checkoutUrl?: string;
  message?: string;
  redirectUrl?: string;
  error?: string;
  shortfall?: number;
}

/**
 * Creates order via website, integrating with existing payment gateways and fulfillment
 */
export async function createWebOrder(params: CreateWebOrderParams): Promise<CreateWebOrderResult> {
  const product = await resolveWebProduct(params.productId);
  if (!product) {
    return { success: false, error: 'Produk tidak ditemukan atau tidak aktif.' };
  }

  if (product.stock <= 0) {
    return { success: false, error: `Maaf, stok produk "${product.name}" sedang habis.` };
  }

  // Get User record
  const userRes = await query<User>('SELECT * FROM users WHERE id = $1 LIMIT 1', [params.userId]);
  if (userRes.rows.length === 0) {
    return { success: false, error: 'Akun pengguna tidak valid. Silakan login kembali.' };
  }
  const user = userRes.rows[0];

  const pricing = await calculateWebPricing({
    userId: user.id,
    product,
    paymentMethod: params.paymentMethod,
    voucherCode: params.voucherCode,
  });

  const orderCode = generateOrderCode();

  // === PAYMENT METHOD: SALDO AKUN (BALANCE) ===
  if (params.paymentMethod === 'balance') {
    if (pricing.isDeposit) {
      return { success: false, error: 'Top-up saldo hanya dapat dibayar menggunakan QRIS.' };
    }

    const currentBalance = Number(user.balance || 0);
    if (currentBalance < pricing.payableAmount) {
      const shortfall = pricing.payableAmount - currentBalance;
      return {
        success: false,
        error: `Saldo akun tidak mencukupi (Kurang Rp ${shortfall.toLocaleString('id-ID')}).`,
        shortfall,
      };
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');

      const deductRes = await client.query<User>(
        `UPDATE users
         SET balance = balance - $1
         WHERE id = $2 AND balance >= $1
         RETURNING balance`,
        [pricing.payableAmount, user.id]
      );

      if (deductRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Saldo akun tidak mencukupi saat proses transaksi.' };
      }

      const balanceAfter = Number(deductRes.rows[0].balance ?? 0);
      const balanceBefore = balanceAfter + pricing.payableAmount;

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
            customer_name: params.customerName || user.name || (user.email ? user.email.split('@')[0] : 'Pelanggan Web'),
            customer_username: user.username || (user.email ? user.email.split('@')[0] : null),
            customer_id: user.telegram_id || `WEB-${user.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
            buyer_name: params.customerName || user.name || (user.email ? user.email.split('@')[0] : 'Pelanggan Web'),
            buyer_email: params.customerEmail || user.email || null,
            buyer_phone: params.customerPhone || user.phone || null,
            customer_email: params.customerEmail || user.email || null,
            customer_phone: params.customerPhone || user.phone || null,
            base_price: pricing.basePrice,
            discount: pricing.vipDiscount,
            balance_discount: pricing.balanceDiscount,
            fee: 0,
            unique_code: 0,
            payable_amount: pricing.payableAmount,
            paid_with_balance: pricing.payableAmount,
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
      console.error('[Web Order] Balance payment transaction error:', txErr);
      return { success: false, error: 'Gagal memproses pembayaran via saldo. Saldo Anda aman.' };
    } finally {
      client.release();
    }

    // Trigger immediate order fulfillment
    try {
      const { processOrderPayment } = await import('./fulfillment');
      const { bot } = await import('../bot/handler');
      await processOrderPayment(orderCode, bot, { transactionId: `BAL-${orderCode}` });
    } catch (fulfillErr) {
      console.error('[Web Order] Fulfillment error on balance order:', fulfillErr);
    }

    return {
      success: true,
      orderCode,
      paymentMethod: 'balance',
      payableAmount: pricing.payableAmount,
      redirectUrl: `/order/${orderCode}`,
    };
  }

  // === PAYMENT METHOD: DYNAMIC QRIS ===
  let qrisResult: {
    qrCodeUrl: string;
    qrString: string;
    checkoutUrl?: string;
    raw?: Record<string, unknown>;
  };

  try {
    const gateway = (process.env.PAYMENT_GATEWAY || 'shopeepay').toLowerCase();
    if (gateway === 'shopeepay') {
      const { createShopeePayInvoice } = await import('./shopeepay');
      qrisResult = await createShopeePayInvoice(orderCode, pricing.payableAmount);
    } else if (gateway === 'midtrans') {
      const { createQrisTransaction } = await import('./midtrans');
      qrisResult = await createQrisTransaction(orderCode, pricing.payableAmount);
    } else {
      const { createSakurupiahInvoice } = await import('./sakurupiah');
      const customerIdentifier =
        params.customerName ||
        params.customerEmail ||
        params.customerPhone ||
        user.name ||
        `WebUser_${user.id.slice(0, 6)}`;
      qrisResult = await createSakurupiahInvoice(
        orderCode,
        pricing.payableAmount,
        product.name,
        customerIdentifier
      );
    }
  } catch (error) {
    console.error('[Web Order] Failed to create QRIS transaction:', error);
    return { success: false, error: 'Gagal membuat QRIS pembayaran. Silakan coba kembali.' };
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
        gateway: (process.env.PAYMENT_GATEWAY || 'shopeepay').toLowerCase(),
        customer_name: params.customerName || user.name || (user.email ? user.email.split('@')[0] : 'Pelanggan Web'),
        customer_username: user.username || (user.email ? user.email.split('@')[0] : null),
        customer_id: user.telegram_id || `WEB-${user.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
        buyer_name: params.customerName || user.name || (user.email ? user.email.split('@')[0] : 'Pelanggan Web'),
        buyer_email: params.customerEmail || user.email || null,
        buyer_phone: params.customerPhone || user.phone || null,
        customer_email: params.customerEmail || user.email || null,
        customer_phone: params.customerPhone || user.phone || null,
        qr_code_url: qrisResult.qrCodeUrl,
        qr_string: qrisResult.qrString,
        checkout_url: qrisResult.checkoutUrl,
        base_price: pricing.basePrice,
        discount: pricing.vipDiscount,
        balance_discount: 0,
        fee: pricing.fee,
        unique_code: pricing.uniqueCode,
        payable_amount: pricing.payableAmount,
        is_vip_discount: pricing.isVipDiscountApplied,
        is_balance_discount: false,
        voucher_id: pricing.voucher ? pricing.voucher.id : null,
        voucher_code: pricing.voucher ? pricing.voucher.code : null,
        voucher_discount: pricing.voucherDiscount,
        voucher_cashback: pricing.voucherCashback,
      }),
    ]
  );

  return {
    success: true,
    orderCode,
    paymentMethod: 'qris',
    payableAmount: pricing.payableAmount,
    qrCodeUrl: qrisResult.qrCodeUrl,
    qrString: qrisResult.qrString,
    checkoutUrl: qrisResult.checkoutUrl,
    redirectUrl: `/order/${orderCode}`,
  };
}
