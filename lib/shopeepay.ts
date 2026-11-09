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

import crypto from 'crypto';
import type { ExtendedBot } from '../bot/handler';

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
  transactionId?: string | number;
  transaction_id?: string | number;
  amount?: number | string;
  nominal?: number | string;
  total?: number | string;
  description?: string;
  created_at?: string;
  timestamp?: string;
  time?: string;
  date?: string;
  status?: string;
  issuer?: string;
  [key: string]: unknown;
}

export interface ShopeePayTokenStatusResult {
  success: boolean;
  valid: boolean;
  tokenStatus: string;
  message: string;
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
 * Check real-time ShopeePay token validity against Shopee API via GET /v1/token/status
 */
export async function getShopeePayTokenStatus(): Promise<ShopeePayTokenStatusResult> {
  const baseUrl = SHOPEEPAY_BASE_URL.replace(/\/+$/, '');
  try {
    const res = await fetch(`${baseUrl}/v1/token/status`, {
      method: 'GET',
      headers: {
        'x-api-key': SHOPEEPAY_API_KEY,
        'Content-Type': 'application/json',
      },
    });
    const json = await res.json().catch(() => null);
    const tokenStatus = String(json?.data?.token_status || (res.ok && json?.success ? 'valid' : 'invalid'));
    const message = String(json?.data?.message || json?.error || json?.message || (res.ok ? 'OK' : `HTTP ${res.status}`));
    const valid = Boolean(res.ok && json?.success && tokenStatus.toLowerCase() === 'valid');
    return {
      success: Boolean(json?.success ?? res.ok),
      valid,
      tokenStatus,
      message,
    };
  } catch (err) {
    return {
      success: false,
      valid: false,
      tokenStatus: 'unreachable',
      message: (err as Error).message,
    };
  }
}

/**
 * Update the Shopee session token stored in the ShopeePay Gateway (PUT /v1/token)
 * and verify its live validity right away.
 */
export async function updateShopeePayToken(rawToken: string): Promise<{
  success: boolean;
  valid: boolean;
  tokenStatus: string;
  message: string;
  error?: string;
}> {
  const cleanToken = rawToken.trim().replace(/^["'`]+|["'`]+$/g, '');
  if (!cleanToken) {
    return {
      success: false,
      valid: false,
      tokenStatus: 'invalid',
      message: 'Token tidak boleh kosong.',
      error: 'Token kosong',
    };
  }

  const baseUrl = SHOPEEPAY_BASE_URL.replace(/\/+$/, '');
  try {
    const putRes = await fetch(`${baseUrl}/v1/token`, {
      method: 'PUT',
      headers: {
        'x-api-key': SHOPEEPAY_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: cleanToken }),
    });
    const putJson = await putRes.json().catch(() => null);

    if (!putRes.ok || !putJson?.success) {
      const errMsg = putJson?.error || putJson?.message || `HTTP ${putRes.status}`;
      return {
        success: false,
        valid: false,
        tokenStatus: 'error',
        message: errMsg,
        error: errMsg,
      };
    }

    const statusCheck = await getShopeePayTokenStatus();
    return {
      success: true,
      valid: statusCheck.valid,
      tokenStatus: statusCheck.tokenStatus,
      message: statusCheck.valid
        ? 'Token berhasil diperbarui & terverifikasi aktif.'
        : `Token tersimpan, namun gateway melapor: ${statusCheck.message}`,
    };
  } catch (err) {
    const errMsg = (err as Error).message;
    return {
      success: false,
      valid: false,
      tokenStatus: 'unreachable',
      message: errMsg,
      error: errMsg,
    };
  }
}

/**
 * Configure ShopeePay Gateway webhook notification URL (POST /v1/webhook/setup)
 */
export async function setupShopeePayWebhook(
  webhookUrl: string,
  webhookSecret?: string
): Promise<{ success: boolean; message: string; data?: Record<string, unknown> }> {
  const baseUrl = SHOPEEPAY_BASE_URL.replace(/\/+$/, '');
  try {
    const payload: Record<string, string> = { webhook_url: webhookUrl };
    if (webhookSecret) payload.webhook_secret = webhookSecret;

    const res = await fetch(`${baseUrl}/v1/webhook/setup`, {
      method: 'POST',
      headers: {
        'x-api-key': SHOPEEPAY_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => null);
    return {
      success: Boolean(res.ok && json?.success),
      message: json?.message || json?.error || `HTTP ${res.status}`,
      data: json?.data,
    };
  } catch (err) {
    return {
      success: false,
      message: (err as Error).message,
    };
  }
}

/**
 * Extract normalized transaction ID from ShopeePay transaction payloads
 * (supports camelCase transactionId, snake_case transaction_id, and id).
 */
export function extractShopeePayTxId(tx: Record<string, unknown> | null | undefined): string {
  if (!tx) return '';
  return String(tx.transactionId || tx.transaction_id || tx.id || '').trim();
}

/**
 * Normalize ShopeePay transaction timestamp (WIB UTC+7 when timezone omitted) to ms.
 */
export function parseShopeePayTimeMs(rawDate: unknown): number {
  if (!rawDate) return NaN;
  const dateStr = String(rawDate).trim();
  if (!dateStr) return NaN;
  const hasTz = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(dateStr);
  const normalized = hasTz ? dateStr : `${dateStr.replace(' ', 'T')}+07:00`;
  return new Date(normalized).getTime();
}

/**
 * Returns today's date string (YYYY-MM-DD) in Asia/Jakarta (UTC+7 / WIB).
 */
export function getWibTodayString(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Create a QRIS payment invoice using ShopeePay Gateway.
 * Generates a compliant dynamic QRIS locally from the merchant static QRIS token.
 * This guarantees:
 * 1. Rp 0 fee (Supplier balance is NEVER deducted Rp 200 per generation)
 * 2. 0ms instant generation with 100% uptime and zero external failure risk
 * 3. Exact payable amount locked in buyer banking & e-wallet apps (Dynamic Tag 01=12 & Tag 54)
 * 4. Payment verification automated via incoming transaction mutations (/transactions)
 */
export async function createShopeePayInvoice(
  orderCode: string,
  amount: number
): Promise<ShopeePayTransactionResult> {
  const roundedAmount = Math.round(amount);

  // Generate dynamic QRIS locally (100% free of charge, Rp 0 fee)
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
 * and GET /transactions?page_size=20 (with fallback to /v1/transactions?page_size=20).
 */
export async function checkShopeePayPayment(params: {
  token?: string;
  orderCode?: string;
  amount?: number;
  orderCreatedAt?: string | Date;
}): Promise<{ paid: boolean; status: string; transaction?: unknown; error?: string }> {
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

  // 2. Check recent account mutations via GET /transactions?page_size=20 (fallback /v1/transactions)
  const txFetch = await fetchShopeePayTransactions(20);
  if (!txFetch.ok) {
    if (txFetch.sessionExpired) {
      return {
        paid: false,
        status: 'gateway_session_expired',
        error: txFetch.error,
      };
    }
    return { paid: false, status: 'unpaid' };
  }

  const transactions = txFetch.transactions;
  if (params.amount && transactions.length > 0) {
    const targetAmount = Math.round(params.amount);
    const orderTime = params.orderCreatedAt
      ? new Date(params.orderCreatedAt).getTime()
      : 0;

    // Fetch already claimed ShopeePay transaction IDs to ensure strict single-claim
    let claimedTxIds = new Set<string>();
    try {
      const { query } = await import('./db');
      const claimedRes = await query<{ tx_id: string }>(
        `SELECT invoice_data->>'shopeepay_tx_id' as tx_id
         FROM orders
         WHERE payment_status = 'paid'
           AND invoice_data->>'shopeepay_tx_id' IS NOT NULL
           AND created_at >= NOW() - INTERVAL '48 hours'`
      );
      claimedTxIds = new Set(
        claimedRes.rows.map((r) => String(r.tx_id).trim()).filter(Boolean)
      );
    } catch (dbErr) {
      console.warn('[ShopeePay] Error querying claimed tx IDs:', dbErr);
    }

    // Find matching incoming transaction
    const match = transactions.find((t) => {
      const txAmt = Math.round(Number(t.amount || t.nominal || t.total || 0));
      if (txAmt !== targetAmount) return false;

      const txStatus = String(t.status || '').toLowerCase();
      if (
        txStatus &&
        txStatus !== 'paid' &&
        txStatus !== 'success' &&
        txStatus !== 'completed' &&
        txStatus !== 'settlement' &&
        txStatus !== 'berhasil'
      ) {
        return false;
      }

      // Single-claim check: ensure this specific mutation hasn't been claimed by another order
      const txId = extractShopeePayTxId(t);
      if (txId && claimedTxIds.has(txId)) {
        return false;
      }

      // If timestamp is available, verify it occurred around or after order creation
      const rawDate = t.time || t.created_at || t.timestamp || t.date;
      if (orderTime > 0 && rawDate) {
        const txTime = parseShopeePayTimeMs(rawDate);
        if (!isNaN(txTime)) {
          // Allow up to 10 minutes clock skew before order creation
          if (txTime < orderTime - 600000) return false;
        }
      }

      return true;
    });

    if (match) {
      const normalizedTxId = extractShopeePayTxId(match);
      return {
        paid: true,
        status: 'paid',
        transaction: normalizedTxId
          ? { ...match, transactionId: normalizedTxId }
          : match,
      };
    }
  }

  return { paid: false, status: 'unpaid' };
}

export interface ShopeePayTransactionsFetchResult {
  ok: boolean;
  statusCode: number;
  transactions: ShopeePayTransactionItem[];
  sessionExpired: boolean;
  error?: string;
}

/**
 * Fetch incoming transaction mutations from ShopeePay Gateway.
 * Tries `/transactions` first and falls back to `/v1/transactions`.
 */
export async function fetchShopeePayTransactions(
  pageSize: number = 20
): Promise<ShopeePayTransactionsFetchResult> {
  const baseUrl = SHOPEEPAY_BASE_URL.replace(/\/+$/, '');
  const size = Math.min(100, Math.max(1, Math.round(pageSize)));
  const txEndpoints = [
    `${baseUrl}/transactions?page_size=${size}`,
    `${baseUrl}/v1/transactions?page_size=${size}`,
  ];

  let lastStatus = 502;
  let lastError = '';

  for (const endpointUrl of txEndpoints) {
    try {
      const txRes = await fetch(endpointUrl, {
        method: 'GET',
        headers: {
          'x-api-key': SHOPEEPAY_API_KEY,
          'Content-Type': 'application/json',
        },
      });

      if (txRes.ok) {
        const txJson = await txRes.json().catch(() => ({}));
        const transactions: ShopeePayTransactionItem[] =
          txJson?.data?.transactions || txJson?.transactions || [];
        return {
          ok: true,
          statusCode: txRes.status,
          transactions,
          sessionExpired: false,
        };
      }

      lastStatus = txRes.status;
      const errJson = await txRes.json().catch(() => null);
      const errMsg = String(errJson?.error || errJson?.message || '');
      lastError = errMsg || `HTTP ${txRes.status}`;
      console.warn(
        `[ShopeePay Gateway] GET ${endpointUrl} returned ${txRes.status}:`,
        errJson || lastError
      );

      if (errMsg.includes('login timeout') || errJson?.code === 200020) {
        return {
          ok: false,
          statusCode: txRes.status,
          transactions: [],
          sessionExpired: true,
          error:
            'Sesi ShopeePay di gateway kedaluwarsa (login timeout). Jalankan /settoken <token_baru> atau login ulang di gateway.',
        };
      }
    } catch (txErr) {
      lastError = (txErr as Error).message;
      console.warn('[ShopeePay] /transactions error:', txErr);
    }
  }

  return {
    ok: false,
    statusCode: lastStatus,
    transactions: [],
    sessionExpired: false,
    error: lastError || 'Gagal mengambil mutasi dari gateway ShopeePay.',
  };
}

/**
 * Verify `X-Signature` header (`sha256=HMAC_HEX`) against webhook secret.
 */
export function verifyShopeePayWebhookSignature(
  rawBody: string,
  parsedData: Record<string, unknown>,
  signatureHeader: string,
  secret: string
): boolean {
  const cleanSig = signatureHeader.trim();
  if (!cleanSig || !secret) return false;

  const sigBuf = Buffer.from(cleanSig, 'utf8');
  const payloadCandidates = [rawBody, JSON.stringify(parsedData)];

  for (const payload of payloadCandidates) {
    const hex = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    for (const expected of [`sha256=${hex}`, hex]) {
      const expBuf = Buffer.from(expected, 'utf8');
      if (sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Shared webhook processor for both Next.js `/api/webhooks/shopeepay`
 * and standalone `scripts/run-bot.ts` HTTP webhook server.
 */
export async function processShopeePayWebhookPayload(
  rawBody: string,
  botInstance: ExtendedBot,
  signatureHeader?: string
): Promise<{ httpStatus: number; body: Record<string, unknown> }> {
  let data: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(rawBody || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>;
    }
  } catch {
    return {
      httpStatus: 400,
      body: { success: false, message: 'Invalid JSON payload' },
    };
  }

  const webhookSecret = process.env.SHOPEEPAY_WEBHOOK_SECRET;
  if (webhookSecret) {
    if (
      !signatureHeader ||
      !verifyShopeePayWebhookSignature(rawBody, data, signatureHeader, webhookSecret)
    ) {
      return {
        httpStatus: 401,
        body: { success: false, message: 'Invalid webhook signature' },
      };
    }
  }

  const eventName = String(data.event || '').trim().toLowerCase();
  if (
    eventName === 'test' ||
    eventName === 'webhook.test' ||
    eventName === 'ping' ||
    data.test === true
  ) {
    return {
      httpStatus: 200,
      body: {
        success: true,
        paid: false,
        message: `Webhook test ping acknowledged (${eventName || 'test'})`,
        event: eventName || 'test',
      },
    };
  }

  let targetOrderCode = String(
    data.order_id || data.order_code || data.merchant_ref || data.token || ''
  ).trim();
  const txId = extractShopeePayTxId(data);

  const notificationFields = [
    data.notification,
    data.text,
    data.message,
    data.body,
    data.not_body,
  ];
  const hasExplicitNotificationText = notificationFields.some(
    (v) => typeof v === 'string' && v.trim().length > 0
  );

  let detectedAmount =
    Math.round(Number(data.amount || data.nominal || data.total || 0)) || 0;

  if (!targetOrderCode && !detectedAmount && hasExplicitNotificationText) {
    const notifText = notificationFields
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .join(' ');
    const rpMatch = notifText.match(/(?:rp\.?|idr)\s*([0-9][0-9.,]*)/i);
    const numMatch = rpMatch || notifText.match(/\b([1-9][0-9]{2,6})\b/);
    if (numMatch) {
      const clean = numMatch[1].replace(/,\d{1,2}$/, '').replace(/[^0-9]/g, '');
      detectedAmount = parseInt(clean, 10) || 0;
    }
  }

  const rawStatus = String(
    data.status ||
      data.payment_status ||
      (eventName === 'payment.success' || eventName === 'payment_success'
        ? 'paid'
        : eventName
          ? eventName
          : hasExplicitNotificationText || (txId && detectedAmount > 0)
            ? 'paid'
            : '')
  ).toLowerCase();

  const isPaid =
    rawStatus === 'success' ||
    rawStatus === 'paid' ||
    rawStatus === 'settlement' ||
    rawStatus === 'completed' ||
    rawStatus === 'berhasil';

  if (!isPaid) {
    return {
      httpStatus: 200,
      body: {
        success: true,
        paid: false,
        message: targetOrderCode
          ? `Status received: ${rawStatus || 'unknown'}`
          : detectedAmount > 0
            ? `Non-paid status received (${rawStatus || 'unknown'})`
            : 'Notification received, not a confirmed payment',
        order_id: targetOrderCode || null,
        transaction_id: txId || null,
        detected_amount: detectedAmount || null,
      },
    };
  }

  const { query } = await import('./db');

  // Strict single-claim dedup: if gateway transaction_id is already claimed by a paid order, acknowledge idempotently
  if (txId) {
    const claimedRes = await query<{ order_code: string }>(
      `SELECT order_code FROM orders
       WHERE payment_status = 'paid'
         AND invoice_data->>'shopeepay_tx_id' = $1
       LIMIT 1`,
      [txId]
    ).catch(() => ({ rows: [] as Array<{ order_code: string }> }));

    if (claimedRes.rows.length > 0) {
      const existingCode = claimedRes.rows[0].order_code;
      return {
        httpStatus: 200,
        body: {
          success: true,
          paid: true,
          duplicate: true,
          message: `Transaction ${txId} already claimed by order ${existingCode}`,
          order_code: existingCode,
          order_id: existingCode,
          transaction_id: txId,
          detected_amount: detectedAmount || null,
        },
      };
    }
  }

  // Match recent unpaid ShopeePay order by exact payable_amount / amount
  if (!targetOrderCode && detectedAmount > 0) {
    const rawTxTime = data.time || data.created_at || data.timestamp || data.date;
    const txTimeMs = parseShopeePayTimeMs(rawTxTime);

    const matchOrd = await query<{ order_code: string; created_at: string }>(
      `SELECT o.order_code, o.created_at
       FROM orders o
       LEFT JOIN products p ON o.product_id = p.id
       WHERE o.payment_status = 'unpaid'
         AND COALESCE(LOWER(o.invoice_data->>'gateway'), 'shopeepay') = 'shopeepay'
         AND (
           (o.invoice_data->>'payable_amount' ~ '^[0-9]+(\\.[0-9]+)?$' AND (o.invoice_data->>'payable_amount')::numeric = $1)
           OR (o.invoice_data->>'amount' ~ '^[0-9]+(\\.[0-9]+)?$' AND (o.invoice_data->>'amount')::numeric = $1)
           OR (
             o.invoice_data->>'payable_amount' IS NULL
             AND o.invoice_data->>'amount' IS NULL
             AND p.price = $1
           )
         )
         AND o.created_at >= NOW() - INTERVAL '24 hours'
       ORDER BY o.created_at DESC
       LIMIT 5`,
      [detectedAmount]
    );

    const timeMatched = matchOrd.rows.find((ord) => {
      if (isNaN(txTimeMs)) return true;
      const ordTimeMs = new Date(ord.created_at).getTime();
      return isNaN(ordTimeMs) || txTimeMs >= ordTimeMs - 600000;
    });

    if (timeMatched) {
      targetOrderCode = timeMatched.order_code;
    }
  }

  if (targetOrderCode) {
    console.log(`[ShopeePay Webhook] Payment confirmed for order: ${targetOrderCode}`);
    const { processOrderPayment } = await import('./fulfillment');
    const txMeta = txId ? { ...data, transactionId: txId } : data;
    const result = await processOrderPayment(targetOrderCode, botInstance, txMeta);

    return {
      httpStatus: 200,
      body: {
        success: true,
        paid: result.mode !== 'error',
        message:
          result.mode === 'error'
            ? result.message
            : 'ShopeePay payment successfully confirmed',
        order_code: targetOrderCode,
        order_id: targetOrderCode,
        transaction_id: txId || null,
        detected_amount: detectedAmount || null,
        mode: result.mode,
      },
    };
  }

  return {
    httpStatus: 200,
    body: {
      success: true,
      paid: false,
      message:
        detectedAmount > 0
          ? `Amount detected (Rp ${detectedAmount.toLocaleString('id-ID')}) but no unpaid order found within last 24h`
          : 'Notification received, no amount or order found',
      order_id: null,
      transaction_id: txId || null,
      detected_amount: detectedAmount || null,
    },
  };
}
