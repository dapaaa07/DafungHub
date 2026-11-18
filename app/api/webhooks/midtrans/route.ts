import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { processOrderPayment } from '../../../../lib/fulfillment';
import { bot } from '../../../../bot/handler';

function verifyMidtransSignature(params: {
  orderId: string;
  statusCode: string;
  grossAmount: string;
  signatureKey: string;
  serverKey: string;
}): boolean {
  const { orderId, statusCode, grossAmount, signatureKey, serverKey } = params;
  if (!orderId || !statusCode || !grossAmount || !signatureKey || !serverKey) {
    return false;
  }
  const expected = crypto
    .createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest('hex');

  try {
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signatureKey.trim().toLowerCase(), 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Midtrans Payment Notification Webhook:
 * Automatically called by Midtrans whenever a customer completes a QRIS payment.
 * Validates SHA-512 signature_key before triggering the fulfillment engine.
 */
export async function POST(req: NextRequest) {
  try {
    const serverKey = process.env.MIDTRANS_SERVER_KEY || '';
    if (!serverKey) {
      console.error('[Midtrans Webhook] MIDTRANS_SERVER_KEY is not configured. Rejecting webhook.');
      return NextResponse.json(
        { error: 'Webhook verification secret not configured' },
        { status: 503 }
      );
    }

    const body = await req.json();
    const orderId = String(body.order_id || '');
    const statusCode = String(body.status_code || '');
    const grossAmount = String(body.gross_amount || '');
    const signatureKey = String(body.signature_key || '');
    const transactionStatus = body.transaction_status;
    const fraudStatus = body.fraud_status;

    if (
      !verifyMidtransSignature({
        orderId,
        statusCode,
        grossAmount,
        signatureKey,
        serverKey,
      })
    ) {
      console.error(`[Midtrans Webhook] Invalid or missing signature_key rejected for order: ${orderId}`);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    // Midtrans settlement or capture (with accept) indicates paid
    const isPaid =
      transactionStatus === 'settlement' ||
      (transactionStatus === 'capture' && fraudStatus === 'accept');

    if (isPaid && orderId) {
      console.log(`[Midtrans Webhook] Verified payment confirmed for order: ${orderId}`);
      await processOrderPayment(orderId, bot);
    }

    return NextResponse.json({
      status: 'ok',
      order_id: orderId,
      paid: isPaid,
    });
  } catch (error) {
    console.error('[Midtrans Webhook Error]:', error);
    return NextResponse.json(
      { error: 'Failed to process webhook notification' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'active',
    endpoint: '/api/webhooks/midtrans',
    service: 'DaFung Hub Midtrans Webhook Handler',
  });
}
