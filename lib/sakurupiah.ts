import crypto from 'crypto';

// Auto-load .env for standalone scripts / bot runners outside Next.js runtime
if (!process.env.SAKURUPIAH_API_KEY && !process.env.SAKURUPIAH_API_ID) {
  try {
    process.loadEnvFile?.();
  } catch {
    // Ignore error if .env does not exist
  }
}

export const SAKURUPIAH_API_ID = process.env.SAKURUPIAH_API_ID || 'SANBOX-31838670';
export const SAKURUPIAH_API_KEY = process.env.SAKURUPIAH_API_KEY || 'SANBOX-u3N76fgWjJnhehCQ5q0IQoF8VDEv6nWJ';

/**
 * Determine base URL:
 * If API_ID starts with 'SANBOX' or SAKURUPIAH_MODE is 'sandbox', use sandbox URL.
 * Otherwise, use production URL.
 */
export function getSakurupiahBaseUrl(): string {
  if (process.env.SAKURUPIAH_API_URL) {
    return process.env.SAKURUPIAH_API_URL.replace(/\/+$/, '');
  }
  const isSandbox =
    SAKURUPIAH_API_ID.startsWith('SANBOX') ||
    process.env.SAKURUPIAH_MODE === 'sandbox';

  return isSandbox
    ? 'https://sakurupiah.id/api-sanbox'
    : 'https://sakurupiah.id/api';
}

export interface SakurupiahInvoiceData {
  via: string;
  payment_kode: string;
  trx_id: string;
  merchant_ref: string;
  nama: string;
  email: string;
  phone: string;
  total: number;
  merchant_fee: string;
  fee: number;
  amount_merchant: number;
  date: string;
  time: string;
  expired: string;
  payment_status: string;
  qr: string;
  payment_no?: number | string;
  checkout_url?: string;
}

export interface SakurupiahCreateResponse {
  status: string;
  message: string;
  data?: SakurupiahInvoiceData[];
  produk?: Array<{
    nama_produk: string;
    qty: number;
    harga: number;
    size?: string;
    note?: string;
  }>;
}

export interface SakurupiahTransactionResult {
  qrCodeUrl: string;
  qrUrl: string;
  qrString: string;
  checkoutUrl?: string;
  orderId: string;
  grossAmount: number;
  transactionId?: string;
  raw: Record<string, unknown>;
}

/**
 * Generate HMAC-SHA256 signature for Sakurupiah create invoice request:
 * hash_hmac('sha256', api_id + method + merchant_ref + amount, apikey)
 */
export function generateSakurupiahSignature(
  apiId: string,
  method: string,
  merchantRef: string,
  amount: number | string,
  apiKey: string
): string {
  const payload = `${apiId}${method}${merchantRef}${amount}`;
  return crypto.createHmac('sha256', apiKey).update(payload).digest('hex');
}

/**
 * Verify incoming webhook signature:
 * hash_hmac('sha256', rawJsonBody, apiKey) === X-Callback-Signature
 */
export function verifySakurupiahCallbackSignature(
  rawJsonBody: string,
  incomingSignature: string,
  apiKey: string = SAKURUPIAH_API_KEY
): boolean {
  if (!incomingSignature || !rawJsonBody) return false;
  try {
    const computed = crypto.createHmac('sha256', apiKey).update(rawJsonBody).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(incomingSignature));
  } catch {
    return false;
  }
}

/**
 * Select the optimal QRIS channel with the lowest processing cost:
 *
 * Inversion point:
 * - QRIS (Standard): 0.007 * T + 350
 * - QRIS2: 0.009 * T
 *
 * Mathematical Threshold:
 * 0.009 * T = 0.007 * T + 350 => 0.002 * T = 350 => T = Rp 175.000
 *
 * For T <= Rp 175.000 => QRIS2 is cheaper.
 * For T > Rp 175.000  => QRIS (Standard) is cheaper.
 */
export function selectOptimalQrisChannel(
  estimatedInvoice: number,
  availableChannels: string[] = ['QRIS', 'QRIS2']
): string {
  if (estimatedInvoice <= 0) return 'QRIS';

  const costMap: Record<string, number> = {};

  for (const channel of availableChannels) {
    if (channel === 'QRIS2') {
      costMap[channel] = estimatedInvoice * 0.009;
    } else if (channel === 'QRISC') {
      costMap[channel] = (estimatedInvoice * 0.007) + 100;
    } else if (channel === 'QRIS') {
      costMap[channel] = (estimatedInvoice * 0.007) + 350;
    } else if (channel === 'QRISMU') {
      costMap[channel] = (estimatedInvoice * 0.008) + 250;
    }
  }

  const entries = Object.entries(costMap);
  if (entries.length === 0) return 'QRIS';

  entries.sort((a, b) => a[1] - b[1]);
  return entries[0][0];
}

