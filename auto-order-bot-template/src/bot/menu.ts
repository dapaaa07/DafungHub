import { Context } from 'node-telegram-bot-api';
import { ExtendedBot, sendSafeMessage } from './handler';
import { config, isBotAdmin } from '../../config/bot.config';
import { getSupplierProducts, SupplierProduct, isTestProduct } from '../suppliers/supplier-api';
import { getInternalProducts } from '../suppliers/internal-catalog';
import { query, Order } from '../core/db';
import { getEffectiveSellingPrice } from '../core/pricing';
import { getCustomPrices } from '../core/custom-prices';
import { getPendingQueueOrders, adminRetrySupplierFulfill } from '../core/fulfillment';
import { getBotStatus, setBotStatus } from '../core/settings';

export function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatIndonesianDateTime(d: Date = new Date()): string {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  const dayName = days[d.getDay()];
  const dateNum = d.getDate();
  const monthName = months[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${dayName}, ${dateNum} ${monthName} ${year} • ${hours}:${minutes}:${seconds}`;
}

export function getMainMenuInlineKeyboard(isAdminUser: boolean = false) {
  const keyboard = [];

  if (isAdminUser) {
    keyboard.push([{ text: '👑 Panel Owner / Admin', callback_data: 'admin_panel' }]);
  }

  keyboard.push([
    { text: '🟢 Katalog Produk', callback_data: 'menu_products' },
    { text: '👤 Profil Saya', callback_data: 'menu_profile' },
  ]);

  keyboard.push([
    { text: '💰 Deposit Saldo', callback_data: 'menu_deposit' },
    { text: '📩 Riwayat Pesanan', callback_data: 'menu_orders' },
  ]);

  if (config.store.channelUrl) {
    keyboard.push([{ text: '📢 Gabung Saluran Info ↗', url: config.store.channelUrl }]);
  }

  return { inline_keyboard: keyboard };
}

export function getPersistentKeyboard(isAdminUser: boolean = false) {
  const rows = [];
  if (isAdminUser) {
    rows.push([{ text: '👑 Panel Owner' }, { text: '🟢 Produk' }]);
    rows.push([{ text: '👤 Profil' }, { text: '💰 Deposit' }]);
    rows.push([{ text: '📩 Pesanan Saya' }, { text: '❓ Bantuan' }]);
  } else {
    rows.push([{ text: '🟢 Produk' }, { text: '👤 Profil' }]);
    rows.push([{ text: '💰 Deposit' }, { text: '📩 Pesanan Saya' }]);
    rows.push([{ text: '❓ Bantuan' }]);
  }
  return {
    keyboard: rows,
    resize_keyboard: true,
    is_persistent: true,
  };
}

export interface PlatformConfig {
  id: string;
  name: string;
  icon: string;
  keywords: string[];
}

export const PLATFORMS: PlatformConfig[] = [
  { id: 'netflix', name: 'Netflix', icon: '🔴', keywords: ['netflix'] },
  { id: 'spotify', name: 'Spotify', icon: '🟢', keywords: ['spotify'] },
  { id: 'canva', name: 'Canva Pro', icon: '🎨', keywords: ['canva'] },
  { id: 'capcut', name: 'CapCut Pro', icon: '✂️', keywords: ['capcut'] },
  { id: 'claude', name: 'Claude AI', icon: '🤖', keywords: ['claude'] },
  { id: 'gemini', name: 'Gemini AI', icon: '✨', keywords: ['gemini'] },
  { id: 'chatgpt', name: 'ChatGPT / OpenAI', icon: '💻', keywords: ['gpt', 'openai', 'codex'] },
  { id: 'office', name: 'MS Office 365', icon: '📊', keywords: ['office', 'microsoft'] },
  { id: 'vpn', name: 'VPN Premium', icon: '🛡️', keywords: ['vpn', 'nord', 'expressvpn'] },
  { id: 'adobe', name: 'Adobe Creative', icon: '🖌️', keywords: ['adobe'] },
];

export async function getAllProducts(): Promise<SupplierProduct[]> {
  const [suppProds, internalProds] = await Promise.all([
    getSupplierProducts().catch(() => []),
    getInternalProducts().catch(() => []),
  ]);
  const combined = [...suppProds, ...internalProds];
  return combined.filter((p) => !isTestProduct(p));
}

export function filterProductsByPlatform(products: SupplierProduct[], platformId: string = 'all'): SupplierProduct[] {
  const clean = products.filter((p) => !isTestProduct(p));
  if (!platformId || platformId === 'all') return clean;

  const target = PLATFORMS.find((p) => p.id === platformId);
  if (!target) return clean;

  return clean.filter((p) => target.keywords.some((k) => p.name.toLowerCase().includes(k)));
}

export async function sendMainMenu(ctx: Context, botInstance: ExtendedBot): Promise<void> {
  const userId = ctx.from?.id;
  const username = ctx.from?.username ? `@${ctx.from.username}` : (ctx.from?.first_name || 'Pelanggan');
  const isAdminUser = isBotAdmin(userId);

  let userBalance = 0;
  if (userId) {
    const res = await query<{ balance: number }>(`SELECT balance FROM users WHERE telegram_id = $1`, [String(userId)]).catch(() => ({ rows: [] }));
    if (res.rows.length > 0) userBalance = res.rows[0].balance || 0;
  }

  const captionText =
    `Halo <b>${escapeHtml(username)}</b> 👋\n` +
    `Selamat datang di <b>${escapeHtml(config.store.name)}</b>!\n` +
    `<i>${escapeHtml(config.store.tagline)}</i>\n\n` +
    `💳 <b>Saldo Anda:</b> <code>Rp ${userBalance.toLocaleString('id-ID')}</code>\n` +
    `⏰ <b>Waktu:</b> ${formatIndonesianDateTime()}\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `Silakan pilih menu di bawah untuk mulai berbelanja atau kelola akun Anda:`;

  await sendSafeMessage(ctx, botInstance, captionText, {
    parse_mode: 'HTML',
    reply_markup: getMainMenuInlineKeyboard(isAdminUser),
  });
}

export async function sendPlatformsMenu(ctx: Context, botInstance: ExtendedBot): Promise<void> {
  const products = await getAllProducts();
  const keyboard = [];

  for (let i = 0; i < PLATFORMS.length; i += 2) {
    const row = [];
    const p1 = PLATFORMS[i];
    const count1 = products.filter((p) => p1.keywords.some((k) => p.name.toLowerCase().includes(k))).length;
    if (count1 > 0) {
      row.push({ text: `${p1.icon} ${p1.name} (${count1})`, callback_data: `plat_${p1.id}` });
    }

    if (i + 1 < PLATFORMS.length) {
      const p2 = PLATFORMS[i + 1];
      const count2 = products.filter((p) => p2.keywords.some((k) => p.name.toLowerCase().includes(k))).length;
      if (count2 > 0) {
        row.push({ text: `${p2.icon} ${p2.name} (${count2})`, callback_data: `plat_${p2.id}` });
      }
    }
    if (row.length > 0) keyboard.push(row);
  }

  keyboard.push([{ text: `🌟 Semua Produk (${products.length})`, callback_data: 'plat_all' }]);
  keyboard.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'menu_main' }]);

  const text =
    `🛍️ <b>KATALOG KATEGORI PRODUK</b>\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `Pilih kategori produk digital yang Anda inginkan:`;

  await sendSafeMessage(ctx, botInstance, text, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: keyboard },
  });
}

export async function sendProductsMenu(
  ctx: Context,
  botInstance: ExtendedBot,
  page: number = 0,
  platformId: string = 'all'
): Promise<void> {
  const [allProducts, customPrices] = await Promise.all([
    getAllProducts(),
    getCustomPrices().catch(() => new Map<string, number>()),
  ]);

  const products = filterProductsByPlatform(allProducts, platformId);
  const pageSize = 6;
  const totalPages = Math.ceil(products.length / pageSize) || 1;
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const currentSlice = products.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const buttons = currentSlice.map((prod) => {
    const sellingPrice = getEffectiveSellingPrice(prod, customPrices);
    const priceStr = `Rp ${sellingPrice.toLocaleString('id-ID')}`;
    const inStock = prod.availability === 'in_stock';
    const prefix = inStock ? '🟢 ' : '🔴 [Habis] ';
    return [
      {
        text: `${prefix}${prod.name} — ${priceStr}`,
        callback_data: `pdetail:${platformId}:${prod.id}`,
      },
    ];
  });

  const navRow = [];
  if (safePage > 0) navRow.push({ text: '◀️ Sebelumnya', callback_data: `pnav_${platformId}_${safePage - 1}` });
  navRow.push({ text: `Hal ${safePage + 1}/${totalPages}`, callback_data: 'noop' });
  if (safePage < totalPages - 1) navRow.push({ text: 'Berikutnya ▶️', callback_data: `pnav_${platformId}_${safePage + 1}` });

  if (totalPages > 1) buttons.push(navRow);
  buttons.push([
    { text: '📂 Pilih Kategori Lain', callback_data: 'menu_platforms' },
    { text: '🔙 Menu Utama', callback_data: 'menu_main' },
  ]);

  const text =
    `📦 <b>DAFTAR PRODUK (Halaman ${safePage + 1}/${totalPages})</b>\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `Klik salah satu produk untuk melihat detail spesifikasi dan panduan garansi:`;

  await sendSafeMessage(ctx, botInstance, text, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: buttons },
  });
}

