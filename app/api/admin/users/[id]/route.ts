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

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!verifyAdminRequest(req)) {
    return unauthorizedResponse();
  }

  const { id } = await context.params;
  const userIdOrTg = decodeURIComponent(id).trim();

  try {
    const userRes = await query<{
      id: string;
      telegram_id: string;
      role: string;
      balance: number;
      username: string | null;
      first_name: string | null;
      membership_tier: string | null;
      membership_expires_at: string | null;
      weekly_discount_used: number;
      created_at: string;
    }>(
      `SELECT * FROM users WHERE id::text = $1 OR telegram_id = $1 LIMIT 1`,
      [userIdOrTg]
    );

    if (userRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Pengguna tidak ditemukan.' },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    const user = userRes.rows[0];

    // Fetch user orders
    const ordersRes = await query<{
      order_code: string;
      product_name: string;
      price: number;
      payment_status: string;
      fulfillment_status: string;
      created_at: string;
    }>(
      `SELECT o.order_code, p.name as product_name, p.price, o.payment_status, o.fulfillment_status, o.created_at
       FROM orders o
       JOIN products p ON o.product_id = p.id
       WHERE o.user_id = $1
       ORDER BY o.created_at DESC`,
      [user.id]
    );

    return NextResponse.json(
      {
        success: true,
        user: {
          id: user.id,
          telegramId: user.telegram_id,
          role: user.role,
          balance: user.balance,
          username: user.username,
          firstName: user.first_name,
          membershipTier: user.membership_tier || 'free',
          membershipExpiresAt: user.membership_expires_at,
          weeklyDiscountUsed: user.weekly_discount_used,
          createdAt: user.created_at,
        },
        orders: ordersRes.rows.map((o) => ({
          orderCode: o.order_code,
          productName: o.product_name,
          price: o.price,
          paymentStatus: o.payment_status,
          fulfillmentStatus: o.fulfillment_status,
          createdAt: o.created_at,
        })),
        timestamp: new Date().toISOString(),
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message || 'Gagal memuat detail pengguna.',
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
