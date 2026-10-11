import { NextRequest, NextResponse } from 'next/server';
import { processOrderPayment } from '../../../../lib/fulfillment';
import { bot } from '../../../../bot/handler';
import { verifySakurupiahCallbackSignature } from '../../../../lib/sakurupiah';

/**
 * Sakurupiah Payment Notification Webhook:
 * Automatically called by Sakurupiah whenever a customer completes a payment.
 * Validates HMAC-SHA256 signature and triggers the Smart Fallback Fulfillment Engine.
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-callback-signature') || '';
    const event = req.headers.get('x-callback-event') || '';

    // Validate callback event
    if (event && event !== 'payment_status') {
      console.warn(`[Sakurupiah Webhook] Ignored unknown event: ${event}`);
      return NextResponse.json(
        { success: false, message: `Unrecognized callback event: ${event}` },
        { status: 400 }
      );
    }

    // Validate signature
    if (signature && !verifySakurupiahCallbackSignature(rawBody, signature)) {
      console.error('[Sakurupiah Webhook] Invalid signature rejected');
      return NextResponse.json(
        { success: false, message: 'Invalid signature' },
        { status: 401 }
      );
    }

    let data: {
      trx_id?: string;
      merchant_ref?: string;
      status?: string;
      status_kode?: number | string;
    } = {};

    try {
      data = JSON.parse(rawBody || '{}');
    } catch {
      return NextResponse.json(
        { success: false, message: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    const orderId = data.merchant_ref;
    const paymentStatus = data.status;
    const statusCode = Number(data.status_kode);

    const isPaid = paymentStatus === 'berhasil' && (statusCode === 1 || isNaN(statusCode));

    if (isPaid && orderId) {
      console.log(`[Sakurupiah Webhook] Payment confirmed for order: ${orderId} (trx: ${data.trx_id})`);
      await processOrderPayment(orderId, bot);

      return NextResponse.json({
        success: true,
        message: 'Payment status berhasil',
        order_id: orderId,
      });
    }

    if (paymentStatus === 'expired' || statusCode === 2) {
      console.log(`[Sakurupiah Webhook] Order expired: ${orderId}`);
      return NextResponse.json({
        success: true,
        message: 'Payment status expired',
        order_id: orderId,
      });
    }

    return NextResponse.json({
      success: true,
      message: `Payment status ${paymentStatus || 'received'}`,
      order_id: orderId,
    });
  } catch (error) {
    console.error('[Sakurupiah Webhook Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error processing webhook' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'active',
    endpoint: '/api/webhooks/sakurupiah',
    service: 'DaFung Hub Sakurupiah Webhook Handler',
  });
}
