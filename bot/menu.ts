import fs from 'fs';
import path from 'path';
import { Context } from 'node-telegram-bot-api';
import { fromPath } from 'node-telegram-bot-api/node';
import { ExtendedBot, sendSafeMessage, sendSafePhoto } from './handler';
import { getSupplierProducts, getSupplierProfile, getSupplierBalance, SupplierProduct } from '../lib/supplier';
import { query, Order, Product } from '../lib/db';
import { handleBuy } from './commands/buy';
import { isAdmin, calculateSellingPrice, ADMIN_TELEGRAM_ID, getEffectiveSellingPrice } from '../lib/pricing';
import { getCustomPrices } from '../lib/custom-prices';
import {
  adminRetrySupplierFulfill,
  getPendingQueueOrders,
} from '../lib/fulfillment';
import { getBotStatus, setBotStatus } from '../lib/settings';

/**
 * Escape HTML special characters for safe Telegram HTML parse mode
 */
export function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Format current date and time in Indonesian:
 * e.g. "Minggu, 11 Oktober 2026 • 13:54:45"
 */
export function formatIndonesianDateTime(d: Date = new Date()): string {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const months = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
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

/**
 * Main Menu Inline Keyboard matching exact visual design reference.
 * If user is Owner (7133868769), displays the prominent Owner Panel button.
 */
export function getMainMenuInlineKeyboard(isOwner: boolean = false) {
  const keyboard = [];

  if (isOwner) {
    keyboard.push([{ text: '👑 Panel Owner / Admin', callback_data: 'admin_panel' }]);
  }

  keyboard.push([
    { text: '🟢 Produk', callback_data: 'menu_products' },
    { text: '👤 Profil', callback_data: 'menu_profile' },
  ]);

  keyboard.push([
    { text: '💰 Deposit', callback_data: 'menu_deposit' },
    { text: '📩 Pesanan Saya', callback_data: 'menu_orders' },
  ]);

  keyboard.push([
    { text: '📢 Gabung Channel ↗', url: 'https://t.me/DafungHub' },
  ]);

  return { inline_keyboard: keyboard };
}

/**
 * Persistent Bottom Keyboard
 */
export function getPersistentKeyboard(isOwner: boolean = false) {
  const rows = [];
  if (isOwner) {
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

/**
 * Send friendly maintenance notification to non-admin users
 */
export async function sendMaintenanceMessage(
  ctx: Context,
  botInstance: ExtendedBot
): Promise<unknown> {
  const maintenanceText =
    `🚧 <b>MOHON MAAF, BOT SEDANG DALAM PEMELIHARAAN</b> 🚧\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `Halo kak! Saat ini sistem <b>DaFung Hub</b> sedang dalam mode pemeliharaan (maintenance) rutin untuk peningkatan performa dan update layanan.\n\n` +
    `Seluruh transaksi dan pemesanan sementara ditangguhkan sampai pemeliharaan selesai demi kenyamanan dan keamanan transaksi Anda.\n\n` +
    `Silakan cek status kembali secara berkala, atau hubungi kami:\n` +
    `• <b>Admin Support:</b> @DappaSecc\n` +
    `• <b>Channel Info:</b> @DafungHub\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `<i>Sistem akan otomatis aktif kembali setelah maintenance selesai. Terima kasih atas pengertiannya!</i>`;

  const buttons = {
    inline_keyboard: [
      [
        { text: '🔄 Cek Status Lagi', callback_data: 'check_maintenance_status' },
      ],
      [
        { text: '📢 Channel Info (@DafungHub)', url: 'https://t.me/DafungHub' },
        { text: '💬 Hubungi Admin', url: 'https://t.me/DappaSecc' },
      ],
    ],
  };

  return await sendSafeMessage(ctx, botInstance, maintenanceText, {
    parse_mode: 'HTML',
    reply_markup: buttons,
  });
}

/**
 * Send the interactive main menu with banner and buttons
 */
export async function sendMainMenu(ctx: Context, botInstance: ExtendedBot): Promise<void> {
  const isOwner = isAdmin(ctx.from?.id);
  const botStatus = await getBotStatus();

  // Non-admins are redirected to maintenance message if active
  if (!isOwner && botStatus === 'maintenance') {
    await sendMaintenanceMessage(ctx, botInstance);
    return;
  }

  const rawName = ctx.from?.first_name || ctx.from?.username || 'Kak';
  const userName = isOwner ? `${rawName} 👑 (Owner)` : rawName;
  const dateTimeStr = formatIndonesianDateTime();

  let captionText =
    `Hello, ${escapeHtml(userName)}\n` +
    `| ${escapeHtml(dateTimeStr)} ”`;

  if (isOwner && botStatus === 'maintenance') {
    captionText += `\n\n⚠️ <i>(Perhatian: Mode MAINTENANCE aktif. Pengguna biasa sedang diblokir).</i>`;
  }

  const inlineMarkup = getMainMenuInlineKeyboard(isOwner);

  // 1. Check for banner photo (banner.jpg or banner.png)
  const candidatePaths = [
    path.resolve(process.cwd(), 'banner.jpg'),
    path.resolve(process.cwd(), 'banner.png'),
    path.resolve(__dirname, '../banner.jpg'),
    path.resolve(__dirname, '../banner.png'),
  ];
  const bannerPath = candidatePaths.find((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });

  // 2. Send banner photo with caption & inline buttons
  if (bannerPath) {
    try {
      const photo = await fromPath(bannerPath);
      const photoRes = await sendSafePhoto(ctx, botInstance, photo, {
        caption: captionText,
        parse_mode: 'HTML',
        reply_markup: inlineMarkup,
      });
      if (photoRes) return;
    } catch (err) {
      console.warn('sendPhoto with banner failed, falling back to message text:', err);
    }
  }

  // Fallback text if photo fails or in mock test environment
  await sendSafeMessage(
    ctx,
    botInstance,
    `<b>${captionText}</b>\n\nSelamat datang di <b>DaFung Hub — Bot Otomatis Produk Digital</b>.`,
    {
      parse_mode: 'HTML',
      reply_markup: inlineMarkup,
    }
  );
}

/**
 * Display products list as interactive buttons (with profit margin included)
 */
export interface PlatformConfig {
  id: string;
  name: string;
  icon: string;
  keywords: string[];
  logoFile?: string;
}

export const PLATFORMS: PlatformConfig[] = [
  { id: 'netflix', name: 'Netflix', icon: '🔴', keywords: ['netflix'], logoFile: 'netflix.png' },
  { id: 'spotify', name: 'Spotify', icon: '🟢', keywords: ['spotify'], logoFile: 'spotify.png' },
  { id: 'canva', name: 'Canva', icon: '🎨', keywords: ['canva'], logoFile: 'canva.png' },
  { id: 'capcut', name: 'Capcut', icon: '✂️', keywords: ['capcut'], logoFile: 'capcut.png' },
  { id: 'alight_motion', name: 'Alight Motion', icon: '🎬', keywords: ['alight motion', 'alightmotion'], logoFile: 'alight_motion.png' },
  { id: 'picsart', name: 'Picsart', icon: '🎨', keywords: ['picsart'], logoFile: 'picsart.png' },
  { id: 'meitu', name: 'Meitu', icon: '💄', keywords: ['meitu'], logoFile: 'meitu.png' },
  { id: 'wink', name: 'Wink', icon: '✨', keywords: ['wink'], logoFile: 'wink.png' },
  { id: 'elevenlabs', name: 'ElevenLabs', icon: '🎙️', keywords: ['elevenlabs', 'eleven labs', 'eleven'], logoFile: 'elevenlabs.png' },
  { id: 'ilovepdf', name: 'iLovePDF', icon: '📑', keywords: ['ilovepdf', 'ilove pdf'], logoFile: 'ilovepdf.png' },
  { id: 'jetbrains', name: 'JetBrains', icon: '💻', keywords: ['jetbrains', 'intellij', 'pycharm', 'webstorm'], logoFile: 'jetbrains.png' },
  { id: 'duolingo', name: 'Duolingo', icon: '🦉', keywords: ['duolingo'], logoFile: 'duolingo.png' },
  { id: 'claude', name: 'Claude AI', icon: '🤖', keywords: ['claude'], logoFile: 'claude.png' },
  { id: 'gemini', name: 'Gemini AI', icon: '✨', keywords: ['gemini'], logoFile: 'gemini.png' },
  { id: 'codex', name: 'Codex / GPT', icon: '💻', keywords: ['codex', 'gpt', 'openai'], logoFile: 'codex.png' },
  { id: 'prime_video', name: 'Prime Video', icon: '📺', keywords: ['prime video'], logoFile: 'prime_video.png' },
  { id: 'apple_tv', name: 'Apple TV', icon: '🍏', keywords: ['apple tv'], logoFile: 'apple_tv.png' },
  { id: 'hbo', name: 'HBO Max', icon: '🍿', keywords: ['hbo'], logoFile: 'hbo.png' },
  { id: 'office', name: 'MS Office', icon: '📊', keywords: ['office', 'microsoft'], logoFile: 'office.png' },
  { id: 'zoom', name: 'Zoom', icon: '📹', keywords: ['zoom'], logoFile: 'zoom.png' },
  { id: 'vpn', name: 'VPN', icon: '🛡️', keywords: ['vpn', 'nord', 'expressvpn', 'hma', 'surfshark', 'avira'], logoFile: 'vpn.png' },
  { id: 'notion', name: 'Notion', icon: '📓', keywords: ['notion'], logoFile: 'notion.png' },
  { id: 'adobe', name: 'Adobe', icon: '🖌️', keywords: ['adobe'], logoFile: 'adobe.png' },
  { id: 'figma', name: 'Figma', icon: '🎯', keywords: ['figma'], logoFile: 'figma.png' },
  { id: 'scribd', name: 'Scribd', icon: '📚', keywords: ['scribd'], logoFile: 'scribd.png' },
  { id: 'gmail', name: 'Gmail PVA', icon: '📧', keywords: ['gmail', 'google mail'], logoFile: 'gmail.png' },
  { id: 'miro', name: 'Miro Board', icon: '📋', keywords: ['miro'], logoFile: 'miro.png' },
  { id: 'framer', name: 'Framer AI', icon: '🌐', keywords: ['framer'], logoFile: 'framer.png' },
  { id: 'telegram', name: 'Telegram Account', icon: '✈️', keywords: ['telegram'], logoFile: 'telegram.png' },
  { id: 'autodesk', name: 'Autodesk', icon: '📐', keywords: ['autodesk', 'autocad', '3ds max', 'maya', 'revit'], logoFile: 'autodesk.png' },
  { id: 'email', name: 'Akun Email', icon: '📧', keywords: ['outlook', 'hotmail', 'email'], logoFile: 'office.png' },
];

export function matchProductPlatform(productName: string): PlatformConfig | null {
  const lower = productName.toLowerCase();
  for (const plat of PLATFORMS) {
    if (plat.keywords.some((k) => lower.includes(k))) {
      return plat;
    }
  }
  return null;
}

export function filterProductsByPlatform(
  products: SupplierProduct[],
  platformId: string = 'all'
): SupplierProduct[] {
  if (!platformId || platformId === 'all') return products;

  if (platformId === 'other') {
    return products.filter((p) => matchProductPlatform(p.name) === null);
  }

  const targetPlatform = PLATFORMS.find((p) => p.id === platformId);
  if (!targetPlatform) return products;

  return products.filter((p) =>
    targetPlatform.keywords.some((k) => p.name.toLowerCase().includes(k))
  );
}

export function getPlatformsWithCounts(
  products: SupplierProduct[]
): Array<PlatformConfig & { count: number }> {
  const result: Array<PlatformConfig & { count: number }> = [];

  for (const plat of PLATFORMS) {
    const matched = products.filter((p) =>
      plat.keywords.some((k) => p.name.toLowerCase().includes(k))
    );
    if (matched.length > 0) {
      result.push({ ...plat, count: matched.length });
    }
  }

  return result;
}

export function getPlatformLogoPath(platformId?: string): string | null {
  if (!platformId || platformId === 'all' || platformId === 'other') {
    const candidatePaths = [
      path.resolve(process.cwd(), 'banner.jpg'),
      path.resolve(process.cwd(), 'banner.png'),
    ];
    return candidatePaths.find((p) => fs.existsSync(p)) || null;
  }

  const plat = PLATFORMS.find((p) => p.id === platformId);
  const logoFile = plat?.logoFile || `${platformId}.png`;
  const logoPath = path.resolve(process.cwd(), 'assets/logos', logoFile);
  if (fs.existsSync(logoPath)) {
    return logoPath;
  }

  const banner = path.resolve(process.cwd(), 'banner.jpg');
  return fs.existsSync(banner) ? banner : null;
}

/**
 * Display platforms menu (2 columns with logo icons beside names, no top banner)
 */
export async function sendPlatformsMenu(
  ctx: Context,
  botInstance: ExtendedBot
): Promise<void> {
  try {
    const products = await getSupplierProducts();
    const activePlatforms = getPlatformsWithCounts(products);
    const otherCount = products.filter((p) => matchProductPlatform(p.name) === null).length;

    const keyboard = [];
    for (let i = 0; i < activePlatforms.length; i += 2) {
      const row = [];
      const p1 = activePlatforms[i];
      row.push({ text: `${p1.icon} ${p1.name} (${p1.count})`, callback_data: `plat_${p1.id}` });

      if (i + 1 < activePlatforms.length) {
        const p2 = activePlatforms[i + 1];
        row.push({ text: `${p2.icon} ${p2.name} (${p2.count})`, callback_data: `plat_${p2.id}` });
      }
      keyboard.push(row);
    }

    if (otherCount > 0) {
      keyboard.push([{ text: `📦 Platform Lainnya (${otherCount})`, callback_data: 'plat_other' }]);
    }

    keyboard.push([{ text: `🌟 Semua Produk (${products.length})`, callback_data: 'plat_all' }]);
    keyboard.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'menu_main' }]);

    const text =
      `🛍️ <b>KATALOG PRODUK BERDASARKAN PLATFORM</b>\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `Silakan pilih platform akun digital yang Anda inginkan di bawah:`;

    await sendSafeMessage(ctx, botInstance, text, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard },
    });
  } catch (err) {
    console.error('Failed to load platforms:', err);
    await sendSafeMessage(
      ctx,
      botInstance,
      '⚠️ Gagal memuat katalog platform. Silakan coba kembali.',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Coba Lagi', callback_data: 'menu_platforms' }],
            [{ text: '🔙 Menu Utama', callback_data: 'menu_main' }],
          ],
        },
      }
    );
  }
}

/**
 * Display products list for a specific platform (with logo icons beside products, no top banner)
 */
export async function sendProductsMenu(
  ctx: Context,
  botInstance: ExtendedBot,
  page: number = 0,
  platformId: string = 'all'
): Promise<void> {
  try {
    const [allProducts, customPrices] = await Promise.all([
      getSupplierProducts().catch(() => []),
      getCustomPrices().catch(() => new Map<string, number>()),
    ]);
    const products = filterProductsByPlatform(allProducts, platformId);

    const targetPlat = PLATFORMS.find((p) => p.id === platformId);
    const platformTitle =
      platformId === 'all'
        ? 'SEMUA PRODUK'
        : platformId === 'other'
          ? 'PLATFORM LAINNYA'
          : targetPlat?.name.toUpperCase() || 'PRODUK';

    const pageSize = 6;
    const totalPages = Math.ceil(products.length / pageSize) || 1;
    const safePage = Math.max(0, Math.min(page, totalPages - 1));

    const currentSlice = products.slice(safePage * pageSize, (safePage + 1) * pageSize);

    const buttons = currentSlice.map((prod: SupplierProduct) => {
      const sellingPrice = getEffectiveSellingPrice(prod, customPrices);
      const priceStr = `Rp ${sellingPrice.toLocaleString('id-ID')}`;
      const icon = targetPlat?.icon || (prod.availability === 'in_stock' ? '🟢' : '🔴');
      const prefix = prod.availability === 'in_stock' ? `${icon} ` : '🔴 [Habis] ';
      return [
        {
          text: `${prefix}${prod.name} — ${priceStr}`,
          callback_data: `pdetail:${platformId}:${prod.id}`,
        },
      ];
    });

    // Navigation buttons
    const navRow = [];
    if (safePage > 0) {
      navRow.push({ text: '◀️ Sebelumnya', callback_data: `pnav_${platformId}_${safePage - 1}` });
    }
    navRow.push({ text: `Hal ${safePage + 1}/${totalPages}`, callback_data: 'noop' });
    if (safePage < totalPages - 1) {
      navRow.push({ text: 'Berikutnya ▶️', callback_data: `pnav_${platformId}_${safePage + 1}` });
    }

    if (totalPages > 1) {
      buttons.push(navRow);
    }

    buttons.push([
      { text: '📂 Pilih Platform Lain', callback_data: 'menu_platforms' },
      { text: '🔙 Menu Utama', callback_data: 'menu_main' },
    ]);

    const caption =
      `📦 <b>KATALOG PRODUK: ${escapeHtml(platformTitle)}</b>\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `Pilih paket akun digital yang Anda inginkan di bawah:`;

    await sendSafeMessage(ctx, botInstance, caption, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: buttons },
    });
  } catch (err) {
    console.error('Failed to load supplier products:', err);
    await sendSafeMessage(
      ctx,
      botInstance,
      '⚠️ Gagal memuat katalog produk. Silakan coba kembali.',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Coba Lagi', callback_data: `plat_${platformId}` }],
            [{ text: '🔙 Menu Utama', callback_data: 'menu_main' }],
          ],
        },
      }
    );
  }
}

