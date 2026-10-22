import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyAdminRequest, unauthorizedResponse } from '@/lib/admin-auth';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: Request) {
  if (!verifyAdminRequest(req)) {
    return unauthorizedResponse();
  }

  try {
    const url = new URL(req.url);
    const sinceParam = url.searchParams.get('since');

    let sinceDate: Date;
    if (sinceParam) {
      const parsed = new Date(sinceParam);
      sinceDate = isNaN(parsed.getTime()) ? new Date(Date.now() - 60000) : parsed;
    } else {
      // Default to last 5 minutes if no since param provided
      sinceDate = new Date(Date.now() - 300000);
    }

    // 1. Fetch orders marked as paid since given timestamp
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
    }>(
      `SELECT o.id, o.order_code, p.name as product_name, p.price, o.fulfillment_status,
              o.created_at, u.telegram_id, u.username, u.first_name, u.membership_tier
       FROM orders o
       JOIN products p ON o.product_id = p.id
       JOIN users u ON o.user_id = u.id
       WHERE o.payment_status = 'paid'
         AND o.created_at > $1
       ORDER BY o.created_at DESC`,
      [sinceDate]
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
        newPaidOrders: newOrdersRes.rows.map((row) => ({
          id: row.id,
          orderCode: row.order_code,
          productName: row.product_name,
          price: row.price,
          formattedPrice: `Rp ${row.price.toLocaleString('id-ID')}`,
          fulfillmentStatus: row.fulfillment_status,
          createdAt: row.created_at,
          customer: {
            telegramId: row.telegram_id,
            username: row.username,
            firstName: row.first_name,
            isVip: Boolean(row.membership_tier && row.membership_tier !== 'free'),
          },
        })),
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
