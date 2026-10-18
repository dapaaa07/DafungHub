import { config } from '../../config/bot.config';

export interface ShopeePayTransactionResult {
  qrCodeUrl: string;
  qrUrl: string;
  qrString: string;
  checkoutUrl?: string;
  token: string;
  orderCode: string;
  grossAmount: number;
  gateway: 'shopeepay';
  raw: Record<string, unknown>;
}

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

export function generateDynamicQrisFromStatic(
  staticQris: string,
  amount: number
): string {
  let qris = staticQris.replace('010211', '010212');
  const crcIndex = qris.lastIndexOf('6304');
  if (crcIndex !== -1) {
    qris = qris.slice(0, crcIndex);
  }

  const roundedAmount = Math.round(amount);
  const amtStr = String(roundedAmount);
  const tag54 = '54' + String(amtStr.length).padStart(2, '0') + amtStr;

  const idx53 = qris.indexOf('5303360');
  if (idx53 !== -1) {
    const after53 = idx53 + '5303360'.length;
    qris = qris.slice(0, after53) + tag54 + qris.slice(after53);
  } else {
    qris += tag54;
  }

  qris += '6304';
  const crc = crc16Ccitt(qris);
  return qris + crc;
}

export async function createShopeePayInvoice(
  orderCode: string,
  amount: number
): Promise<ShopeePayTransactionResult> {
  const { apiKey, baseUrl, staticQris } = config.gateways.shopeepay;
  const roundedAmount = Math.round(amount);
  const cleanBaseUrl = (baseUrl || 'https://shopee.prastyaaneki.biz.id').replace(/\/+$/, '');

  // 1. Attempt POST /v1/qris/create if apiKey exists
  if (apiKey) {
    try {
      const response = await fetch(`${cleanBaseUrl}/v1/qris/create`, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
          'Idempotency-Key': orderCode,
        },
        body: JSON.stringify({ amount: roundedAmount }),
      });

      const resJson = await response.json();
      if (response.ok && resJson.success && resJson.data) {
        const data = resJson.data;
        const qrString = data.qris || data.qr_string || data.qr || '';
        const token = data.token || data.qris_token || `shopee_${orderCode}`;
        const qrCodeUrl =
          data.qr_image ||
          data.qr_code_url ||
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
          raw: resJson,
        };
      }
    } catch {
      // Fall through to zero-downtime static conversion
    }
  }

  // 2. Zero-downtime fallback via static QRIS conversion
  const staticToken = staticQris || '00020101021126610016ID.CO.SHOPEE.WWW01189360091800239501700208239501700303UMI51440014ID.CO.QRIS.WWW0215ID10266191349880303UMI5204481453033605802ID5910Dafung Hub6008KARAWANG61054137362070703A016304BBC9';
  const dynamicQris = generateDynamicQrisFromStatic(staticToken, roundedAmount);
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(dynamicQris)}`;

  return {
    qrCodeUrl,
    qrUrl: qrCodeUrl,
    qrString: dynamicQris,
    token: `shopee_${orderCode}`,
    orderCode,
    grossAmount: roundedAmount,
    gateway: 'shopeepay',
    raw: {
      success: true,
      mode: 'static_conversion',
      orderCode,
      amount: roundedAmount,
    },
  };
}

export async function checkShopeePayPayment(params: {
  token?: string;
  amount?: number;
  orderCreatedAt?: string | Date;
}): Promise<{ paid: boolean; status: string }> {
  const { apiKey, baseUrl } = config.gateways.shopeepay;
  if (!apiKey) return { paid: false, status: 'unpaid' };

  const cleanBaseUrl = (baseUrl || 'https://shopee.prastyaaneki.biz.id').replace(/\/+$/, '');

  // 1. Check with /v1/payment/check if token is active
  if (params.token && !params.token.startsWith('shopee_')) {
    try {
      const res = await fetch(`${cleanBaseUrl}/v1/payment/check`, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: params.token, wait: false }),
      });
      if (res.ok) {
        const json = await res.json();
        const status = String(json?.data?.status || '').toLowerCase();
        if (status === 'success' || status === 'paid' || status === 'settlement' || status === 'completed') {
          return { paid: true, status: 'paid' };
        }
      }
    } catch {
      // Continue to transactions check
    }
  }

  // 2. Check mutations via /transactions
  try {
    const res = await fetch(`${cleanBaseUrl}/transactions?page_size=20`, {
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
    });
    if (res.ok) {
      const json = await res.json();
      const transactions: any[] = json?.data?.transactions || [];
      if (params.amount && transactions.length > 0) {
        const targetAmount = Math.round(params.amount);
        const match = transactions.find((t) => Math.round(Number(t.amount || t.nominal || 0)) === targetAmount);
        if (match) return { paid: true, status: 'paid' };
      }
    }
  } catch {
    // Suppress
  }

  return { paid: false, status: 'unpaid' };
}