/**
 * Show product detail and buy action button (clean text without top banner)
 */
export async function sendProductDetail(
  ctx: Context,
  botInstance: ExtendedBot,
  productId: string,
  platformId: string = 'all'
): Promise<void> {
  try {
    const products = await getSupplierProducts();
    let prod = products.find((p) => p.id === productId);

    if (!prod) {
      try {
        const dbRes = await query<Product>('SELECT * FROM products WHERE id = $1 LIMIT 1', [productId]);
        if (dbRes.rows.length > 0) {
          const dbProd = dbRes.rows[0];
          prod = {
            id: dbProd.id,
            name: dbProd.name,
            price_idr: dbProd.price,
            availability: dbProd.stock > 0 ? 'in_stock' : 'out_of_stock',
            description: '',
            requires_email: false,
          };
        }
      } catch {
        // Ignore fallback db lookup error
      }
    }

    if (!prod) {
      await sendSafeMessage(
        ctx,
        botInstance,
        '❌ <b>Produk Tidak Ditemukan</b>\n\nProduk ini mungkin sedang diperbarui atau sudah tidak tersedia. Silakan pilih produk lain di katalog:',
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

    const customPrices = await getCustomPrices().catch(() => new Map<string, number>());
    const sellingPrice = getEffectiveSellingPrice(prod, customPrices);
    const priceStr = `Rp ${sellingPrice.toLocaleString('id-ID')}`;
    const statusStr = prod.availability === 'in_stock' ? '🟢 Stok Tersedia' : '🔴 Stok Habis';

    const detailText =
      `📦 <b>DETAIL PRODUK</b>\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `• Nama: <b>${escapeHtml(prod.name)}</b>\n` +
      `• Harga: <b>${escapeHtml(priceStr)}</b>\n` +
      `• Status: <b>${statusStr}</b>\n` +
      (prod.description
        ? `\n📝 <b>Deskripsi / Ketentuan:</b>\n${escapeHtml(prod.description.substring(0, 300))}\n`
        : '') +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `Sentuh tombol di bawah untuk langsung membuat invoice pembayaran QRIS:`;

    const buttons = [];
    if (prod.availability === 'in_stock') {
      buttons.push([
        {
          text: `💳 Beli Sekarang (${priceStr})`,
          callback_data: `buy_${prod.id}`,
        },
      ]);
    }
    const backPlat = platformId || matchProductPlatform(prod.name)?.id || 'all';
    buttons.push([
      { text: '◀️ Kembali ke Daftar Produk', callback_data: `plat_${backPlat}` },
      { text: '📂 Pilih Platform Lain', callback_data: 'menu_platforms' },
    ]);
    buttons.push([{ text: '🔙 Menu Utama', callback_data: 'menu_main' }]);

    await sendSafeMessage(ctx, botInstance, detailText, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: buttons },
    });
  } catch (err) {
    console.error('Failed to send product detail:', err);
    await sendSafeMessage(
      ctx,
      botInstance,
      '⚠️ Gagal memuat detail produk. Silakan coba kembali.',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🛍️ Buka Katalog Produk', callback_data: 'menu_products' }],
            [{ text: '🔙 Menu Utama', callback_data: 'menu_main' }],
          ],
        },
      }
    );
  }
}

/**
 * Display user profile
 */
export async function sendProfileMenu(ctx: Context, botInstance: ExtendedBot): Promise<void> {
  let balance = 0;
  let username = ctx.from?.username ? `@${ctx.from.username}` : '-';
  const firstName = ctx.from?.first_name || 'Member';
  const telegramId = ctx.from?.id ? String(ctx.from.id) : '-';

  try {
    const prof = await getSupplierProfile();
    balance = prof.balance || 0;
    if (prof.username) username = prof.username;
  } catch {
    // Ignore profile fetch failure
  }

  const profileText =
    `👤 <b>PROFIL PENGGUNA</b>\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `• Nama: <b>${escapeHtml(firstName)}</b>\n` +
    `• Username: <b>${escapeHtml(username)}</b>\n` +
    `• Telegram ID: <code>${escapeHtml(telegramId)}</code>\n` +
    `• Saldo Akun: <b>Rp ${balance.toLocaleString('id-ID')}</b>\n` +
    `• Status: <b>Active Member</b>\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `Gunakan menu di bawah untuk top-up atau belanja:`;

  const inlineMarkup = {
    inline_keyboard: [
      [
        { text: '💰 Deposit Saldo', callback_data: 'menu_deposit' },
        { text: '📩 Riwayat Pesanan', callback_data: 'menu_orders' },
      ],
      [{ text: '🔙 Kembali ke Menu Utama', callback_data: 'menu_main' }],
    ],
  };

  await sendSafeMessage(ctx, botInstance, profileText, {
    parse_mode: 'HTML',
    reply_markup: inlineMarkup,
  });
}

/**
 * Display deposit options
 */
export async function sendDepositMenu(ctx: Context, botInstance: ExtendedBot): Promise<void> {
  const depositText =
    `💰 <b>DEPOSIT / TOP UP SALDO</b>\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `Pilih nominal deposit yang Anda inginkan.\n` +
    `Sistem akan langsung membuat invoice QRIS instan otomatis:`;

  const inlineMarkup = {
    inline_keyboard: [
      [
        { text: 'Rp 10.000', callback_data: 'dep_10000' },
        { text: 'Rp 25.000', callback_data: 'dep_25000' },
      ],
      [
        { text: 'Rp 50.000', callback_data: 'dep_50000' },
        { text: 'Rp 100.000', callback_data: 'dep_100000' },
      ],
      [{ text: '🔙 Kembali ke Menu Utama', callback_data: 'menu_main' }],
    ],
  };

  await sendSafeMessage(ctx, botInstance, depositText, {
    parse_mode: 'HTML',
    reply_markup: inlineMarkup,
  });
}

/**
 * Display user's orders
 */
export async function sendOrdersMenu(ctx: Context, botInstance: ExtendedBot): Promise<void> {
  const chatId = ctx.chatId || ctx.callbackQuery?.message?.chat?.id || ctx.from?.id;
  const telegramId = ctx.from?.id ? String(ctx.from.id) : String(chatId);

  let ordersList: Order[] = [];
  try {
    const res = await query<Order>(
      `SELECT o.*, p.name as product_name
       FROM orders o
       JOIN users u ON o.user_id = u.id
       LEFT JOIN products p ON o.product_id = p.id
       WHERE u.telegram_id = $1
       ORDER BY o.created_at DESC
       LIMIT 5`,
      [telegramId]
    );
    ordersList = res.rows;
  } catch (err) {
    console.error('Failed to query orders:', err);
  }

  let text = `📩 <b>RIWAYAT PESANAN SAYA</b>\n━━━━━━━━━━━━━━━━━━━\n`;
  const buttons = [];

  if (ordersList.length === 0) {
    text += `Belum ada pesanan aktif.\nSilakan pilih menu <b>🟢 Produk</b> untuk mulai membeli akun digital!\n`;
  } else {
    for (const ord of ordersList) {
      const isUnpaid = ord.payment_status === 'unpaid';
      const statusIcon = isUnpaid
        ? '⏳'
        : ord.fulfillment_status === 'delivered'
          ? '🟢'
          : ord.fulfillment_status === 'processing'
            ? '🟡'
            : '⚪';
      const statusLabel = isUnpaid
        ? 'MENUNGGU PEMBAYARAN'
        : ord.fulfillment_status.toUpperCase();
      text += `• ${statusIcon} <code>${escapeHtml(ord.order_code)}</code> | Status: <b>${statusLabel}</b>\n`;
      const btnText = isUnpaid
        ? `💳 Bayar / Buka QRIS: ${ord.order_code}`
        : `🔍 Cek Status: ${ord.order_code}`;
      buttons.push([
        {
          text: btnText,
          callback_data: `status_${ord.order_code}`,
        },
      ]);
    }
  }

  buttons.push([
    { text: '🛍️ Beli Produk Baru', callback_data: 'menu_products' },
    { text: '🔙 Menu Utama', callback_data: 'menu_main' },
  ]);

  await sendSafeMessage(ctx, botInstance, text, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: buttons },
  });
}

/**
 * Extract QR code image URL and string from invoice_data column
 */
export function extractQrisFromInvoiceData(rawInvoiceData: unknown): {
  qrCodeUrl: string;
  qrString: string;
  checkoutUrl?: string;
} {
  if (!rawInvoiceData) return { qrCodeUrl: '', qrString: '' };
  let data: Record<string, unknown> = {};
  if (typeof rawInvoiceData === 'string') {
    try {
      data = JSON.parse(rawInvoiceData);
    } catch {
      data = {};
    }
  } else if (typeof rawInvoiceData === 'object') {
    data = rawInvoiceData as Record<string, unknown>;
  }

  // 1. Actions array from Midtrans Core API response
  const actions = (data.actions as Array<{ name: string; url: string }>) || [];
  const qrAction = actions.find((a) => a.name === 'generate-qr-code');
  let qrCodeUrl =
    (qrAction?.url as string) ||
    (data.qr_code_url as string) ||
    (data.qrCodeUrl as string) ||
    '';

  const qrString = (data.qr_string as string) || (data.qrString as string) || (data.qr as string) || '';
  const checkoutUrl = (data.checkout_url as string) || (data.checkoutUrl as string) || undefined;

  // Fallback: If qrString is a web URL
  if (!qrCodeUrl && qrString && (qrString.startsWith('http://') || qrString.startsWith('https://'))) {
    qrCodeUrl = qrString;
  } else if (!qrCodeUrl && qrString) {
    qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qrString)}`;
  }

  return { qrCodeUrl, qrString, checkoutUrl };
}

/**
 * Send or re-send QRIS invoice with dynamic QR image and payment instructions
 */
export async function sendOrderInvoice(
  ctx: Context,
  botInstance: ExtendedBot,
  order: Order & { product_name?: string; product_price?: number }
): Promise<void> {
  const { qrCodeUrl, qrString, checkoutUrl } = extractQrisFromInvoiceData(order.invoice_data);
  const prodName = order.product_name || 'Akun Digital';
  const priceStr = order.product_price
    ? `Rp ${order.product_price.toLocaleString('id-ID')}`
    : '-';

  const invoiceCaption =
    '🧾 <b>INVOICE PEMBAYARAN QRIS</b>\n' +
    '━━━━━━━━━━━━━━━━━━━\n' +
    `📦 <b>Produk:</b> ${escapeHtml(prodName)}\n` +
    `💰 <b>Total:</b> ${escapeHtml(priceStr)}\n` +
    `🆔 <b>Kode Order:</b> <code>${escapeHtml(order.order_code)}</code>\n` +
    `📊 <b>Status:</b> ⏳ <b>MENUNGGU PEMBAYARAN</b>\n` +
    '━━━━━━━━━━━━━━━━━━━\n\n' +
    '📌 <b>Instruksi Pembayaran:</b>\n' +
    '1. Scan kode QRIS di atas menggunakan GoPay, OVO, Dana, ShopeePay, BCA, atau Mobile Banking lainnya.\n' +
    '2. Pastikan nominal pembayaran sesuai.\n' +
    '3. Setelah pembayaran berhasil, kredensial akun akan dikirimkan otomatis ke sini.\n' +
    '4. Sentuh <b>🔄 Refresh Status Pembayaran</b> di bawah setelah kamu menyelesaikan pembayaran.';

  const invoiceButtonsRows: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [
    [{ text: '🔄 Refresh Status Pembayaran', callback_data: `status_${order.order_code}` }],
  ];

  if (checkoutUrl) {
    invoiceButtonsRows.push([
      { text: '🌐 Buka Link Pembayaran (Web)', url: checkoutUrl },
    ]);
  }

  invoiceButtonsRows.push([
    { text: '🛍️ Beli Produk Lain', callback_data: 'menu_products' },
    { text: '🔙 Menu Utama', callback_data: 'menu_main' },
  ]);

  const invoiceButtons = {
    inline_keyboard: invoiceButtonsRows,
  };

  if (qrCodeUrl) {
    try {
      const photoSent = await sendSafePhoto(ctx, botInstance, qrCodeUrl, {
        caption: invoiceCaption,
        parse_mode: 'HTML',
        reply_markup: invoiceButtons,
      });
      if (photoSent) return;
    } catch (photoErr) {
      console.warn('[Order Invoice] sendSafePhoto failed, falling back to message text:', photoErr);
    }
  }

  // Fallback if sendSafePhoto fails or photo URL is not available
  const fallbackMessage =
    invoiceCaption +
    (qrCodeUrl ? `\n\n🔗 <b>Link Gambar QRIS:</b> ${escapeHtml(qrCodeUrl)}` : '') +
    (qrString ? `\n\n📱 <b>String QRIS:</b> <code>${escapeHtml(qrString)}</code>` : '');

  await sendSafeMessage(ctx, botInstance, fallbackMessage, {
    parse_mode: 'HTML',
    reply_markup: invoiceButtons,
  });
}

/**
 * Display order status: re-sends QRIS invoice if UNPAID, or displays fulfillment info if PAID
 */
export async function sendOrderStatus(
  ctx: Context,
  botInstance: ExtendedBot,
  orderCode: string
): Promise<void> {
  const ordRes = await query<Order & { product_name: string; product_price: number }>(
    `SELECT o.*, p.name as product_name, p.price as product_price
     FROM orders o
     LEFT JOIN products p ON o.product_id = p.id
     WHERE o.order_code = $1 LIMIT 1`,
    [orderCode]
  );

  if (ordRes.rows.length === 0) {
    await sendSafeMessage(
      ctx,
      botInstance,
      `❌ Order <code>${escapeHtml(orderCode)}</code> tidak ditemukan.`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📩 Cek Riwayat Pesanan', callback_data: 'menu_orders' }],
            [{ text: '🔙 Menu Utama', callback_data: 'menu_main' }],
          ],
        },
      }
    );
    return;
  }

  const o = ordRes.rows[0];

  // If order is UNPAID, re-display the QRIS image & payment instructions
  if (o.payment_status === 'unpaid') {
    await sendOrderInvoice(ctx, botInstance, o);
    return;
  }

  // If order is PAID or EXPIRED
  const payStatusStr =
    o.payment_status === 'paid'
      ? '🟢 LUNAS (PAID)'
      : o.payment_status === 'expired'
        ? '🔴 KADALUWARSA (EXPIRED)'
        : escapeHtml(String(o.payment_status).toUpperCase());

  const fulStatusStr =
    o.fulfillment_status === 'delivered'
      ? '🟢 SELESAI (DELIVERED)'
      : o.fulfillment_status === 'processing'
        ? '🟡 DALAM PROSES (ANTREAN SISTEM)'
        : escapeHtml(String(o.fulfillment_status).toUpperCase());

  let statText =
    `🔍 <b>STATUS PESANAN</b>\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `• Kode Order: <code>${escapeHtml(o.order_code)}</code>\n` +
    `• Produk: <b>${escapeHtml(o.product_name || 'Akun Digital')}</b>\n` +
    `• Pembayaran: <b>${payStatusStr}</b>\n` +
    `• Pengiriman: <b>${fulStatusStr}</b>\n` +
    `━━━━━━━━━━━━━━━━━━━\n`;

  if (o.fulfillment_status === 'delivered') {
    statText += `✅ Akun digital kamu telah berhasil dikirimkan ke chat ini.\nSilakan periksa riwayat chat untuk detail akun.`;
  } else if (o.fulfillment_status === 'processing') {
    statText += `⏳ Pesanan kamu sedang disiapkan antrean sistem (estimasi 1–10 menit).`;
  }

  const buttons = [
    [{ text: '🔄 Refresh Status', callback_data: `status_${o.order_code}` }],
    [
      { text: '🛍️ Beli Produk Baru', callback_data: 'menu_products' },
      { text: '🔙 Menu Utama', callback_data: 'menu_main' },
    ],
  ];

  await sendSafeMessage(ctx, botInstance, statText, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: buttons },
  });
}

