import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY_API_URL = '@dafung_admin_api_url';
const STORAGE_KEY_TOKEN = '@dafung_admin_token';

export const DEFAULT_API_URL = 'https://dafung-hub.vercel.app';

export async function getBaseApiUrl(): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY_API_URL);
    if (saved && saved.trim()) return saved.trim().replace(/\/+$/, '');
  } catch {
    // Fallback to default
  }
  return DEFAULT_API_URL;
}

export async function setBaseApiUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY_API_URL, url.trim().replace(/\/+$/, ''));
}

export async function getAdminToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(STORAGE_KEY_TOKEN);
  } catch {
    return null;
  }
}

export async function setAdminToken(token: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY_TOKEN, token.trim());
}

export async function clearAdminToken(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY_TOKEN);
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = await getBaseApiUrl();
  const token = await getAdminToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { 'x-admin-key': token, Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg = data?.error || `HTTP ${response.status}: ${response.statusText}`;
    throw new Error(errorMsg);
  }

  return data as T;
}

export interface DashboardData {
  stats: {
    todayRevenue: number;
    todayOrders: number;
    totalRevenue: number;
    totalOrders: number;
    pendingFulfillment: number;
    totalUsers: number;
    vipUsers: number;
  };
  supplier: {
    balance: number;
    currency: string;
    username: string;
  };
  shopeepay: {
    isOnline: boolean;
    gatewayUrl: string;
  };
  bot: {
    isMaintenance: boolean;
  };
  recentOrders: Array<{
    order_code: string;
    product_name: string;
    price: number;
    fulfillment_status: string;
    payment_status: string;
    telegram_id: string;
    username: string | null;
    created_at: string;
  }>;
}

export interface OrderItem {
  id: string;
  orderCode: string;
  productId: string;
  productName: string;
  price: number;
  paymentStatus: string;
  fulfillmentStatus: string;
  isDelivered: boolean;
  deliveredAt: string | null;
  createdAt: string;
  hasEncryptedCredential: boolean;
  customer: {
    telegramId: string;
    username: string | null;
    firstName: string | null;
    isVip: boolean;
  };
  invoiceData: Record<string, unknown>;
}

export interface EnrichedProductItem {
  id: string;
  name: string;
  availability: 'in_stock' | 'out_of_stock';
  price_idr: number;
  description: string;
  requires_email: boolean;
  platformId: string;
  platformName: string;
  platformIcon: string;
  category: string;
  sellingPrice: number;
  originalPrice: number;
  durationText: string;
  warrantyText: string;
  is_manual?: boolean;
  stock?: number;
}

export interface UserItem {
  id: string;
  telegramId: string;
  role: string;
  balance: number;
  username: string | null;
  firstName: string | null;
  membershipTier: string;
  membershipExpiresAt: string | null;
  isVip: boolean;
  createdAt: string;
  stats: {
    totalOrders: number;
    totalSpent: number;
  };
}

export interface ShopeePayTransaction {
  transactionId: string;
  amount: number;
  formattedAmount: string;
  status: string;
  time: string;
  issuer: string;
  isMatched: boolean;
  order: {
    orderCode: string;
    productName: string;
    customer: string;
    telegramId: string;
  } | null;
}

export interface ShopeePayLedgerData {
  summary: {
    totalTransactions: number;
    matchedOrdersCount: number;
    unmatchedCount: number;
    totalIncomingAll: number;
    totalIncomingToday: number;
    formattedTotalToday: string;
    formattedTotalAll: string;
  };
  transactions: ShopeePayTransaction[];
}

export interface NotificationCheckData {
  hasNewOrders: boolean;
  newOrdersCount: number;
  pendingFulfillmentCount: number;
  newPaidOrders: Array<{
    id: string;
    orderCode: string;
    productName: string;
    price: number;
    formattedPrice: string;
    fulfillmentStatus: string;
    createdAt: string;
    customer: {
      telegramId: string;
      username: string | null;
      firstName: string | null;
      isVip: boolean;
    };
  }>;
  serverTime: string;
}

