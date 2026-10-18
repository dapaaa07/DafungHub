/**
 * ShopeePay API Gateway Client (v3.2)
 *
 * Implements integration with ShopeePay Multi-Tenant API Gateway (https://shopee.prastyaaneki.biz.id).
 * Supports:
 * 1. Automatic QRIS creation via POST /v1/qris/create
 * 2. Intelligent zero-downtime fallback to dynamic QRIS generated from static QRIS token
 * 3. Payment verification via POST /v1/payment/check and GET /transactions
 * 4. Account balance & readiness inspection
 */

if (!process.env.SHOPEEPAY_API_KEY) {
  try {
    process.loadEnvFile?.();
  } catch {
    // Ignore error if .env does not exist
  }
}

export const SHOPEEPAY_BASE_URL =
  process.env.SHOPEEPAY_API_URL || 'https://shopee.prastyaaneki.biz.id';
export const SHOPEEPAY_API_KEY = process.env.SHOPEEPAY_API_KEY || '';
export const SHOPEEPAY_STATIC_QRIS =
  process.env.SHOPEEPAY_STATIC_QRIS ||
  '00020101021126610016ID.CO.SHOPEE.WWW01189360091800239501700208239501700303UMI51440014ID.CO.QRIS.WWW0215ID10266191349880303UMI5204481453033605802ID5910Dafung Hub6008KARAWANG61054137362070703A016304BBC9';

export interface ShopeePayAccountData {
  user_id: string;
  username: string;
  first_name: string;
  api_key: string;
  has_shopee_token: boolean;
  has_qris_static: boolean;
  token_valid: boolean;
  is_active: boolean;
  balance: number;
  qris_creation_fee: number;
}

export interface ShopeePayTransactionResult {
  qrCodeUrl: string;
  qrUrl: string;
  qrString: string;
  checkoutUrl?: string;
  token: string;
  orderCode: string;
  grossAmount: number;
  gateway: 'shopeepay';
  method: 'api_qris' | 'static_conversion';
  raw: Record<string, unknown>;
}

export interface ShopeePayTransactionItem {
  id?: string | number;
  amount?: number | string;
  nominal?: number | string;
  total?: number | string;
  description?: string;
  created_at?: string;
  timestamp?: string;
  date?: string;
  status?: string;
  [key: string]: unknown;
}

/**
 * Calculate CRC16-CCITT for standard EMVCo / ASPI QRIS strings
 * Polynomial: 0x1021, Initial value: 0xFFFF
 */