/**
 * Display Developer API Information
 */
export async function sendApiMenu(ctx: Context, botInstance: ExtendedBot): Promise<void> {
  const apiText =
    `🔥 <b>DEVELOPER API INTEGRATION</b>\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `Gunakan REST API untuk otomatisasi transaksi dari aplikasi atau bot kamu sendiri!\n\n` +
    `• <b>Base URL:</b> <code>https://api.prastyaaneki.biz.id</code>\n` +
    `• <b>Auth Header:</b> <code>x-api-key: &lt;your_key&gt;</code>\n` +
    `• <b>Dokumentasi:</b> ReDoc API interactive\n` +
    `━━━━━━━━━━━━━━━━━━━`;

  const inlineMarkup = {
    inline_keyboard: [
      [{ text: '📖 Buka ReDoc API Documentation ↗', url: 'https://api.prastyaaneki.biz.id/redoc' }],
      [{ text: '🔙 Kembali ke Menu Utama', callback_data: 'menu_main' }],
    ],
  };

  await sendSafeMessage(ctx, botInstance, apiText, {
    parse_mode: 'HTML',
    reply_markup: inlineMarkup,
  });
}

// =========================================================================
// OWNER / ADMIN PANEL FUNCTIONS (Khusus Telegram User ID 7133868769)
// =========================================================================

