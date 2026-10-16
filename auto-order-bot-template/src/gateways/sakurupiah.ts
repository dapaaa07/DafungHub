import crypto from 'crypto';
import { config } from '../../config/bot.config';

export function getSakurupiahBaseUrl(): string {
  if (config.gateways.sakurupiah.baseUrl) {
    return config.gateways.sakurupiah.baseUrl.replace(/\/+$/, '');
  }
  const isSandbox =
    config.gateways.sakurupiah.apiId.startsWith('SANBOX') ||
    config.gateways.sakurupiah.mode === 'sandbox';

  return isSandbox
    ? 'https://sakurupiah.id/api-sanbox'
    : 'https://sakurupiah.id/api';
}

export interface SakurupiahInvoiceData {
  via: string;
  payment_kode: string;
  trx_id: string;
  merchant_ref: string;
  total: number;
  payment_status: string;
  qr: string;
  checkout_url?: string;
}

export interface SakurupiahCreateResponse {
  status: string;
  message: string;
  data?: SakurupiahInvoiceData[];
}

export function verifySakurupiahSignature(payloadJson: string, receivedSignature: string): boolean {
  if (!config.gateways.sakurupiah.apiKey || !receivedSignature) return false;
  try {
    const computedSignature = crypto
      .createHmac('sha256', config.gateways.sakurupiah.apiKey)
      .update(payloadJson)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(computedSignature, 'utf8'),
      Buffer.from(receivedSignature, 'utf8')
    );
  } catch (err) {
    console.error('[Sakurupiah] Signature verification error:', err);
    return false;
  }
}

export async function createSakurupiahInvoice(params: {
  orderCode: string;
  amount: number;
  productName: string;
  buyerName?: string;
  buyerPhone?: string;
  channel?: string;
}): Promise<{ qrCodeUrl: string; qrString: string; raw: unknown }> {
  const { apiId, apiKey } = config.gateways.sakurupiah;
  if (!apiId || !apiKey) {
    throw new Error('Sakurupiah credentials (apiId, apiKey) are not configured.');
  }

  const endpoint = `${getSakurupiahBaseUrl()}/create-transaction`;
  const channel = params.channel || 'QRIS';

  const bodyData = {
    api_id: apiId,
    api_key: apiKey,
    via: channel,
    merchant_ref: params.orderCode,
    nama: params.buyerName || 'Pelanggan Bot',
    phone: params.buyerPhone || '08120000000',
    email: 'buyer@store.com',
    produk: [
      {
        nama_produk: params.productName,
        qty: 1,
        harga: params.amount,
      },
    ],
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyData),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Sakurupiah API HTTP ${response.status}: ${errText}`);
  }

  const result = (await response.json()) as SakurupiahCreateResponse;
  const invoice = result.data?.[0];

  if (!invoice || result.status !== 'success') {
    throw new Error(`Sakurupiah transaction failed: ${result.message || 'Unknown response'}`);
  }

  const qrString = invoice.qr || '';
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(qrString)}`;

  return {
    qrCodeUrl,
    qrString,
    raw: invoice,
  };
}