export async function sendProductDetail(
  ctx: Context,
  botInstance: ExtendedBot,
  productId: string,
  platformId: string = 'all'
): Promise<void> {
  const [allProducts, customPrices] = await Promise.all([
    getAllProducts(),
    getCustomPrices().catch(() => new Map<string, number>()),
  ]);

  const prod = allProducts.find((p) => p.id === productId);

  if (!prod) {
    await sendSafeMessage(
      ctx,
      botInstance,
      '⚠️ <b>Produk Tidak Ditemukan:</b> Produk yang Anda pilih mungkin sudah tidak aktif.',
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

  const sellingPrice = getEffectiveSellingPrice(prod, customPrices);
  const isAvailable = prod.availability === 'in_stock';

  const caption =
    `📦 <b>DETAIL PRODUK</b>\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `• <b>Nama:</b> ${escapeHtml(prod.name)}\n` +
    `• <b>Harga:</b> <b>Rp ${sellingPrice.toLocaleString('id-ID')}</b>\n` +
    `• <b>Status:</b> ${isAvailable ? '🟢 Tersedia (Ready)' : '🔴 Stok Habis'}\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `📝 <b>Keterangan:</b>\n` +
    `${escapeHtml(prod.description || 'Akun digital berkualitas garansi full durasi.')}\n\n` +
    `🛡️ <b>Kebijakan Garansi:</b> Full durasi selama masa langganan aktif.`;

  const buttons = [];
  if (isAvailable) {
    buttons.push([{ text: `💳 Beli Sekarang (Rp ${sellingPrice.toLocaleString('id-ID')})`, callback_data: `buy:${prod.id}` }]);
  }
  buttons.push([
    { text: '◀️ Kembali ke Daftar', callback_data: `plat_${platformId}` },
    { text: '🔙 Menu Utama', callback_data: 'menu_main' },
  ]);

  await sendSafeMessage(ctx, botInstance, caption, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: buttons },
  });
}