/**
 * Send Owner / Admin Dashboard Panel
 */
export async function sendAdminPanel(ctx: Context, botInstance: ExtendedBot): Promise<void> {
  if (!isAdmin(ctx.from?.id)) {
    await sendSafeMessage(
      ctx,
      botInstance,
      '⛔ <b>Akses Ditolak:</b> Panel ini khusus untuk Owner / Admin DaFung Hub.',
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '🔙 Menu Utama', callback_data: 'menu_main' }]],
        },
      }
    );
    return;
  }

  let balance = 0;
  try {
    const balRes = await getSupplierBalance();
    balance = balRes.balance || 0;
  } catch {}

  let pendingOrders: Order[] = [];
  try {
    pendingOrders = await getPendingQueueOrders();
  } catch {}
  const botStatus = await getBotStatus();

  const adminText =
    `👑 <b>PANEL OWNER & ADMIN DAFUNG HUB</b>\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `• <b>Owner:</b> @DappaSecc (<code>${ADMIN_TELEGRAM_ID}</code>)\n` +
    `• <b>Status Sistem:</b> ${botStatus === 'online' ? '🟢 ONLINE (Melayani Pembeli)' : '🔴 MAINTENANCE (Sedang Perbaikan)'}\n` +
    `• <b>Saldo Supplier Live:</b> <b>Rp ${balance.toLocaleString('id-ID')}</b>\n` +
    `• <b>Status Mode:</b> ${balance > 0 ? '🟢 H2H Auto-Fulfill' : '🟡 Mode Antrean (0 Modal)'}\n` +
    `• <b>Antrean Order:</b> <b>${pendingOrders.length} Pesanan Butuh Diproses</b>\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `Gunakan panel kontrol di bawah untuk mengelola bisnis:`;

  const adminButtons = {
    inline_keyboard: [
      [
        botStatus === 'online'
          ? { text: '🔴 Ubah ke Mode MAINTENANCE', callback_data: 'admin_set_maintenance' }
          : { text: '🟢 Aktifkan Bot (Set ONLINE)', callback_data: 'admin_set_online' },
      ],
      [
        { text: '💰 Atur & Kelola Harga Produk', callback_data: 'admin_prices' },
      ],
      [
        {
          text: `📦 Antrean Pesanan (${pendingOrders.length})`,
          callback_data: 'admin_queue',
        },
        { text: '💳 Cek Saldo Supplier', callback_data: 'admin_balance' },
      ],
      [
        { text: '📊 Riwayat Penjualan', callback_data: 'admin_orders' },
        { text: '👥 Tampilan Pembeli (Preview)', callback_data: 'menu_main' },
      ],
    ],
  };

  await sendSafeMessage(ctx, botInstance, adminText, {
    parse_mode: 'HTML',
    reply_markup: adminButtons,
  });
}

