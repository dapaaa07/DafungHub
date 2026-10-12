// Pricing & Margin Utility for DaFung Hub

export const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID || '7133868769';

/**
 * Check if a given Telegram ID is the Owner / Admin
 */
export function isAdmin(telegramId: string | number | undefined | null): boolean {
  if (!telegramId) return false;
  return String(telegramId) === ADMIN_TELEGRAM_ID;
}

/**
 * Rounding to market standard (e.g. nearest 500 IDR)
 */
export function roundToMarketStandard(amount: number, interval: number = 500): number {
  if (amount <= 0) return 0;
  return Math.ceil(amount / interval) * interval;
}

/**
 * Sakurupiah Payment Gateway Channel Configurations
 */
export interface GatewayChannelConfig {
  rate: number;
  flat: number;
  name: string;
}

export const GATEWAY_CHANNELS: Record<string, GatewayChannelConfig> = {
  QRIS: { rate: 0.007, flat: 350, name: 'QRIS Standard' },
  QRISC: { rate: 0.007, flat: 100, name: 'QRISC' },
  QRISMU: { rate: 0.008, flat: 250, name: 'QRISMU' },
  QRIS2: { rate: 0.009, flat: 0, name: 'QRIS2' },
  SHOPEEPAY: { rate: 0.03, flat: 0, name: 'ShopeePay' },
  GOPAY: { rate: 0.03, flat: 0, name: 'GoPay' },
  BCAVA: { rate: 0.0, flat: 4900, name: 'BCA Virtual Account' },
  BAGVA: { rate: 0.0, flat: 4200, name: 'Artha Graha VA' },
  VA_GENERAL: { rate: 0.0, flat: 3500, name: 'General VA' },
  RETAIL_OUTLET: { rate: 0.0, flat: 3000, name: 'Indomaret / Alfamart' },
};

/**
 * Calculate payment gateway deduction fee for a given nominal:
 * Fee(T, c) = (T * Rate) + Flat
 */
export function calculateGatewayFee(amount: number, channelCode: string = 'QRIS'): number {
  if (amount <= 0) return 0;
  const cfg = GATEWAY_CHANNELS[channelCode] || GATEWAY_CHANNELS.QRIS;
  return (amount * cfg.rate) + cfg.flat;
}

/**
 * Default Margin Configuration
 */
export interface MarginConfig {
  defaultFlatMarkup: number; // e.g. Rp 5.000
  minProfit: number;
}

export const defaultMarginConfig: MarginConfig = {
  defaultFlatMarkup: 5000,
  minProfit: 2000,
};

/**
 * Calculate the selling price based on modal price from supplier.
 * Includes safety protection against margin erosion for high-ticket items.
 */
export function calculateSellingPrice(modalPrice: number, customMarkup?: number): number {
  if (modalPrice <= 0) return 0;

  let markup = customMarkup ?? defaultMarginConfig.defaultFlatMarkup;

  // Dynamic Tiered Margin:
  // - Cheap products (under 10k, e.g. Canva 2.9k): markup +3k -> sells at ~5.9k -> 6k
  // - Medium products (under 50k): markup +5k
  // - Premium products (above 50k, e.g. Netflix 69.6k): markup +10k -> sells at ~79.6k -> 80k
  if (customMarkup === undefined) {
    if (modalPrice < 10000) {
      markup = 3000;
    } else if (modalPrice < 50000) {
      markup = 5000;
    } else if (modalPrice < 500000) {
      markup = 10000;
    } else {
      // High value safety protection (> 500k): minimum 5% markup to prevent zero-profit erosion
      markup = Math.max(15000, Math.round(modalPrice * 0.05));
    }
  }

  const rawSellingPrice = modalPrice + markup;
  return roundToMarketStandard(rawSellingPrice, 500);
}

/**
 * Dynamic Pricing Engine (Cost-Plus Protection Model):
 * Guarantees exact net profit after gateway fee deduction.
 *
 * Mathematical derivation:
 * Price - Fee(Price) - COGS = Target_Profit
 * Price * (1 - R_c) - F_c - COGS = Target_Profit
 * Price = (COGS + Target_Profit + F_c) / (1 - R_c)
 */
export function calculateProtectedSellingPrice(
  cogs: number,
  targetProfit: number = 5000,
  channelCode: string = 'QRIS',
  interval: number = 500
): number {
  if (cogs <= 0) return 0;
  const cfg = GATEWAY_CHANNELS[channelCode] || GATEWAY_CHANNELS.QRIS;
  const rawPrice = (cogs + targetProfit + cfg.flat) / (1.0 - cfg.rate);
  return roundToMarketStandard(rawPrice, interval);
}

/**
 * Calculate net profit after gateway deduction
 */
export function calculateProfit(
  sellingPrice: number,
  modalPrice: number,
  channelCode?: string
): number {
  if (sellingPrice <= modalPrice) return 0;
  if (!channelCode) {
    return Math.max(0, sellingPrice - modalPrice);
  }
  const fee = calculateGatewayFee(sellingPrice, channelCode);
  const net = sellingPrice - fee - modalPrice;
  return Math.max(0, Math.round(net));
}

export const CS_WHATSAPP_NUMBER = '081294950241';
export const CS_WHATSAPP_INTL = '6281294950241';
export const TELEGRAM_BOT_USERNAME = 'dafung_hub_bot';

/**
 * Format IDR currency format (e.g. Rp 35.000)
 */
export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Generate perceived retail / official price for comparison / discounts
 */
export function calculateOriginalPrice(sellingPrice: number): number {
  const multiplier = 1.35; // ~35% higher standard retail price
  const raw = Math.round((sellingPrice * multiplier) / 1000) * 1000;
  return Math.max(sellingPrice + 10000, raw);
}

// =========================================================================
// UNIFIED PRODUCT PRICING RESOLUTION (CLIENT & SERVER SAFE)
// =========================================================================

/**
 * Get effective selling price: custom price override (if set) or calculated supplier price
 */
export function getEffectiveSellingPrice(
  product: { id: string; name?: string; price_idr: number },
  customPricesMap?: Map<string, number>
): number {
  if (customPricesMap && customPricesMap.size > 0) {
    // 1. Direct match by product id
    if (customPricesMap.has(product.id)) {
      return customPricesMap.get(product.id)!;
    }
    // 2. Direct match by exact name
    if (product.name && customPricesMap.has(product.name)) {
      return customPricesMap.get(product.name)!;
    }
    // 3. Case-insensitive match or alias keyword match
    const lowerName = product.name?.toLowerCase() || '';
    const lowerId = product.id.toLowerCase();
    for (const [key, val] of customPricesMap.entries()) {
      const lowerKey = key.toLowerCase();
      if (lowerKey === lowerId || (lowerName && lowerKey === lowerName)) {
        return val;
      }
    }
  }

  return calculateSellingPrice(product.price_idr);
}



