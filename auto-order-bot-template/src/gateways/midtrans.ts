import { config } from '../../config/bot.config';

export async function createMidtransQris(params: {
  orderCode: string;
  amount: number;
}): Promise<{ qrCodeUrl: string; qrString: string; raw: unknown }> {
  const { serverKey, isProduction } = config.gateways.midtrans;
  if (!serverKey) {
    throw new Error('Midtrans serverKey is not configured.');
  }

  const endpoint = isProduction
    ? 'https://api.midtrans.com/v2/charge'
    : 'https://api.sandbox.midtrans.com/v2/charge';

  const authHeader = Buffer.from(`${serverKey}:`).toString('base64');

  const bodyData = {
    payment_type: 'qris',
    transaction_details: {
      order_id: params.orderCode,
      gross_amount: Math.round(params.amount),
    },
    qris: {
      acquirer: 'gopay',
    },
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Basic ${authHeader}`,
    },
    body: JSON.stringify(bodyData),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Midtrans API HTTP ${response.status}: ${errText}`);
  }

  const result = (await response.json()) as {
    status_code: string;
    actions?: Array<{ name: string; url: string }>;
    qr_string?: string;
  };

  const qrAction = result.actions?.find((a) => a.name === 'generate-qr-code');
  const qrCodeUrl = qrAction?.url || '';
  const qrString = result.qr_string || '';

  return {
    qrCodeUrl,
    qrString,
    raw: result,
  };
}