// API Methods
export const api = {
  login: (key: string) =>
    request<{ success: boolean; token: string }>('/api/admin/auth', {
      method: 'POST',
      body: JSON.stringify({ key }),
    }),

  getDashboard: () => request<DashboardData>('/api/admin/dashboard'),

  getOrders: (params?: { status?: string; search?: string; page?: number }) => {
    const sp = new URLSearchParams();
    if (params?.status) sp.set('status', params.status);
    if (params?.search) sp.set('search', params.search);
    if (params?.page) sp.set('page', String(params.page));
    return request<{ success: boolean; orders: OrderItem[]; pagination: any }>(
      `/api/admin/orders?${sp.toString()}`
    );
  },

  fulfillOrder: (
    orderCode: string,
    credentials?: string,
    media?: { name: string; content: string; isPhoto?: boolean }
  ) =>
    request<{ success: boolean; message: string; sentToTelegram?: boolean }>(
      `/api/admin/orders/${encodeURIComponent(orderCode)}/fulfill`,
      {
        method: 'POST',
        body: JSON.stringify({ credentials, media, file: media }),
      }
    ),

  getProducts: () =>
    request<{ success: boolean; count: number; products: EnrichedProductItem[] }>(
      '/api/admin/products'
    ),

  createProduct: (data: {
    name: string;
    price: number;
    stock: number;
    description?: string;
    requiresEmail?: boolean;
  }) =>
    request<{ success: boolean; message: string; product: any }>(
      '/api/admin/products',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ),

  updateProduct: (
    id: string,
    updates: {
      price?: number;
      stock?: number;
      isActive?: boolean;
      description?: string;
      name?: string;
    }
  ) =>
    request<{ success: boolean; message: string }>(
      `/api/admin/products/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        body: JSON.stringify(updates),
      }
    ),

  toggleProduct: (id: string) =>
    request<{ success: boolean; message: string }>(
      `/api/admin/products/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
      }
    ),

  deleteProduct: (id: string, permanent: boolean = true) =>
    request<{ success: boolean; message: string }>(
      `/api/admin/products/${encodeURIComponent(id)}${permanent ? '?permanent=true' : ''}`,
      {
        method: 'DELETE',
      }
    ),

  getUsers: (params?: { search?: string; page?: number }) => {
    const sp = new URLSearchParams();
    if (params?.search) sp.set('search', params.search);
    if (params?.page) sp.set('page', String(params.page));
    return request<{ success: boolean; users: UserItem[]; pagination: any }>(
      `/api/admin/users?${sp.toString()}`
    );
  },

  getUserDetail: (id: string) =>
    request<{ success: boolean; user: any; orders: any[] }>(
      `/api/admin/users/${encodeURIComponent(id)}`
    ),

  getShopeePayLedger: (limit = 50) =>
    request<ShopeePayLedgerData>(`/api/admin/shopeepay?limit=${limit}`),

  checkNotifications: (since?: string) => {
    const qs = since ? `?since=${encodeURIComponent(since)}` : '';
    return request<NotificationCheckData>(`/api/admin/notifications${qs}`);
  },

  sendBroadcast: (
    text: string,
    media?: { name: string; content: string; isPhoto?: boolean }
  ) =>
    request<{ success: boolean; message: string; channel: string }>(
      '/api/admin/broadcast',
      {
        method: 'POST',
        body: JSON.stringify({ text, media }),
      }
    ),

  getSettings: () =>
    request<{ success: boolean; settings: { broadcastChannel: string; isMaintenance: boolean } }>(
      '/api/admin/settings'
    ),

  updateSettings: (data: { isMaintenance?: boolean; broadcastChannel?: string }) =>
    request<{ success: boolean; message: string }>('/api/admin/settings', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
