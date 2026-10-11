// Supplier API Client for prastyaaneki.biz.id

if (!process.env.SUPPLIER_API_KEY) {
  try {
    process.loadEnvFile?.();
  } catch {
    // Ignore error if .env does not exist
  }
}

const SUPPLIER_BASE_URL =
  process.env.SUPPLIER_API_URL || 'https://api.prastyaaneki.biz.id';
const SUPPLIER_API_KEY = process.env.SUPPLIER_API_KEY || '';

export interface SupplierProduct {
  id: string;
  name: string;
  availability: 'in_stock' | 'out_of_stock';
  price_idr: number;
  description: string;
  requires_email: boolean;
}

export interface SupplierProfile {
  code: number;
  success: boolean;
  user_id: number;
  username: string;
  first_name: string;
  balance: number;
  currency: string;
  stats?: {
    total_orders: number;
    total_spent: number;
  };
  joined_at?: string;
}

export interface SupplierOrderResponse {
  code: number;
  success: boolean;
  order_id?: number | string;
  status?: string;
  delivered_key?: string;
  delivered_keys?: string[];
  message?: string;
}

/**
 * Make an authenticated HTTP request to the supplier API
 */
async function supplierRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${SUPPLIER_BASE_URL}${endpoint}`;
  const headers = {
    'x-api-key': SUPPLIER_API_KEY,
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supplier API error [${response.status}] ${response.statusText}: ${errorText}`);
  }

  return (await response.json()) as T;
}

/**
 * Fetch available products catalogue from supplier
 */
export async function getSupplierProducts(): Promise<SupplierProduct[]> {
  const data = await supplierRequest<{ products: SupplierProduct[] }>('/v1/products');
  return data.products || [];
}

/**
 * Fetch current user balance from supplier
 */
export async function getSupplierBalance(): Promise<{ balance: number; currency: string }> {
  return await supplierRequest<{ balance: number; currency: string }>('/v1/balance');
}

/**
 * Fetch user profile from supplier
 */
export async function getSupplierProfile(): Promise<SupplierProfile> {
  return await supplierRequest<SupplierProfile>('/v1/profile');
}

/**
 * Create order with supplier
 */
export async function createSupplierOrder(
  productId: string,
  quantity: number = 1,
  email?: string
): Promise<SupplierOrderResponse> {
  return await supplierRequest<SupplierOrderResponse>('/v1/order', {
    method: 'POST',
    body: JSON.stringify({
      product_id: productId,
      quantity,
      ...(email ? { email } : {}),
    }),
  });
}
