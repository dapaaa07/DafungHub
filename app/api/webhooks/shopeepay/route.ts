import { NextRequest, NextResponse } from 'next/server';
import { processOrderPayment } from '../../../../lib/fulfillment';
import { bot } from '../../../../bot/handler';

/**
 * ShopeePay Payment Notification Webhook:
 * Handles incoming payment notifications from ShopeePay Gateway or database workers.
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    let data: {
      order_id?: string;
      order_code?: string;
      merchant_ref?: string;
      token?: string;
      status?: string;
      payment_status?: string;
    } = {};

    try {
      data = JSON.parse(rawBody || '{}');
    } catch {
      return NextResponse.json(
        { success: false, message: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    const orderId =
      data.order_id || data.order_code || data.merchant_ref || data.token;
    const status = String(
      data.status || data.payment_status || ''
    ).toLowerCase();

    const isPaid =
      status === 'success' ||
      status === 'paid' ||
      status === 'settlement' ||
      status === 'completed';

    if (isPaid && orderId) {
      console.log(`[ShopeePay Webhook] Payment confirmed for order: ${orderId}`);
      await processOrderPayment(orderId, bot);

      return NextResponse.json({
        success: true,
        message: 'ShopeePay payment successfully confirmed',
        order_id: orderId,
      });
    }

    return NextResponse.json({
      success: true,
      message: `ShopeePay status received: ${status || 'unknown'}`,
      order_id: orderId,
    });
  } catch (error) {
    console.error('[ShopeePay Webhook Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error processing webhook' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'active',
    endpoint: '/api/webhooks/shopeepay',
    service: 'DaFung Hub ShopeePay Webhook Handler',
  });
}
