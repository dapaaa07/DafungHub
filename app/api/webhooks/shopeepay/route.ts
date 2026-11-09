import { NextRequest, NextResponse } from 'next/server';
import { processShopeePayWebhookPayload } from '../../../../lib/shopeepay';
import { bot } from '../../../../bot/handler';

/**
 * ShopeePay Payment Notification Webhook:
 * Handles incoming payment notifications from ShopeePay Gateway or database workers.
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature =
      req.headers.get('x-signature') || req.headers.get('X-Signature') || undefined;

    const { httpStatus, body } = await processShopeePayWebhookPayload(
      rawBody,
      bot,
      signature
    );

    return NextResponse.json(body, { status: httpStatus });
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
