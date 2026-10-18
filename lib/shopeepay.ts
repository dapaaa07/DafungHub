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
 * Parse an EMVCo / ASPI QRIS string into an array of TLV (Tag-Length-Value) tokens
 */
export function parseEmvco(qris: string): Array<{ tag: string; value: string }> {
  const items: Array<{ tag: string; value: string }> = [];
  let i = 0;
  while (i < qris.length) {
    if (i + 4 > qris.length) break;
    const tag = qris.slice(i, i + 2);
    const len = parseInt(qris.slice(i + 2, i + 4), 10);
    if (isNaN(len) || i + 4 + len > qris.length) break;
    const value = qris.slice(i + 4, i + 4 + len);
    items.push({ tag, value });
    i += 4 + len;
  }
  return items;
}

/**
 * Converts a static or semi-dynamic QRIS string into a 100% compliant dynamic QRIS string
 * by enforcing Point of Initiation Method = 12 (Dynamic), setting the exact Tag 54 transaction amount,
 * removing any duplicate amount tags, and recomputing the Tag 63 CRC16-CCITT checksum.
 */
export function generateDynamicQrisFromStatic(
  baseQris: string,
  amount: number
): string {
  const items = parseEmvco(baseQris);
  const roundedAmount = Math.round(amount);
  const amtStr = String(roundedAmount);

  let has01 = false;
  let has54 = false;

  for (const item of items) {
    if (item.tag === '01') {
      item.value = '12'; // 12 = Dynamic initiation method
      has01 = true;
    } else if (item.tag === '54') {
      item.value = amtStr;
      has54 = true;
    }
  }

  if (!has01) {
    items.splice(1, 0, { tag: '01', value: '12' });
  }

  if (!has54) {
    // Insert Tag 54 right after Tag 53 (Currency Code IDR: 360)
    const idx53 = items.findIndex((it) => it.tag === '53');
    if (idx53 !== -1) {
      items.splice(idx53 + 1, 0, { tag: '54', value: amtStr });
    } else {
      items.push({ tag: '54', value: amtStr });
    }
  }

  // Remove Tag 63 (checksum) so we can recalculate it fresh
  const filtered = items.filter((it) => it.tag !== '63');

  let payload = '';
  for (const it of filtered) {
    const lenStr = String(it.value.length).padStart(2, '0');
    payload += it.tag + lenStr + it.value;
  }

  payload += '6304';
  const crc = crc16Ccitt(payload);
  return payload + crc;
}

/**
 * Generate a local high-resolution PNG Buffer for a QRIS string
 * completely in-memory without any external network dependency.
 */
export async function generateQrPngBuffer(qrString: string): Promise<Buffer> {
  const QRCode = (await import('qrcode')).default;
  return QRCode.toBuffer(qrString, {
    width: 450,
    margin: 2,
    errorCorrectionLevel: 'M',
  });
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
      const baseRaw =
        data.qris_string ||
        data.qris ||
        data.qr_string ||
        data.qr ||
        SHOPEEPAY_STATIC_QRIS;

      // Always enforce true dynamic QRIS (010212) with Tag 54 exact amount
      const dynamicQris = generateDynamicQrisFromStatic(baseRaw, roundedAmount);
      const token = data.token || data.qris_token || `shopee_${orderCode}`;

      // Always use reliable https QR image generator, never dead 404 links
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=450x450&data=${encodeURIComponent(dynamicQris)}`;

      return {
        qrCodeUrl,
        qrUrl: qrCodeUrl,
        qrString: dynamicQris,
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
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=450x450&data=${encodeURIComponent(dynamicQris)}`;

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