/**
 * Create a dynamic QRIS transaction via Sakurupiah API
 */
export async function createSakurupiahInvoice(
  orderId: string,
  grossAmount: number,
  productName: string = 'Akun Digital',
  customerName?: string,
  customerEmail: string = 'buyer@dafung-hub.com',
  customerPhone: string = '081234567890',
  method: string = 'AUTO'
): Promise<SakurupiahTransactionResult> {
  if (!orderId) {
    throw new Error('orderId is required to create a Sakurupiah transaction');
  }

  if (grossAmount <= 0) {
    throw new Error('grossAmount must be greater than 0');
  }

  // Resolve method dynamically if AUTO or default QRIS
  const effectiveMethod =
    method === 'AUTO' || method === 'AUTO_QRIS'
      ? selectOptimalQrisChannel(grossAmount)
      : method;

  const baseUrl = getSakurupiahBaseUrl();
  const apiId = SAKURUPIAH_API_ID;
  const apiKey = SAKURUPIAH_API_KEY;
  const roundedAmount = Math.round(grossAmount);
  const amountStr = String(roundedAmount);
  const finalCustomerName = (customerName && customerName.trim().length > 0)
    ? customerName.trim()
    : 'Pelanggan';

  const signature = generateSakurupiahSignature(
    apiId,
    effectiveMethod,
    orderId,
    amountStr,
    apiKey
  );

  const callbackUrl =
    process.env.SAKURUPIAH_CALLBACK_URL ||
    `${process.env.APP_URL || 'https://dafung-hub.vercel.app'}/api/webhooks/sakurupiah`;

  const returnUrl =
    process.env.APP_URL || 'https://dafung-hub.vercel.app';

  const params = new URLSearchParams();
  params.append('api_id', apiId);
  params.append('method', effectiveMethod);
  params.append('name', finalCustomerName);
  params.append('email', customerEmail);
  params.append('phone', customerPhone);
  params.append('amount', amountStr);
  params.append('merchant_fee', '1'); // 1 = Merchant absorbs fee
  params.append('merchant_ref', orderId);
  params.append('expired', '24'); // 24 hours
  params.append('produk[]', productName);
  params.append('qty[]', '1');
  params.append('harga[]', amountStr);
  params.append('callback_url', callbackUrl);
  params.append('return_url', returnUrl);
  params.append('signature', signature);

  const url = `${baseUrl}/create.php`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const responseText = await response.text();
  let json: SakurupiahCreateResponse;
  try {
    json = JSON.parse(responseText) as SakurupiahCreateResponse;
  } catch {
    throw new Error(`Invalid JSON response from Sakurupiah [HTTP ${response.status}]: ${responseText}`);
  }

  if (String(json.status) !== '200' || !json.data || json.data.length === 0) {
    throw new Error(`Sakurupiah API error [status: ${json.status}]: ${json.message || responseText}`);
  }

  const invoice = json.data[0];
  const qrRaw = invoice.qr || '';
  let qrCodeUrl = '';
  let qrString = '';

  if (qrRaw.startsWith('http://') || qrRaw.startsWith('https://')) {
    qrCodeUrl = qrRaw;
    qrString = qrRaw;
  } else if (qrRaw.length > 0) {
    // If qr is a raw QRIS payload (000201...), construct rendered QR image URL
    qrString = qrRaw;
    qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qrRaw)}`;
  }

  return {
    qrCodeUrl,
    qrUrl: qrCodeUrl,
    qrString,
    checkoutUrl: invoice.checkout_url,
    orderId,
    grossAmount: roundedAmount,
    transactionId: invoice.trx_id,
    raw: {
      ...invoice,
      status: json.status,
      message: json.message,
    },
  };
}

/**
 * Check transaction status on Sakurupiah
 */
export async function checkSakurupiahStatus(trxId: string): Promise<string> {
  const baseUrl = getSakurupiahBaseUrl();
  const apiId = SAKURUPIAH_API_ID;
  const apiKey = SAKURUPIAH_API_KEY;

  const params = new URLSearchParams();
  params.append('api_id', apiId);
  params.append('method', 'status');
  params.append('trx_id', trxId);

  const response = await fetch(`${baseUrl}/status-transaction.php`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const data = (await response.json()) as {
    status: string;
    message?: string;
    data?: Array<{ status: string }>;
  };

  if (data.data && data.data[0]) {
    return data.data[0].status; // e.g. "berhasil", "pending", "expired"
  }
  return 'unknown';
}
