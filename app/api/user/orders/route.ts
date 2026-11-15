import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCustomerFromRequest } from '@/lib/customer-auth';
import { decrypt } from '@/lib/encrypt';

export async function GET(req: NextRequest) {
  try {
    const customer = await getCustomerFromRequest(req);
    if (!customer) {
      return NextResponse.json(
        { success: false, error: 'Silakan masuk untuk melihat riwayat pesanan Anda.' },
        { status: 401 }
      );
    }

    const res = await query<{
      id: string;
      order_code: string;
      payment_status: 'unpaid' | 'paid' | 'expired';
      fulfillment_status: 'pending' | 'processing' | 'delivered';
      invoice_data: unknown;
      credential_encrypted: string | null;
      created_at: string;
      delivered_at: string | null;
      product_name: string;
      product_price: number;
    }>(
      `SELECT o.id, o.order_code, o.payment_status, o.fulfillment_status,
              o.invoice_data, o.credential_encrypted, o.created_at, o.delivered_at,
              p.name as product_name, p.price as product_price
       FROM orders o
       JOIN products p ON o.product_id = p.id
       WHERE o.user_id = $1
       ORDER BY o.created_at DESC
       LIMIT 50`,
      [customer.id]
    );

    const orders = res.rows.map((row) => {
      const invData =
        typeof row.invoice_data === 'string'
          ? JSON.parse(row.invoice_data || '{}')
          : ((row.invoice_data || {}) as Record<string, unknown>);

      let credentials: string | null = null;
      if (row.fulfillment_status === 'delivered' && row.credential_encrypted) {
        try {
          credentials = decrypt(row.credential_encrypted);
        } catch {
          credentials = '⚠️ Kredensial tidak dapat didekripsi.';
        }
      }

      return {
        id: row.id,
        orderCode: row.order_code,
        productName: row.product_name,
        paymentStatus: row.payment_status,
        fulfillmentStatus: row.fulfillment_status,
        paymentMethod: invData.payment_method || 'qris',
        payableAmount:
          typeof invData.payable_amount === 'number'
            ? invData.payable_amount
            : Number(row.product_price || 0),
        createdAt: row.created_at,
        deliveredAt: row.delivered_at,
        credentials,
      };
    });

    return NextResponse.json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error('[/api/user/orders] Error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message || 'Gagal mengambil riwayat pesanan.' },
      { status: 500 }
    );
  }
}
