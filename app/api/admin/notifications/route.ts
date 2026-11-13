import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyAdminRequest, unauthorizedResponse } from '@/lib/admin-auth';
import { registerAdminPushToken } from '@/lib/push-notifications';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: Request) {
  if (!verifyAdminRequest(req)) {
    return unauthorizedResponse();
  }

  try {
    const body = await req.json().catch(() => ({}));
    const token = body.token || body.pushToken;

    if (token && typeof token === 'string') {
      await registerAdminPushToken(token);
      return NextResponse.json(
        { success: true, message: 'Push token berhasil didaftarkan.' },
        { status: 200, headers: CORS_HEADERS }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Token push tidak valid.' },
      { status: 400, headers: CORS_HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message || 'Gagal mendaftarkan push token.' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function GET(req: Request) {
  if (!verifyAdminRequest(req)) {
    return unauthorizedResponse();
  }

  try {
    // 1. Fetch recent paid orders from the last 2 hours (up to 30 orders)
    // The mobile client uses seenOrderCodes to filter out orders already notified
    const newOrdersRes = await query<{
      id: string;
      order_code: string;
      product_name: string;
      price: number;
      fulfillment_status: string;
      created_at: string;
      telegram_id: string;
      username: string | null;
      first_name: string | null;
      membership_tier: string | null;
      inv_username: string | null;
      inv_first_name: string | null;
    }>(
      `SELECT o.id, o.order_code,
              COALESCE(p.name, 'Produk Khusus') as product_name,
              COALESCE(p.price, (o.invoice_data->>'amount')::int, (o.invoice_data->>'payable_amount')::int, 0) as price,
              o.fulfillment_status,
              o.created_at,
              u.telegram_id,
              u.username,
              u.first_name,
              u.membership_tier,
              (o.invoice_data->>'customer_username') as inv_username,
              (o.invoice_data->>'customer_first_name') as inv_first_name
       FROM orders o
       LEFT JOIN products p ON o.product_id = p.id
       LEFT JOIN users u ON o.user_id = u.id
       WHERE o.payment_status = 'paid'
         AND o.created_at >= NOW() - INTERVAL '2 hours'
       ORDER BY o.created_at DESC
       LIMIT 30`
    );

    // 2. Count total orders currently pending fulfillment
    const pendingRes = await query<{ count: string }>(
      `SELECT COUNT(*)::text as count
       FROM orders
       WHERE payment_status = 'paid'
         AND fulfillment_status IN ('pending', 'processing')`
    );

    const pendingCount = parseInt(pendingRes.rows[0]?.count || '0', 10);

    return NextResponse.json(
      {
        success: true,
        hasNewOrders: newOrdersRes.rows.length > 0,
        newOrdersCount: newOrdersRes.rows.length,
        pendingFulfillmentCount: pendingCount,
        newPaidOrders: newOrdersRes.rows.map((row) => {
          const finalUsername = row.username || row.inv_username || null;
          const finalFirstName = row.first_name || row.inv_first_name || null;
          const finalPrice = Number(row.price || 0);

          return {
            id: row.id,
            orderCode: row.order_code,
            productName: row.product_name,
            price: finalPrice,
            formattedPrice: `Rp ${finalPrice.toLocaleString('id-ID')}`,
            fulfillmentStatus: row.fulfillment_status,
            createdAt: row.created_at,
            customer: {
              telegramId: row.telegram_id || 'Pembeli',
              username: finalUsername,
              firstName: finalFirstName,
              isVip: Boolean(row.membership_tier && row.membership_tier !== 'free'),
            },
          };
        }),
        serverTime: new Date().toISOString(),
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message || 'Gagal memeriksa notifikasi pesanan baru.',
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