export async function sendAdminPanel(ctx: Context, botInstance: ExtendedBot): Promise<void> {
  if (!isBotAdmin(ctx.from?.id)) return;

  const status = await getBotStatus();
  const queueOrders = await getPendingQueueOrders(5);

  const text =
    `👑 <b>PANEL OWNER & ADMIN</b>\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `• <b>Status Bot:</b> ${status === 'online' ? '🟢 ONLINE (Aktif Normal)' : '🔴 MAINTENANCE (Pemeliharaan)'}\n` +
    `• <b>Antrean Pending:</b> <b>${queueOrders.length} Pesanan</b>\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `Pilih aksi administrasi di bawah:`;

  const keyboard = [
    [
      {
        text: status === 'online' ? '🔴 Ubah ke Mode Maintenance' : '🟢 Aktifkan Bot (Online)',
        callback_data: status === 'online' ? 'admin_set_maintenance' : 'admin_set_online',
      },
    ],
    [
      { text: '💰 Kelola Harga Produk', callback_data: 'admin_prices' },
      { text: `📦 Cek Antrean Pesanan (${queueOrders.length})`, callback_data: 'admin_queue' },
    ],
    [{ text: '🔙 Kembali ke Menu Utama', callback_data: 'menu_main' }],
  ];

  await sendSafeMessage(ctx, botInstance, text, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: keyboard },
  });
}

