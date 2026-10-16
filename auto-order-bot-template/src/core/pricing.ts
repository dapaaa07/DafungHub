import { config } from '../../config/bot.config';

export interface GatewayFeeConfig {
  rate: number;
  flat: number;
  name: string;
}

export const GATEWAY_FEES: Record<string, GatewayFeeConfig> = {
  QRIS: { rate: 0.007, flat: 350, name: 'QRIS Standard' },
  QRISC: { rate: 0.007, flat: 100, name: 'QRISC' },
  QRIS2: { rate: 0.009, flat: 0, name: 'QRIS2' },
  SHOPEEPAY: { rate: 0.03, flat: 0, name: 'ShopeePay Direct' },
  GOPAY: { rate: 0.03, flat: 0, name: 'GoPay Direct' },
  VA_GENERAL: { rate: 0.0, flat: 3500, name: 'Virtual Account' },
};

/**
 * Rounding to market standard (e.g. nearest 500 IDR)
 */
export function roundToMarketStandard(amount: number, interval?: number): number {
  if (amount <= 0) return 0;
  const step = interval ?? config.pricing.roundingInterval;
  return Math.ceil(amount / step) * step;
}

/**
 * Calculate payment gateway deduction fee for a given amount:
 * Fee(T, c) = (T * Rate) + Flat
 */
export function calculateGatewayFee(amount: number, channelCode: string = 'QRIS'): number {
  if (amount <= 0) return 0;
  const feeCfg = GATEWAY_FEES[channelCode] || GATEWAY_FEES.QRIS;
  return amount * feeCfg.rate + feeCfg.flat;
}

/**
 * Calculate selling price from supplier modal using configured tiered markup rules
 */
export function calculateSellingPrice(modalPrice: number, customMarkup?: number): number {
  if (modalPrice <= 0) return 0;

  if (customMarkup !== undefined) {
    return roundToMarketStandard(modalPrice + customMarkup);
  }

  let chosenMarkup = config.pricing.defaultFlatMarkup;

  for (const rule of config.pricing.tieredMarkup) {
    if (modalPrice < rule.maxModal) {
      chosenMarkup = rule.markup;
      break;
    }
  }

  // Safety protection for high-value items (> 500k)
  if (modalPrice >= 500000) {
    chosenMarkup = Math.max(15000, Math.round(modalPrice * 0.05));
  }

  return roundToMarketStandard(modalPrice + chosenMarkup);
}

/**
 * Dynamic Cost-Plus Protection Model:
 * Computes price to guarantee exact net profit after gateway fee deduction:
 * Price = (COGS + Target_Profit + F_c) / (1 - R_c)
 */
export function calculateProtectedSellingPrice(
  cogs: number,
  targetProfit: number = 5000,
  channelCode: string = 'QRIS'
): number {
  if (cogs <= 0) return 0;
  const cfg = GATEWAY_FEES[channelCode] || GATEWAY_FEES.QRIS;
  const rawPrice = (cogs + targetProfit + cfg.flat) / (1.0 - cfg.rate);
  return roundToMarketStandard(rawPrice);
}

/**
 * Calculate net profit after gateway fee deduction
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
  return Math.max(0, Math.round(sellingPrice - fee - modalPrice));
}

/**
 * Format currency string (e.g. "Rp 25.000")
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: config.store.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Get effective selling price: custom price override (if set) or calculated supplier price
 */
export function getEffectiveSellingPrice(
  product: { id: string; name?: string; price_idr: number },
  customPricesMap?: Map<string, number>
): number {
  if (customPricesMap && customPricesMap.size > 0) {
    if (customPricesMap.has(product.id)) {
      return customPricesMap.get(product.id)!;
    }
    if (product.name && customPricesMap.has(product.name)) {
      return customPricesMap.get(product.name)!;
    }
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
