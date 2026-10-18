/**
 * ==============================================================================
 * CENTRALIZED STORE & BOT CONFIGURATION
 * ==============================================================================
 * Sesuaikan seluruh konfigurasi toko, markup harga, gateway, dan pesan bot di sini.
 */

export interface TieredMarkupRule {
  maxModal: number;
  markup: number;
}

export interface BotConfig {
  store: {
    name: string;
    tagline: string;
    botUsername: string;
    supportWhatsApp: string;
    supportWhatsAppIntl: string;
    channelUrl?: string;
    currency: string;
    currencySymbol: string;
  };
  admin: {
    telegramIds: string[];
    ownerId: string;
  };
  pricing: {
    defaultFlatMarkup: number;
    roundingInterval: number;
    enableCostPlusProtection: boolean;
    tieredMarkup: TieredMarkupRule[];
  };
  gateways: {
    defaultGateway: 'shopeepay' | 'sakurupiah' | 'midtrans' | 'manual';
    shopeepay: {
      apiKey: string;
      baseUrl?: string;
      staticQris?: string;
    };
    sakurupiah: {
      apiId: string;
      apiKey: string;
      mode: 'sandbox' | 'production';
      baseUrl?: string;
    };
    midtrans: {
      serverKey: string;
      clientKey: string;
      isProduction: boolean;
    };
    manual: {
      bankName: string;
      accountNumber: string;
      accountHolder: string;
      qrisImageUrl?: string;
    };
  };
  supplier: {
    enabled: boolean;
    baseUrl: string;
    apiKey: string;
    filterTestProducts: boolean;
  };
  messages: {
    welcomeGreeting: string;
    maintenanceNotice: string;
    orderPaidSuccess: string;
    orderInQueue: string;
  };
}

// Auto-load environment variables if not loaded
if (!process.env.TELEGRAM_BOT_TOKEN) {
  try {
    process.loadEnvFile?.();
  } catch {}
}

const adminIdsEnv = (process.env.ADMIN_TELEGRAM_IDS || '7133868769')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const config: BotConfig = {
  store: {
    name: process.env.STORE_NAME || 'Auto Store',
    tagline: process.env.STORE_TAGLINE || 'Bot Pemesanan Akun Digital Otomatis 24 Jam',
    botUsername: process.env.TELEGRAM_BOT_USERNAME || 'auto_store_bot',
    supportWhatsApp: process.env.SUPPORT_WHATSAPP || '081234567890',
    supportWhatsAppIntl: process.env.SUPPORT_WHATSAPP_INTL || '6281234567890',
    channelUrl: process.env.STORE_CHANNEL_URL || 'https://t.me/MyStoreChannel',
    currency: 'IDR',
    currencySymbol: 'Rp',
  },

  admin: {
    telegramIds: adminIdsEnv,
    ownerId: adminIdsEnv[0] || '7133868769',
  },

  pricing: {
    defaultFlatMarkup: 5000,
    roundingInterval: 500,
    enableCostPlusProtection: true,
    // Aturan markup berjenjang berdasarkan modal supplier
    tieredMarkup: [
      { maxModal: 10000, markup: 3000 },
      { maxModal: 50000, markup: 5000 },
      { maxModal: 500000, markup: 10000 },
    ],
  },

  gateways: {
    defaultGateway: (process.env.DEFAULT_PAYMENT_GATEWAY as 'shopeepay' | 'sakurupiah' | 'midtrans' | 'manual') || 'shopeepay',
    shopeepay: {
      apiKey: process.env.SHOPEEPAY_API_KEY || '',
      baseUrl: process.env.SHOPEEPAY_API_URL || 'https://shopee.prastyaaneki.biz.id',
      staticQris: process.env.SHOPEEPAY_STATIC_QRIS,
    },
    sakurupiah: {
      apiId: process.env.SAKURUPIAH_API_ID || '',
      apiKey: process.env.SAKURUPIAH_API_KEY || '',
      mode: (process.env.SAKURUPIAH_MODE as 'sandbox' | 'production') || 'sandbox',
      baseUrl: process.env.SAKURUPIAH_API_URL,
    },
    midtrans: {
      serverKey: process.env.MIDTRANS_SERVER_KEY || '',
      clientKey: process.env.MIDTRANS_CLIENT_KEY || '',
      isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
    },
    manual: {
      bankName: process.env.MANUAL_BANK_NAME || 'BCA',
      accountNumber: process.env.MANUAL_ACCOUNT_NUMBER || '1234567890',
      accountHolder: process.env.MANUAL_ACCOUNT_HOLDER || 'Nama Pemilik Rekening',
      qrisImageUrl: process.env.MANUAL_QRIS_URL,
    },
  },

  supplier: {
    enabled: Boolean(process.env.SUPPLIER_BASE_URL),
    baseUrl: process.env.SUPPLIER_BASE_URL || '',
    apiKey: process.env.SUPPLIER_API_KEY || '',
    filterTestProducts: true,
  },

  messages: {
    welcomeGreeting: 'Selamat datang di <b>{storeName}</b> — Solusi Cepat Kebutuhan Digital Anda.',
    maintenanceNotice: '⚠️ Layanan bot kami saat ini sedang dalam pemeliharaan (maintenance) untuk peningkatan performa. Silakan hubungi admin kami via WhatsApp jika membutuhkan bantuan darurat.',
    orderPaidSuccess: '🎉 <b>PEMBAYARAN DITERIMA & PESANAN SELESAI!</b>',
    orderInQueue: '🧾 <b>PEMBAYARAN DITERIMA (MODE ANTREAN)</b>\n\nPesanan Anda sedang disiapkan oleh sistem kami.',
  },
};

/**
 * Helper to check if a Telegram User ID has Admin / Owner privileges
 */
export function isBotAdmin(telegramId: string | number | undefined | null): boolean {
  if (!telegramId) return false;
  const idStr = String(telegramId).trim();
  return config.admin.telegramIds.includes(idStr);
}
