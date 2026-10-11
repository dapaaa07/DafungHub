import { NextRequest, NextResponse } from 'next/server';
import { processOrderPayment } from '../../../../lib/fulfillment';
import { bot } from '../../../../bot/handler';

/**
 * Midtrans Payment Notification Webhook:
 * Automatically called by Midtrans whenever a customer completes a QRIS payment.
 * Triggers the Smart Fallback Fulfillment Engine (H2H instant delivery or Queue Mode).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const orderId = body.order_id;
    const transactionStatus = body.transaction_status;
    const fraudStatus = body.fraud_status;

    // Midtrans settlement or capture (with accept) indicates paid
    const isPaid =
      transactionStatus === 'settlement' ||
      (transactionStatus === 'capture' && fraudStatus === 'accept');

    if (isPaid && orderId) {
      console.log(`[Midtrans Webhook] Payment confirmed for order: ${orderId}`);
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
