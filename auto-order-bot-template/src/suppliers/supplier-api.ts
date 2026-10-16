import { config } from '../../config/bot.config';

export interface SupplierProduct {
  id: string;
  name: string;
  availability: 'in_stock' | 'out_of_stock' | string;
  price_idr: number;
  description: string;
  requires_email?: boolean;
}

export interface SupplierOrderResponse {
  order_id: string;
  product_id: string;
  status: 'processing' | 'completed' | 'failed' | string;
  delivered_key?: string;
  delivered_keys?: string[];
  total_price: number;
}

/**
 * Filter to exclude testing or developer sandbox items
 */
export function isTestProduct(product: { id?: string; name?: string; description?: string }): boolean {
  if (!config.supplier.filterTestProducts) return false;
  const id = (product.id || '').toLowerCase();
  const name = (product.name || '').toLowerCase();
  const desc = (product.description || '').toLowerCase();
  return (
    id.startsWith('loc_test') ||
    id.startsWith('test_') ||
    id === 'test' ||
    /\btest(?:ing)?\b/i.test(id) ||
    /\btest\b/i.test(name) ||
    /\btesting\b/i.test(name) ||
    /\bsandbox\b/i.test(name) ||
    /\btesting developer\b/i.test(desc)
  );
}

async function requestSupplier<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${config.supplier.baseUrl.replace(/\/+$/, '')}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.supplier.apiKey,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supplier API error [${response.status}]: ${errorText}`);
  }

  return (await response.json()) as T;
}

export async function getSupplierProducts(): Promise<SupplierProduct[]> {
  if (!config.supplier.enabled || !config.supplier.baseUrl) {
    return [];
  }
  const data = await requestSupplier<{ products: SupplierProduct[] }>('/v1/products');
  const products = data.products || [];
  return products.filter((p) => !isTestProduct(p));
}

export async function getSupplierBalance(): Promise<{ balance: number; currency: string }> {
  if (!config.supplier.enabled || !config.supplier.baseUrl) {
    return { balance: 0, currency: config.store.currency };
  }
  return await requestSupplier<{ balance: number; currency: string }>('/v1/balance');
}

export async function createSupplierOrder(
  productId: string,
  quantity: number = 1,
  email?: string
): Promise<SupplierOrderResponse> {
  return await requestSupplier<SupplierOrderResponse>('/v1/order', {
    method: 'POST',
    body: JSON.stringify({
      product_id: productId,
      quantity,
      ...(email ? { email } : {}),
    }),
  });
}