/**
 * Send Admin Order Queue (orders waiting for fulfillment)
 */
export async function sendAdminQueueMenu(ctx: Context, botInstance: ExtendedBot): Promise<void> {
  if (!isAdmin(ctx.from?.id)) return;

  const queueOrders = await getPendingQueueOrders();

  let text = `📦 <b>ANTREAN PESANAN MEMBUTUHKAN PROSES</b>\n━━━━━━━━━━━━━━━━━━━\n`;
  const buttons = [];

  if (queueOrders.length === 0) {
    text += `✅ <b>Semua pesanan selesai!</b> Tidak ada antrean order tertunda saat ini.\n`;
  } else {
    for (const ord of queueOrders) {
      text +=
        `• <b>${escapeHtml(ord.order_code)}</b>\n` +
        `  📦 ${escapeHtml(ord.product_name)} (Rp ${ord.product_price.toLocaleString('id-ID')})\n` +
        `  👤 Buyer: <code>${ord.telegram_id}</code>\n\n`;

      buttons.push([
        {
          text: `🚀 Proses H2H: ${ord.order_code}`,
          callback_data: `admin_process_${ord.order_code}`,
        },
      ]);
    }
    text += `━━━━━━━━━━━━━━━━━━━\n💡 <i>Atau kirim manual: <code>/kirim &lt;order_code&gt; &lt;kredensial&gt;</code></i>\n`;
  }

  buttons.push([
    { text: '🔄 Refresh Antrean', callback_data: 'admin_queue' },
    { text: '🔙 Kembali ke Panel Owner', callback_data: 'admin_panel' },
  ]);

  await sendSafeMessage(ctx, botInstance, text, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: buttons },
  });
}

