import { Context } from 'node-telegram-bot-api';
import { ExtendedBot, sendSafeMessage } from '../handler';
import { query, User, Product } from '../../core/db';
import { config } from '../../../config/bot.config';
import { getAllProducts } from '../menu';
import { getEffectiveSellingPrice } from '../../core/pricing';
import { getCustomPrices } from '../../core/custom-prices';
import { createSakurupiahInvoice } from '../../gateways/sakurupiah';
import { createMidtransQris } from '../../gateways/midtrans';
import { createShopeePayInvoice } from '../../gateways/shopeepay';
import { getManualPaymentInstructions } from '../../gateways/manual';

export function generateOrderCode(): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `ORD-${timestamp}-${random}`;
}

export async function ensureUser(telegramId: string | number, username?: string): Promise<User> {
  const tId = String(telegramId);
  const res = await query<User>(
    `INSERT INTO users (telegram_id, role)
     VALUES ($1, 'buyer')
     ON CONFLICT (telegram_id) DO UPDATE SET telegram_id = EXCLUDED.telegram_id
     RETURNING *`,
    [tId]
  );
  return res.rows[0];
}

export async function handleBuy(
  ctx: Context,
  productId: string,
  botInstance: ExtendedBot
): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const [products, customPrices] = await Promise.all([
    getAllProducts(),
    getCustomPrices().catch(() => new Map<string, number>()),
  ]);

  const product = products.find((p) => p.id === productId);

  if (!product) {
    await sendSafeMessage(
      ctx,
      botInstance,
      '❌ <b>Produk Tidak Ditemukan:</b> Produk yang dipilih sudah tidak tersedia.',
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '🛍️ Buka Katalog', callback_data: 'menu_products' }]],
        },
      }
    );
    return;
  }

  if (product.availability !== 'in_stock') {
    await sendSafeMessage(
      ctx,
      botInstance,
      `⚠️ <b>Stok Habis:</b> Maaf, produk <b>${product.name}</b> sedang kehabisan stok saat ini.`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '🛍️ Pilih Produk Lain', callback_data: 'menu_products' }]],
        },
      }
    );
    return;
  }

  const user = await ensureUser(from.id, from.username);
  const sellingPrice = getEffectiveSellingPrice(product, customPrices);
  const orderCode = generateOrderCode();

  // Ensure product exists in DB products table
  let dbProdRes = await query<{ id: string }>(`SELECT id FROM products WHERE name = $1 LIMIT 1`, [product.name]);
  let dbProdId = dbProdRes.rows[0]?.id;

  if (!dbProdId) {
    const insertRes = await query<{ id: string }>(
      `INSERT INTO products (name, price, stock, is_active)
       VALUES ($1, $2, 999, true)
       RETURNING id`,
      [product.name, sellingPrice]
    );
    dbProdId = insertRes.rows[0].id;
  }

  // Generate Payment based on configured gateway
  const gateway = config.gateways.defaultGateway;
  let qrCodeUrl = '';
  let qrString = '';
  let invoiceRaw: unknown = {};

  try {
    if (gateway === 'shopeepay') {
      const shopeeRes = await createShopeePayInvoice(orderCode, sellingPrice);
      qrCodeUrl = shopeeRes.qrCodeUrl;
      qrString = shopeeRes.qrString;
      invoiceRaw = shopeeRes.raw;
    } else if (gateway === 'sakurupiah') {
      const sakuRes = await createSakurupiahInvoice({
        orderCode,
        amount: sellingPrice,
        productName: product.name,
        buyerName: from.first_name,
        buyerPhone: '08120000000',
      });
      qrCodeUrl = sakuRes.qrCodeUrl;
      qrString = sakuRes.qrString;
      invoiceRaw = sakuRes.raw;
    } else if (gateway === 'midtrans') {
      const midRes = await createMidtransQris({
        orderCode,
        amount: sellingPrice,
      });
      qrCodeUrl = midRes.qrCodeUrl;
      qrString = midRes.qrString;
      invoiceRaw = midRes.raw;
    }
  } catch (gwErr) {
    console.error(`[Gateway Error (${gateway})]:`, gwErr);
    // Fallback to manual if gateway error occurs
  }

  // Save order to database
  await query(
    `INSERT INTO orders (user_id, product_id, order_code, payment_status, fulfillment_status, invoice_data)
     VALUES ($1, $2, $3, 'unpaid', 'pending', $4)`,
    [user.id, dbProdId, orderCode, JSON.stringify({ qrCodeUrl, qrString, raw: invoiceRaw, gateway })]
  );

  let messageText =
    `🧾 <b>INVOICE PEMBAYARAN</b>\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `• <b>Kode Order:</b> <code>${orderCode}</code>\n` +
    `• <b>Produk:</b> ${product.name}\n` +
    `• <b>Total Bayar:</b> <b>Rp ${sellingPrice.toLocaleString('id-ID')}</b>\n` +
    `━━━━━━━━━━━━━━━━━━━\n\n`;

  if (qrCodeUrl) {
    messageText +=
      `📱 <b>Scan QRIS di bawah menggunakan:</b>\n` +
      `BCA, Mandiri, BRI, BNI, GoPay, OVO, DANA, ShopeePay, atau Bank apa pun.\n\n` +
      `⏳ <i>QRIS berlaku 15–30 menit. Kredensial akun dikirim otomatis begitu pembayaran terverifikasi.</i>`;
  } else {
    messageText += getManualPaymentInstructions(orderCode, sellingPrice);
  }

  const buttons = [
    [{ text: '🔄 Cek Status Pembayaran', callback_data: `status_${orderCode}` }],
    [{ text: '🔙 Menu Utama', callback_data: 'menu_main' }],
  ];

  if (qrCodeUrl) {
    try {
      await botInstance.sendPhoto(from.id, qrCodeUrl, {
        caption: messageText,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons },
      });
      return;
    } catch {}
  }

  await sendSafeMessage(ctx, botInstance, messageText, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: buttons },
  });
}