export async function sendAdminPricesMenu(ctx: Context, botInstance: ExtendedBot, page: number = 0): Promise<void> {
  if (!isBotAdmin(ctx.from?.id)) return;

  const [products, customPrices] = await Promise.all([
    getAllProducts(),
    getCustomPrices().catch(() => new Map<string, number>()),
  ]);

  const pageSize = 5;
  const totalPages = Math.ceil(products.length / pageSize) || 1;
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const currentSlice = products.slice(safePage * pageSize, (safePage + 1) * pageSize);

  let text =
    `💰 <b>KELOLA HARGA PRODUK</b> (Hal ${safePage + 1}/${totalPages})\n` +
    `━━━━━━━━━━━━━━━━━━━\n\n`;

  const buttons = [];

  for (const prod of currentSlice) {
    const hasCustom = customPrices.has(prod.id) || customPrices.has(prod.name);
    const effectivePrice = getEffectiveSellingPrice(prod, customPrices);
    const modalPrice = prod.price_idr;
    const profit = effectivePrice - modalPrice;

    text +=
      `• <b>${escapeHtml(prod.name)}</b>\n` +
      `  🆔 ID: <code>${prod.id}</code>\n` +
      `  💵 Jual: <b>Rp ${effectivePrice.toLocaleString('id-ID')}</b> ${hasCustom ? '<i>(Custom Override ✨)</i>' : '<i>(Auto Markup)</i>'}\n` +
      `  📦 Modal: Rp ${modalPrice.toLocaleString('id-ID')} | Margin: <b>+Rp ${profit.toLocaleString('id-ID')}</b>\n\n`;

    const row = [{ text: `✏️ Ubah: ${prod.name.slice(0, 15)}...`, callback_data: `admin_editprice_${prod.id}` }];
    if (hasCustom) {
      row.push({ text: '🔄 Reset Default', callback_data: `admin_resetprice_${prod.id}` });
    }
    buttons.push(row);
  }

  const navRow = [];
  if (safePage > 0) navRow.push({ text: '◀️ Sebelumnya', callback_data: `admin_prices_page_${safePage - 1}` });
  navRow.push({ text: `Hal ${safePage + 1}/${totalPages}`, callback_data: 'noop' });
  if (safePage < totalPages - 1) navRow.push({ text: 'Berikutnya ▶️', callback_data: `admin_prices_page_${safePage + 1}` });

  if (totalPages > 1) buttons.push(navRow);
  buttons.push([{ text: '🔙 Kembali ke Panel Admin', callback_data: 'admin_panel' }]);

  await sendSafeMessage(ctx, botInstance, text, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: buttons },
  });
}
