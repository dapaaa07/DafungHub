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
 * Default Margin Configuration
 * Can be flat or tier-based depending on product modal price
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
 * Calculate the selling price based on modal price from supplier
 */
export function calculateSellingPrice(modalPrice: number, customMarkup?: number): number {
  if (modalPrice <= 0) return 0;

  let markup = customMarkup ?? defaultMarginConfig.defaultFlatMarkup;

  // Dynamic Tiered Margin:
  // - Cheap products (under 10k, e.g. Canva 2.9k): markup +3k -> sells at ~5.9k
  // - Medium products (under 50k): markup +5k
  // - Premium products (above 50k, e.g. Netflix 69.6k): markup +10k -> sells at ~79.6k
  if (customMarkup === undefined) {
    if (modalPrice < 10000) {
      markup = 3000;
    } else if (modalPrice < 50000) {
      markup = 5000;
    } else {
      markup = 10000;
    }
  }

  const rawSellingPrice = modalPrice + markup;
  // Round to nearest 500 IDR for clean psychological pricing
  return Math.ceil(rawSellingPrice / 500) * 500;
}

/**
 * Calculate net profit margin
 */
export function calculateProfit(sellingPrice: number, modalPrice: number): number {
  return Math.max(0, sellingPrice - modalPrice);
}