export function crc16Ccitt(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Converts a static QRIS string (Point of Initiation = 11)
 * into a dynamic QRIS string with the exact transaction amount (Tag 54)
 * and recalculates the Tag 63 CRC16-CCITT checksum.
 */
export function generateDynamicQrisFromStatic(
  staticQris: string,
  amount: number
): string {
  // 1. Convert Point of Initiation Method: 11 (Static) -> 12 (Dynamic)
  let qris = staticQris.replace('010211', '010212');

  // 2. Strip existing CRC Tag 63 if present
  const crcIndex = qris.lastIndexOf('6304');
  if (crcIndex !== -1) {
    qris = qris.slice(0, crcIndex);
  }

  // 3. Format Tag 54 (Transaction Amount)
  const roundedAmount = Math.round(amount);
  const amtStr = String(roundedAmount);
  const tag54 = '54' + String(amtStr.length).padStart(2, '0') + amtStr;

  // Insert Tag 54 right after Tag 53 (Currency Code IDR: 5303360)
  const idx53 = qris.indexOf('5303360');
  if (idx53 !== -1) {
    const after53 = idx53 + '5303360'.length;
    qris = qris.slice(0, after53) + tag54 + qris.slice(after53);
  } else {
    qris += tag54;
  }

  // 4. Append Tag 63 header and recompute CRC16
  qris += '6304';
  const crc = crc16Ccitt(qris);
  return qris + crc;
}

/**
 * Fetch ShopeePay Gateway account status and balance
 */
export async function getShopeePayAccount(): Promise<{
  success: boolean;
  data?: ShopeePayAccountData;
  error?: string;
}> {
  const baseUrl = SHOPEEPAY_BASE_URL.replace(/\/+$/, '');
  try {
    const res = await fetch(`${baseUrl}/v1/account`, {
      method: 'GET',
      headers: {
        'x-api-key': SHOPEEPAY_API_KEY,
        'Content-Type': 'application/json',
      },
    });

    const data = await res.json();
    return data;
  } catch (err) {
    return {
      success: false,
      error: (err as Error).message,
    };
  }
}

/**
 * Create a QRIS payment invoice using ShopeePay Gateway.
 * Tries the gateway's POST /v1/qris/create first.
 * If the gateway is unavailable or balance is insufficient, gracefully falls back
 * to generating a valid dynamic QRIS locally using the static QRIS token.
 */
export async function createShopeePayInvoice(
  orderCode: string,
  amount: number
): Promise<ShopeePayTransactionResult> {
  const roundedAmount = Math.round(amount);
  const baseUrl = SHOPEEPAY_BASE_URL.replace(/\/+$/, '');

  // 1. Attempt to call POST /v1/qris/create on ShopeePay API Gateway
  try {
    const response = await fetch(`${baseUrl}/v1/qris/create`, {
      method: 'POST',
      headers: {
        'x-api-key': SHOPEEPAY_API_KEY,
        'Content-Type': 'application/json',
        'Idempotency-Key': orderCode,
      },
      body: JSON.stringify({ amount: roundedAmount }),
    });

    const resJson = await response.json();
    if (response.ok && resJson.success && resJson.data) {
      const data = resJson.data;
      const qrString =
        data.qris_string ||
        data.qris ||
        data.qr_string ||
        data.qr ||
        generateDynamicQrisFromStatic(SHOPEEPAY_STATIC_QRIS, roundedAmount);
      const token = data.token || data.qris_token || `shopee_${orderCode}`;
      const qrCodeUrl =
        data.qris_url ||
        data.qr_image ||
        data.qr_code_url ||
        data.qr_url ||
        `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qrString)}`;

      return {
        qrCodeUrl,
        qrUrl: qrCodeUrl,
        qrString,
        checkoutUrl: data.checkout_url,
        token,
        orderCode,
        grossAmount: roundedAmount,
        gateway: 'shopeepay',
        method: 'api_qris',
        raw: resJson,
      };
    } else {
      console.warn(
        `[ShopeePay API] /v1/qris/create returned non-success (${resJson.code || response.status}): ${resJson.error || 'Unknown error'}. Falling back to dynamic static QRIS generation.`
      );
    }
  } catch (apiErr) {
    console.warn(
      '[ShopeePay API] Failed to reach /v1/qris/create, falling back to dynamic static QRIS generation:',
      apiErr
    );
  }

  // 2. Zero-downtime fallback: Generate dynamic QRIS from static token
  const dynamicQris = generateDynamicQrisFromStatic(SHOPEEPAY_STATIC_QRIS, roundedAmount);
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(dynamicQris)}`;

  return {
    qrCodeUrl,
    qrUrl: qrCodeUrl,
    qrString: dynamicQris,
    token: `shopee_${orderCode}`,
    orderCode,
    grossAmount: roundedAmount,
    gateway: 'shopeepay',
    method: 'static_conversion',
    raw: {
      success: true,
      mode: 'static_conversion',
      orderCode,
      amount: roundedAmount,
    },
  };
}

/**
 * Check payment status for a ShopeePay order.
 * Checks both POST /v1/payment/check (if gateway token exists)
 * and GET /transactions?page_size=20 (incoming mutations).
 */
export async function checkShopeePayPayment(params: {
  token?: string;
  orderCode?: string;
  amount?: number;
  orderCreatedAt?: string | Date;
}): Promise<{ paid: boolean; status: string; transaction?: unknown }> {
  const baseUrl = SHOPEEPAY_BASE_URL.replace(/\/+$/, '');

  // 1. If a valid gateway token exists (not our internal `shopee_` fallback), query POST /v1/payment/check
  if (params.token && !params.token.startsWith('shopee_')) {
    try {
      const checkRes = await fetch(`${baseUrl}/v1/payment/check`, {
        method: 'POST',
        headers: {
          'x-api-key': SHOPEEPAY_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: params.token,
          wait: false,
        }),
      });

      if (checkRes.ok) {
        const checkJson = await checkRes.json();
        if (checkJson.success && checkJson.data) {
          const status = String(
            checkJson.data.status || checkJson.data.payment_status || ''
          ).toLowerCase();
          if (
            status === 'success' ||
            status === 'paid' ||
            status === 'settlement' ||
            status === 'completed'
          ) {
            return {
              paid: true,
              status: 'paid',
              transaction: checkJson.data,
            };
          }
        }
      }
    } catch (checkErr) {
      console.warn('[ShopeePay] /v1/payment/check error:', checkErr);
    }
  }

  // 2. Check recent account mutations via GET /transactions?page_size=20
  try {
    const txRes = await fetch(`${baseUrl}/transactions?page_size=20`, {
      method: 'GET',
      headers: {
        'x-api-key': SHOPEEPAY_API_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (txRes.ok) {
      const txJson = await txRes.json();
      const transactions: ShopeePayTransactionItem[] =
        txJson?.data?.transactions || [];

      if (params.amount && transactions.length > 0) {
        const targetAmount = Math.round(params.amount);
        const orderTime = params.orderCreatedAt
          ? new Date(params.orderCreatedAt).getTime()
          : 0;

        // Find matching incoming transaction
        const match = transactions.find((t) => {
          const txAmt = Math.round(Number(t.amount || t.nominal || t.total || 0));
          if (txAmt !== targetAmount) return false;

          // If timestamp is available, verify it occurred around or after order creation
          const rawDate = t.created_at || t.timestamp || t.date;
          if (orderTime > 0 && rawDate) {
            const txTime = new Date(rawDate).getTime();
            // Allow 5 minutes clock skew before order creation
            if (txTime < orderTime - 300000) return false;
          }

          return true;
        });

        if (match) {
          return {
            paid: true,
            status: 'paid',
            transaction: match,
          };
        }
      }
    }
  } catch (txErr) {
    console.warn('[ShopeePay] /transactions error:', txErr);
  }

  return { paid: false, status: 'unpaid' };
}
