import { query } from './db';

let cachedCustomPrices: Map<string, number> | null = null;
let customPricesExpiry = 0;
const PRICES_CACHE_TTL_MS = 5000;

export async function getCustomPrices(): Promise<Map<string, number>> {
  const now = Date.now();
  if (cachedCustomPrices !== null && now < customPricesExpiry) {
    return cachedCustomPrices;
  }

  const priceMap = new Map<string, number>();
  try {
    const res = await query<{ product_id: string; custom_price: number }>(
      'SELECT product_id, custom_price FROM product_prices'
    );
    for (const row of res.rows) {
      priceMap.set(row.product_id, Number(row.custom_price));
    }
    cachedCustomPrices = priceMap;
    customPricesExpiry = now + PRICES_CACHE_TTL_MS;
    return priceMap;
  } catch (err) {
    console.error('[CustomPrices] Failed to fetch custom prices from DB, using fallback cache:', err);
    return cachedCustomPrices ?? priceMap;
  }
}

export async function setCustomPrice(
  productId: string,
  price: number,
  productName?: string
): Promise<void> {
  const cleanId = productId.trim();
  const cleanPrice = Math.max(0, Math.round(price));

  if (!cachedCustomPrices) {
    cachedCustomPrices = new Map<string, number>();
  }
  cachedCustomPrices.set(cleanId, cleanPrice);
  customPricesExpiry = Date.now() + PRICES_CACHE_TTL_MS;

  try {
    await query(
      `INSERT INTO product_prices (product_id, product_name, custom_price, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (product_id) DO UPDATE
       SET custom_price = EXCLUDED.custom_price,
           product_name = COALESCE(EXCLUDED.product_name, product_prices.product_name),
           updated_at = CURRENT_TIMESTAMP`,
      [cleanId, productName || null, cleanPrice]
    );

    await query(
      `UPDATE products SET price = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 OR name = $3`,
      [cleanPrice, cleanId, productName || cleanId]
    ).catch(() => {});
  } catch (err) {
    console.error('[CustomPrices] Failed to persist custom price to DB:', err);
  }
}

export async function deleteCustomPrice(productId: string): Promise<void> {
  const cleanId = productId.trim();
  if (cachedCustomPrices) {
    cachedCustomPrices.delete(cleanId);
  }
  customPricesExpiry = Date.now() + PRICES_CACHE_TTL_MS;

  try {
    await query(`DELETE FROM product_prices WHERE product_id = $1`, [cleanId]);
  } catch (err) {
    console.error('[CustomPrices] Failed to delete custom price from DB:', err);
  }
}

export function clearCustomPricesCache(): void {
  cachedCustomPrices = null;
  customPricesExpiry = 0;
}