/**
 * Send Admin Supplier Balance & Profile
 */
export async function sendAdminBalanceMenu(ctx: Context, botInstance: ExtendedBot): Promise<void> {
  if (!isAdmin(ctx.from?.id)) return;

  let balance = 0;
  let username = '@DappaSecc';
  let userId = 7133868769;

  try {
    const prof = await getSupplierProfile();
    balance = prof.balance || 0;
    if (prof.username) username = prof.username;
    if (prof.user_id) userId = prof.user_id;
  } catch {}

  const text =
    `💳 <b>INFORMASI SALDO & AKUN SUPPLIER</b>\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `• <b>Username Supplier:</b> ${escapeHtml(username)}\n` +
    `• <b>User ID Supplier:</b> <code>${userId}</code>\n` +
    `• <b>Saldo Deposit:</b> <b>Rp ${balance.toLocaleString('id-ID')}</b>\n` +
    `• <b>Status H2H:</b> ${balance > 0 ? '🟢 Saldo Tersedia (Order Instan Aktif)' : '🟡 Saldo Rp 0 (Mode Antrean Aktif)'}\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `Untuk mengaktifkan pengiriman instan 3 detik otomatis, Anda dapat melakukan top up deposit di website supplier:`;

  const buttons = {
    inline_keyboard: [
      [{ text: '🌐 Buka Website Supplier ↗', url: 'https://prastyaaneki.biz.id' }],
      [{ text: '🔙 Kembali ke Panel Owner', callback_data: 'admin_panel' }],
    ],
  };

  await sendSafeMessage(ctx, botInstance, text, {
    parse_mode: 'HTML',
    reply_markup: buttons,
  });
}

/**
 * Send Admin Recent Sales History
 */
export async function sendAdminOrdersMenu(ctx: Context, botInstance: ExtendedBot): Promise<void> {
  if (!isAdmin(ctx.from?.id)) return;

  let recentOrders: Array<Order & { product_name: string; telegram_id: string; product_price: number }> = [];
  try {
    const res = await query<
      Order & { product_name: string; telegram_id: string; product_price: number }
    >(
      `SELECT o.*, p.name as product_name, p.price as product_price, u.telegram_id
       FROM orders o
       JOIN products p ON o.product_id = p.id
       JOIN users u ON o.user_id = u.id
       ORDER BY o.created_at DESC
       LIMIT 8`
    );
    recentOrders = res.rows;
  } catch (err) {
    console.error('Failed to query admin orders:', err);
  }

  let text = `📊 <b>RIWAYAT TRANSAKSI TERAKHIR</b>\n━━━━━━━━━━━━━━━━━━━\n`;

  if (recentOrders.length === 0) {
    text += `Belum ada transaksi tercatat.\n`;
  } else {
    for (const o of recentOrders) {
      const statusIcon =
        o.fulfillment_status === 'delivered'
          ? '🟢'
          : o.fulfillment_status === 'processing'
            ? '🟡'
            : '⚪';
      text +=
        `${statusIcon} <code>${o.order_code}</code>\n` +
        `  📦 ${escapeHtml(o.product_name)} (Rp ${o.product_price.toLocaleString('id-ID')})\n` +
        `  • Bayar: <b>${o.payment_status.toUpperCase()}</b> | Status: <b>${o.fulfillment_status.toUpperCase()}</b>\n\n`;
    }
  }

  text += `━━━━━━━━━━━━━━━━━━━`;

  const buttons = {
    inline_keyboard: [
      [{ text: '🔙 Kembali ke Panel Owner', callback_data: 'admin_panel' }],
    ],
  };

  await sendSafeMessage(ctx, botInstance, text, {
    parse_mode: 'HTML',
    reply_markup: buttons,
  });
}

