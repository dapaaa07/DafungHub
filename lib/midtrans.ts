import { CoreApi, Snap } from 'midtrans-client';

// Auto-load .env for standalone scripts / bot runners outside Next.js runtime
if (!process.env.MIDTRANS_SERVER_KEY) {
  try {
    process.loadEnvFile?.();
  } catch {
    // Ignore error if .env does not exist
  }
}

const isProduction = process.env.MIDTRANS_IS_PRODUCTION === 'true';
const serverKey = process.env.MIDTRANS_SERVER_KEY || '';
const clientKey = process.env.MIDTRANS_CLIENT_KEY || '';

/**
 * Singleton Midtrans Core API client (Sandbox by default)
 */
export const coreApi = new CoreApi({
  isProduction,
  serverKey,
  clientKey,
});

/**
 * Singleton Midtrans Snap client (Sandbox by default)
 */
export const snap = new Snap({
  isProduction,
  serverKey,
  clientKey,
});

export interface QrisTransactionResponse {
  qrCodeUrl: string;
  qrUrl: string;
  qrString: string;
  orderId: string;
  grossAmount: number;
  transactionId?: string;
  raw: Record<string, unknown>;
}

/**
 * Result class representing the QR code result.
 * Inherits from String so it can be evaluated directly as a string (URL or QR string),
 * while also exposing structured properties.
 */
export class QrisResult extends String implements QrisTransactionResponse {
  qrCodeUrl: string;
  qrUrl: string;
  qrString: string;
  orderId: string;
  grossAmount: number;
  transactionId?: string;
  raw: Record<string, unknown>;

  constructor(data: {
    qrCodeUrl: string;
    qrString: string;
    orderId: string;
    grossAmount: number;
    transactionId?: string;
    raw: Record<string, unknown>;
  }) {
    const primaryStr = data.qrCodeUrl || data.qrString || '';
    super(primaryStr);
    this.qrCodeUrl = data.qrCodeUrl;
    this.qrUrl = data.qrCodeUrl;
    this.qrString = data.qrString;
    this.orderId = data.orderId;
    this.grossAmount = data.grossAmount;
    this.transactionId = data.transactionId;
    this.raw = data.raw;
  }
}

/**
 * Create a dynamic QRIS transaction via Midtrans Core API.
 *
 * @param orderId Unique order identifier
 * @param grossAmount Total transaction amount in IDR
 * @param customerEmail Optional customer email
 * @param apiClient Optional custom CoreApi client (defaults to singleton coreApi)
 * @returns QrisResult which behaves as the QR code URL/string and contains structured metadata
 */
export async function createQrisTransaction(
  orderId: string,
  grossAmount: number,
  customerEmail?: string,
  apiClient: CoreApi = coreApi
): Promise<QrisResult> {
  if (!orderId) {
    throw new Error('orderId is required to create a QRIS transaction');
  }

  if (grossAmount <= 0) {
    throw new Error('grossAmount must be greater than 0');
  }

  const parameter: Record<string, unknown> = {
    payment_type: 'qris',
    transaction_details: {
      order_id: orderId,
      gross_amount: Math.round(grossAmount),
    },
  };

  if (customerEmail) {
    parameter.customer_details = {
      email: customerEmail,
    };
  }

  const response = (await apiClient.charge(parameter)) as Record<string, unknown>;

  // Extract QR code URL from actions array
  const actions = (response.actions as Array<{ name: string; method: string; url: string }>) || [];
  const qrAction = actions.find((action) => action.name === 'generate-qr-code');
  const qrCodeUrl = (qrAction?.url as string) || (response.qr_code_url as string) || '';
  const qrString = (response.qr_string as string) || '';
  const transactionId = (response.transaction_id as string) || undefined;

  return new QrisResult({
    qrCodeUrl,
    qrString,
    orderId,
    grossAmount,
    transactionId,
    raw: response,
  });
}
