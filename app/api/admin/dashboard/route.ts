import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyAdminRequest, unauthorizedResponse } from '@/lib/admin-auth';
import { getSupplierBalance, getSupplierProfile } from '@/lib/supplier';
import { SHOPEEPAY_BASE_URL, SHOPEEPAY_API_KEY } from '@/lib/shopeepay';

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
    // 1. Fetch today's and all-time revenue from paid orders
    const statsQuery = await query<{
      today_revenue: string;
      today_orders: string;
      total_revenue: string;
      total_orders: string;
      pending_fulfillment: string;
    }>(
      `SELECT
        COALESCE(SUM(CASE WHEN payment_status = 'paid' AND created_at >= CURRENT_DATE THEN p.price ELSE 0 END), 0)::text as today_revenue,
        COUNT(CASE WHEN payment_status = 'paid' AND created_at >= CURRENT_DATE THEN 1 END)::text as today_orders,
        COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN p.price ELSE 0 END), 0)::text as total_revenue,
        COUNT(CASE WHEN payment_status = 'paid' THEN 1 END)::text as total_orders,
        COUNT(CASE WHEN payment_status = 'paid' AND fulfillment_status IN ('pending', 'processing') THEN 1 END)::text as pending_fulfillment
       FROM orders o
       JOIN products p ON o.product_id = p.id`
    );

    const stats = statsQuery.rows[0] || {
      today_revenue: '0',
      today_orders: '0',
      total_revenue: '0',
      total_orders: '0',
      pending_fulfillment: '0',
    };

    // 2. Fetch user counts
    const userStats = await query<{ total_users: string; vip_users: string }>(
      `SELECT
        COUNT(*)::text as total_users,
        COUNT(CASE WHEN membership_tier IS NOT NULL AND membership_tier != 'free' AND (membership_expires_at IS NULL OR membership_expires_at > CURRENT_TIMESTAMP) THEN 1 END)::text as vip_users
       FROM users`
    );

    // 3. Supplier info (balance & profile)
    let supplierBalance = 0;
    let supplierCurrency = 'IDR';
    let supplierUsername = 'prastyaaneki';
    try {
      const bal = await getSupplierBalance();
      supplierBalance = bal.balance || 0;
      supplierCurrency = bal.currency || 'IDR';
      const prof = await getSupplierProfile().catch(() => null);
      if (prof?.username) supplierUsername = prof.username;
    } catch {
      // Keep defaults if supplier offline
    }

    // 4. ShopeePay gateway check
    let shopeeOnline = false;
    try {
      const shopeeRes = await fetch(`${SHOPEEPAY_BASE_URL.replace(/\/+$/, '')}/transactions?page_size=1`, {
        method: 'GET',
        headers: { 'x-api-key': SHOPEEPAY_API_KEY },
      });
      shopeeOnline = shopeeRes.ok;
    } catch {
      shopeeOnline = false;
    }

    // 5. Bot maintenance status
    let isMaintenance = false;
    try {
      const mRes = await query<{ value: string }>(
        `SELECT value FROM bot_settings WHERE key = 'bot_maintenance_mode' LIMIT 1`
      );
      isMaintenance = mRes.rows[0]?.value === 'true';
    } catch {
      // Default to false
    }

    // 6. Recent paid orders (last 5)
    const recentOrders = await query<{
      order_code: string;
      product_name: string;
      price: number;
      fulfillment_status: string;
      payment_status: string;
      telegram_id: string;
      username: string | null;
      created_at: string;
    }>(
      `SELECT o.order_code, p.name as product_name, p.price, o.fulfillment_status, o.payment_status,
              u.telegram_id, u.username, o.created_at
       FROM orders o
       JOIN products p ON o.product_id = p.id
       JOIN users u ON o.user_id = u.id
       WHERE o.payment_status = 'paid'
       ORDER BY o.created_at DESC
       LIMIT 5`
    );

    return NextResponse.json(
      {
        success: true,
        stats: {
          todayRevenue: parseInt(stats.today_revenue, 10) || 0,
          todayOrders: parseInt(stats.today_orders, 10) || 0,
          totalRevenue: parseInt(stats.total_revenue, 10) || 0,
          totalOrders: parseInt(stats.total_orders, 10) || 0,
          pendingFulfillment: parseInt(stats.pending_fulfillment, 10) || 0,
          totalUsers: parseInt(userStats.rows[0]?.total_users || '0', 10),
          vipUsers: parseInt(userStats.rows[0]?.vip_users || '0', 10),
        },
        supplier: {
          balance: supplierBalance,
          currency: supplierCurrency,
          username: supplierUsername,
        },
        shopeepay: {
          isOnline: shopeeOnline,
          gatewayUrl: SHOPEEPAY_BASE_URL,
        },
        bot: {
          isMaintenance,
        },
        recentOrders: recentOrders.rows,
        timestamp: new Date().toISOString(),
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message || 'Gagal memuat ringkasan dashboard.',
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