/**
 * Send Admin Prices Menu (view & manage manual product prices)
 */
export async function sendAdminPricesMenu(
  ctx: Context,
  botInstance: ExtendedBot,
  page: number = 0
): Promise<void> {
  if (!isAdmin(ctx.from?.id)) return;

  try {
    const [products, customPrices] = await Promise.all([
      getSupplierProducts().catch(() => []),
      getCustomPrices().catch(() => new Map<string, number>()),
    ]);

    const pageSize = 5;
    const totalPages = Math.ceil(products.length / pageSize) || 1;
    const safePage = Math.max(0, Math.min(page, totalPages - 1));
    const currentSlice = products.slice(safePage * pageSize, (safePage + 1) * pageSize);

    let text =
      `💰 <b>KELOLA HARGA PRODUK (SINKRON WEB & BOT)</b>\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `Daftar harga aktif saat ini (Halaman ${safePage + 1}/${totalPages}):\n\n`;

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

      const actionRow = [
        {
          text: `✏️ Ubah: ${prod.name.substring(0, 16)}...`,
          callback_data: `admin_editprice_${prod.id}`,
        },
      ];
      if (hasCustom) {
        actionRow.push({
          text: `🔄 Reset Default`,
          callback_data: `admin_resetprice_${prod.id}`,
        });
      }
      buttons.push(actionRow);
    }

    text +=
      `━━━━━━━━━━━━━━━━━━━\n` +
      `💡 <b>Cara Cepat Ubah Harga:</b>\n` +
      `Ketik perintah: <code>/editprice &lt;id_atau_nama&gt; &lt;harga&gt;</code>\n` +
      `Contoh: <code>/editprice capcut 28000</code>\n\n` +
      `🔄 <b>Kembalikan ke Rumus Auto:</b>\n` +
      `<code>/resetprice &lt;id_atau_nama&gt;</code>\n`;

    // Pagination buttons
    const navRow = [];
    if (safePage > 0) {
      navRow.push({ text: '◀️ Sebelumnya', callback_data: `admin_prices_page_${safePage - 1}` });
    }
    navRow.push({ text: `Hal ${safePage + 1}/${totalPages}`, callback_data: 'noop' });
    if (safePage < totalPages - 1) {
      navRow.push({ text: 'Berikutnya ▶️', callback_data: `admin_prices_page_${safePage + 1}` });
    }
    if (totalPages > 1) {
      buttons.push(navRow);
    }

    buttons.push([
      { text: '🔄 Refresh Harga', callback_data: 'admin_prices' },
      { text: '🔙 Kembali ke Panel Owner', callback_data: 'admin_panel' },
    ]);

    await sendSafeMessage(ctx, botInstance, text, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: buttons },
    });
  } catch (err) {
    console.error('[Admin] Error loading product prices:', err);
    await sendSafeMessage(
      ctx,
      botInstance,
      '⚠️ Gagal memuat daftar harga produk.',
      {
        reply_markup: {
          inline_keyboard: [[{ text: '🔙 Panel Owner', callback_data: 'admin_panel' }]],
        },
      }
    );
  }
}

/**
 * Register all menu button and callback handlers
 */
export function registerMenuHandlers(botInstance: ExtendedBot): void {
  // Centralized callback query dispatcher
  botInstance.on('callback_query', async (ctx: Context) => {
    const data = ctx.callbackQuery?.data || '';
    const userId = ctx.from?.id;
    console.log(`[Telegram Callback] data: "${data}" from user: ${userId} (@${ctx.from?.username})`);

    // Always immediately answer callback query so Telegram removes loading spinner
    try {
      await ctx.answerCallbackQuery?.();
    } catch {
      // Ignore answerCallbackQuery error
    }

    try {
      // OWNER / ADMIN CALLBACKS
      if (data === 'admin_panel') {
        await sendAdminPanel(ctx, botInstance);
      } else if (data === 'admin_set_maintenance') {
        if (isAdmin(ctx.from?.id)) {
          await setBotStatus('maintenance');
          await sendAdminPanel(ctx, botInstance);
        }
        return;
      } else if (data === 'admin_set_online') {
        if (isAdmin(ctx.from?.id)) {
          await setBotStatus('online');
          await sendAdminPanel(ctx, botInstance);
        }
        return;
      } else if (data === 'check_maintenance_status') {
        const currentStatus = await getBotStatus();
        if (currentStatus === 'maintenance') {
          await sendMaintenanceMessage(ctx, botInstance);
        } else {
          await sendMainMenu(ctx, botInstance);
        }
        return;
      } else if (data === 'admin_queue') {
        await sendAdminQueueMenu(ctx, botInstance);
      } else if (data === 'admin_balance') {
        await sendAdminBalanceMenu(ctx, botInstance);
      } else if (data === 'admin_orders') {
        await sendAdminOrdersMenu(ctx, botInstance);
      } else if (data === 'admin_prices') {
        await sendAdminPricesMenu(ctx, botInstance, 0);
      } else if (data.startsWith('admin_prices_page_')) {
        const page = parseInt(data.replace('admin_prices_page_', ''), 10) || 0;
        await sendAdminPricesMenu(ctx, botInstance, page);
      } else if (data.startsWith('admin_editprice_')) {
        const prodId = data.replace('admin_editprice_', '');
        await sendSafeMessage(
          ctx,
          botInstance,
          `✏️ <b>Ubah Harga Produk:</b> <code>${escapeHtml(prodId)}</code>\n\n` +
          `Silakan ketik di chat:\n` +
          `<code>/editprice ${escapeHtml(prodId)} &lt;harga_baru&gt;</code>\n\n` +
          `Contoh: <code>/editprice ${escapeHtml(prodId)} 30000</code>\n\n` +
          `Atau klik tombol <b>Reset ke Rumus Default</b> di bawah untuk mengembalikan harga ke rumus otomatis dari harga modal.`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔄 Reset ke Rumus Default', callback_data: `admin_resetprice_${prodId}` }],
                [{ text: '🔙 Kembali ke Daftar Harga', callback_data: 'admin_prices' }],
                [{ text: '🔙 Panel Owner', callback_data: 'admin_panel' }],
              ],
            },
          }
        );
      } else if (data.startsWith('admin_resetprice_')) {
        if (!isAdmin(ctx.from?.id)) return;
        const prodId = data.replace('admin_resetprice_', '');
        const { deleteCustomPrice, clearCustomPricesCache } = await import('../lib/custom-prices');
        await deleteCustomPrice(prodId);
        clearCustomPricesCache();
        await sendSafeMessage(
          ctx,
          botInstance,
          `✅ <b>Harga Berhasil Direset ke Pengaturan Awal!</b>\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `Produk <code>${escapeHtml(prodId)}</code> sekarang kembali otomatis dihitung dari harga modal supplier dengan rumus markup standar.\n\n` +
          `⚡ <i>Tersinkronisasi otomatis ke Website & Bot Telegram.</i>`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📋 Buka Daftar Harga Produk', callback_data: 'admin_prices' }],
                [{ text: '🔙 Panel Owner', callback_data: 'admin_panel' }],
              ],
            },
          }
        );
      } else if (data.startsWith('admin_process_')) {
        const orderCode = data.replace('admin_process_', '');
        const retryResult = await adminRetrySupplierFulfill(orderCode, botInstance);
        await sendSafeMessage(ctx, botInstance, retryResult.message, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📦 Cek Antrean Lagi', callback_data: 'admin_queue' }],
              [{ text: '🔙 Panel Owner', callback_data: 'admin_panel' }],
            ],
          },
        });
      }
      // INTERCEPT ALL BUYER CALLBACKS DURING MAINTENANCE
      else if (!isAdmin(ctx.from?.id) && (await getBotStatus()) === 'maintenance') {
        await sendMaintenanceMessage(ctx, botInstance);
        return;
      }
      // BUYER CALLBACKS
      else if (data === 'menu_main') {
        await sendMainMenu(ctx, botInstance);
      } else if (data === 'menu_products' || data === 'menu_platforms') {
        await sendPlatformsMenu(ctx, botInstance);
      } else if (data.startsWith('plat_')) {
        const platId = data.replace('plat_', '');
        await sendProductsMenu(ctx, botInstance, 0, platId);
      } else if (data.startsWith('pnav_')) {
        const rest = data.replace('pnav_', '');
        if (rest.includes('_')) {
          const parts = rest.split('_');
          const platId = parts[0];
          const page = parseInt(parts[1], 10) || 0;
          await sendProductsMenu(ctx, botInstance, page, platId);
        } else {
          const page = parseInt(rest, 10) || 0;
          await sendProductsMenu(ctx, botInstance, page, 'all');
        }
      } else if (data.startsWith('pdetail:') || data.startsWith('pdetail_')) {
        let platId = 'all';
        let prodId = '';
        if (data.startsWith('pdetail:')) {
          const rest = data.slice('pdetail:'.length);
          const colonIdx = rest.indexOf(':');
          if (colonIdx !== -1) {
            platId = rest.slice(0, colonIdx);
            prodId = rest.slice(colonIdx + 1);
          } else {
            prodId = rest;
          }
        } else {
          // Backward compatibility for legacy pdetail_
          const rest = data.replace('pdetail_', '');
          const lastUnderscore = rest.lastIndexOf('_');
          if (lastUnderscore !== -1) {
            platId = rest.slice(lastUnderscore + 1);
            prodId = rest.slice(0, lastUnderscore);
          } else {
            prodId = rest;
          }
        }
        await sendProductDetail(ctx, botInstance, prodId, platId);
      } else if (data.startsWith('buy_') || data.startsWith('buy:')) {
        const prodId = data.startsWith('buy_') ? data.replace('buy_', '') : data.replace('buy:', '');
        console.log(`[Buy Flow] Triggering purchase for product: ${prodId}`);
        await handleBuy(ctx, prodId, botInstance);
      } else if (data === 'menu_profile') {
        await sendProfileMenu(ctx, botInstance);
      } else if (data === 'menu_deposit') {
        await sendDepositMenu(ctx, botInstance);
      } else if (data.startsWith('dep_')) {
        const amount = parseInt(data.replace('dep_', ''), 10);
        const prodName = `Deposit Saldo Rp ${amount.toLocaleString('id-ID')}`;
        const fakeProdRes = await query<{ id: string }>(
          `INSERT INTO products (name, price, stock, is_active)
           VALUES ($1, $2, 999, true)
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [prodName, amount]
        );
        const prodId =
          fakeProdRes.rows[0]?.id ||
          (await query<{ id: string }>('SELECT id FROM products WHERE name = $1 LIMIT 1', [prodName]))
            .rows[0]?.id;
        if (prodId) {
          await handleBuy(ctx, prodId, botInstance);
        }
      } else if (data === 'menu_orders') {
        await sendOrdersMenu(ctx, botInstance);
      } else if (data.startsWith('status_')) {
        const orderCode = data.replace('status_', '');
        await sendOrderStatus(ctx, botInstance, orderCode);
      } else if (data.startsWith('qris_') || data.startsWith('show_qris_')) {
        const orderCode = data.startsWith('show_qris_')
          ? data.replace('show_qris_', '')
          : data.replace('qris_', '');
        await sendOrderStatus(ctx, botInstance, orderCode);
      }
    } catch (err) {
      console.error(`[Telegram Callback Error] failed handling "${data}":`, err);
    }
  });

  // Reply keyboard text listeners with precise regexes
  botInstance.hears(/^(?:👑\s*)?(?:panel\s*)?owner$/i, async (ctx: Context) => {
    if (isAdmin(ctx.from?.id)) {
      await sendAdminPanel(ctx, botInstance);
    } else {
      await sendMainMenu(ctx, botInstance);
    }
  });

  botInstance.hears(/^(?:🟢\s*)?produk$/i, async (ctx: Context) => {
    console.log(`[Telegram Text] Heard "Produk" from user ${ctx.from?.id}`);
    await sendPlatformsMenu(ctx, botInstance);
  });

  botInstance.hears(/^(?:👤\s*|🥷\s*)?profil$/i, async (ctx: Context) => {
    console.log(`[Telegram Text] Heard "Profil" from user ${ctx.from?.id}`);
    await sendProfileMenu(ctx, botInstance);
  });

  botInstance.hears(/^(?:💰\s*)?deposit$/i, async (ctx: Context) => {
    console.log(`[Telegram Text] Heard "Deposit" from user ${ctx.from?.id}`);
    await sendDepositMenu(ctx, botInstance);
  });

  botInstance.hears(/^(?:📩\s*)?pesanan(?:\s*saya)?$/i, async (ctx: Context) => {
    console.log(`[Telegram Text] Heard "Pesanan" from user ${ctx.from?.id}`);
    await sendOrdersMenu(ctx, botInstance);
  });

  botInstance.hears(/^(?:❓\s*)?(?:bantuan|help)$/i, async (ctx: Context) => {
    console.log(`[Telegram Text] Heard "Bantuan" from user ${ctx.from?.id}`);
    const helpMessage =
      'ℹ️ <b>Panduan & Garansi DaFung Hub:</b>\n\n' +
      '1. Setelah pembayaran QRIS berhasil, kredensial akun akan dikirimkan otomatis.\n' +
      '2. Jika ada kendala pesanan, silakan sertakan kode order kamu.\n' +
      '3. Admin akan meninjau komplain dan memproses penggantian atau refund.';
    await sendSafeMessage(ctx, botInstance, helpMessage, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🛍️ Buka Katalog Produk', callback_data: 'menu_products' }],
          [{ text: '🔙 Menu Utama', callback_data: 'menu_main' }],
        ],
      },
    });
  });
}
