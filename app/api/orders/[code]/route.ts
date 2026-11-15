import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { decrypt } from '@/lib/encrypt';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const orderCode = code?.trim();

    if (!orderCode) {
      return NextResponse.json({ success: false, error: 'Kode order tidak valid.' }, { status: 400 });
    }

    const orderRes = await query<{
      id: string;
      order_code: string;
      user_id: string;
      product_id: string;
      payment_status: 'unpaid' | 'paid' | 'expired';
      fulfillment_status: 'pending' | 'processing' | 'delivered';
      invoice_data: unknown;
      credential_encrypted: string | null;
      created_at: string;
      updated_at: string;
      delivered_at: string | null;
      product_name: string;
      product_price: number;
      product_description?: string;
    }>(
      `SELECT o.*, p.name as product_name, p.price as product_price, p.description as product_description
       FROM orders o
       JOIN products p ON o.product_id = p.id
       WHERE o.order_code = $1
       LIMIT 1`,
      [orderCode]
    );

    if (orderRes.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Pesanan tidak ditemukan.' }, { status: 404 });
    }

    let order = orderRes.rows[0];
    const invData =
      typeof order.invoice_data === 'string'
        ? JSON.parse(order.invoice_data || '{}')
        : ((order.invoice_data || {}) as Record<string, unknown>);

    // If order is still unpaid, check ShopeePay payment status on the fly
    if (order.payment_status === 'unpaid') {
      const orderGateway = String(invData.gateway || process.env.PAYMENT_GATEWAY || 'shopeepay').toLowerCase();
      if (orderGateway === 'shopeepay' && invData.token) {
        try {
          const { checkShopeePayPayment } = await import('@/lib/shopeepay');
          const checkAmount = Number(invData.payable_amount || order.product_price);
          const checkResult = await checkShopeePayPayment({
            token: String(invData.token),
            orderCode: order.order_code,
            amount: checkAmount,
            orderCreatedAt: order.created_at,
          });

          if (checkResult.paid) {
            const { processOrderPayment } = await import('@/lib/fulfillment');
            const { bot } = await import('@/bot/handler');
            const txMeta = checkResult.transaction && typeof checkResult.transaction === 'object'
              ? (checkResult.transaction as Record<string, unknown>)
              : undefined;

            await processOrderPayment(order.order_code, bot, txMeta);

            // Re-fetch fresh order status
            const freshRes = await query<typeof order>(
              `SELECT o.*, p.name as product_name, p.price as product_price, p.description as product_description
               FROM orders o
               JOIN products p ON o.product_id = p.id
               WHERE o.order_code = $1 LIMIT 1`,
              [orderCode]
            );
            if (freshRes.rows.length > 0) {
              order = freshRes.rows[0];
            }
          }
        } catch (checkErr) {
          console.warn('[Order Poll] Auto-check error:', checkErr);
        }
      }
    }

    // Decrypt credentials if delivered
    let credentials: string | null = null;
    if (order.fulfillment_status === 'delivered' && order.credential_encrypted) {
      try {
        credentials = decrypt(order.credential_encrypted);
      } catch (decErr) {
        console.error('[Order Poll] Credential decryption error:', decErr);
        credentials = '⚠️ Gagal mendekripsi kredensial. Silakan hubungi Customer Support.';
      }
    }

    const payableAmount =
      typeof invData.payable_amount === 'number'
        ? invData.payable_amount
        : Number(order.product_price || 0);

    return NextResponse.json({
      success: true,
      order: {
        orderCode: order.order_code,
        productName: order.product_name,
        productDescription: order.product_description,
        paymentStatus: order.payment_status,
        fulfillmentStatus: order.fulfillment_status,
        paymentMethod: invData.payment_method || 'qris',
        gateway: invData.gateway || 'shopeepay',
        payableAmount,
        qrCodeUrl: invData.qr_code_url || null,
        qrString: invData.qr_string || null,
        checkoutUrl: invData.checkout_url || null,
        uniqueCode: invData.unique_code || 0,
        createdAt: order.created_at,
        deliveredAt: order.delivered_at,
        credentials,
        isDelivered: order.fulfillment_status === 'delivered',
        isPaid: order.payment_status === 'paid',
        isExpired: order.payment_status === 'expired',
      },
    });
  } catch (error) {
    console.error('[/api/orders/[code]] Error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message || 'Terjadi kesalahan sistem.' },
      { status: 500 }
    );
  }
}
