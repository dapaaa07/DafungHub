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

    let targetOrderCode =
      data.order_id || data.order_code || data.merchant_ref || data.token;
    const status = String(
      data.status || data.payment_status || 'paid'
    ).toLowerCase();

    let detectedAmount = Number((data as Record<string, unknown>).amount || (data as Record<string, unknown>).nominal || 0);

    // 2. If no direct order code, extract amount from data or notification text (for MacroDroid / Notification Listeners)
    if (!targetOrderCode) {
      if (!detectedAmount) {
        const fullText = `${(data as Record<string, unknown>).notification || ''} ${(data as Record<string, unknown>).text || ''} ${(data as Record<string, unknown>).message || ''} ${(data as Record<string, unknown>).body || ''} ${(data as Record<string, unknown>).not_body || ''} ${rawBody}`;
        const match = fullText.match(/(?:rp\.?|idr)\s*([0-9.,]+)/i) || fullText.match(/([0-9]{3,7})/);
        if (match) {
          const clean = match[1].replace(/[^0-9]/g, '');
          detectedAmount = parseInt(clean, 10);
        }
      }

      if (detectedAmount > 0) {
        const { query } = await import('../../../../lib/db');
        const matchOrd = await query<{ order_code: string }>(
          `SELECT order_code FROM orders
           WHERE payment_status = 'unpaid'
             AND (
               (invoice_data->>'payable_amount')::numeric = $1
               OR (invoice_data->>'amount')::numeric = $1
             )
             AND created_at >= NOW() - INTERVAL '24 hours'
           ORDER BY created_at DESC LIMIT 1`,
          [detectedAmount]
        );
        if (matchOrd.rows.length > 0) {
          targetOrderCode = matchOrd.rows[0].order_code;
        }
      }
    }

    const isPaid =
      status === 'success' ||
      status === 'paid' ||
      status === 'settlement' ||
      status === 'completed';

    if (isPaid && targetOrderCode) {
      console.log(`[ShopeePay Webhook] Payment confirmed for order: ${targetOrderCode}`);
      await processOrderPayment(targetOrderCode, bot);

      return NextResponse.json({
        success: true,
        message: 'ShopeePay payment successfully confirmed',
        order_code: targetOrderCode,
        detected_amount: detectedAmount || null,
      });
    }

    return NextResponse.json({
      success: true,
      message: targetOrderCode
        ? `Status received: ${status || 'unknown'}`
        : (detectedAmount > 0
            ? `Amount detected (Rp ${detectedAmount.toLocaleString('id-ID')}) but no unpaid order found within last 24h`
            : `Notification received, no amount or order found`),
      order_id: targetOrderCode || null,
      detected_amount: detectedAmount || null,
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
