import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyAdminRequest, unauthorizedResponse } from '@/lib/admin-auth';
import { getSupplierBalance, getSupplierProfile } from '@/lib/supplier';
import { SHOPEEPAY_BASE_URL } from '@/lib/shopeepay';
import { getBotStatus } from '@/lib/settings';

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
    // Run independent dashboard queries in parallel for fast response
    const [statsQuery, userStats, recentOrders, botStatus, supplierData] = await Promise.all([
      // 1. Today's and all-time revenue from paid orders
      query<{
        today_revenue: string;
        today_orders: string;
        total_revenue: string;
        total_orders: string;
        pending_fulfillment: string;
      }>(
        `SELECT
          COALESCE(SUM(CASE WHEN o.payment_status = 'paid' AND o.created_at >= CURRENT_DATE THEN COALESCE((o.invoice_data->>'payable_amount')::numeric, p.price, 0) ELSE 0 END), 0)::text as today_revenue,
          COUNT(CASE WHEN o.payment_status = 'paid' AND o.created_at >= CURRENT_DATE THEN 1 END)::text as today_orders,
          COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN COALESCE((o.invoice_data->>'payable_amount')::numeric, p.price, 0) ELSE 0 END), 0)::text as total_revenue,
          COUNT(CASE WHEN o.payment_status = 'paid' THEN 1 END)::text as total_orders,
          COUNT(CASE WHEN o.payment_status = 'paid' AND o.fulfillment_status IN ('pending', 'processing') THEN 1 END)::text as pending_fulfillment
         FROM orders o
         LEFT JOIN products p ON o.product_id = p.id`
      ),

      // 2. User counts
      query<{ total_users: string; vip_users: string }>(
        `SELECT
          COUNT(*)::text as total_users,
          COUNT(CASE WHEN membership_tier IS NOT NULL AND membership_tier != 'free' AND (membership_expires_at IS NULL OR membership_expires_at > CURRENT_TIMESTAMP) THEN 1 END)::text as vip_users
         FROM users`
      ),

      // 3. Recent paid orders (last 5)
      query<{
        order_code: string;
        product_name: string;
        price: number;
        fulfillment_status: string;
        payment_status: string;
        telegram_id: string;
        username: string | null;
        created_at: string;
      }>(
        `SELECT o.order_code,
                COALESCE(p.name, 'Produk Khusus') as product_name,
                COALESCE((o.invoice_data->>'payable_amount')::int, p.price, 0) as price,
                o.fulfillment_status,
                o.payment_status,
                COALESCE(NULLIF(u.telegram_id, ''), 'WEB-' || UPPER(LEFT(REPLACE(u.id::text, '-', ''), 8))) as telegram_id,
                COALESCE(NULLIF(u.username, ''), NULLIF(SPLIT_PART(u.email, '@', 1), '')) as username,
                o.created_at
         FROM orders o
         LEFT JOIN products p ON o.product_id = p.id
         JOIN users u ON o.user_id = u.id
         WHERE o.payment_status = 'paid'
         ORDER BY o.created_at DESC
         LIMIT 5`
      ),

      // 4. Bot maintenance status
      getBotStatus().catch(() => 'online' as const),

      // 5. Supplier balance & profile
      (async () => {
        let balance = 0;
        let currency = 'IDR';
        let username = 'prastyaaneki';
        try {
          const [bal, prof] = await Promise.all([
            getSupplierBalance(),
            getSupplierProfile().catch(() => null),
          ]);
          balance = Number(bal?.balance ?? 0);
          currency = bal?.currency || 'IDR';
          if (prof?.username) username = prof.username;
        } catch {
          // Keep defaults if supplier API times out
        }
        return { balance, currency, username };
      })(),
    ]);

    const stats = statsQuery.rows[0] || {
      today_revenue: '0',
      today_orders: '0',
      total_revenue: '0',
      total_orders: '0',
      pending_fulfillment: '0',
    };

    const shopeeTokenStatus = {
      success: true,
      valid: true,
      isOnline: true,
      tokenStatus: 'active',
      message: 'Sistem Pembayaran DaFung Hub Aktif',
      gatewayUrl: SHOPEEPAY_BASE_URL,
    };

    return NextResponse.json(
      {
        success: true,
        stats: {
          todayRevenue: Math.round(parseFloat(stats.today_revenue) || 0),
          todayOrders: parseInt(stats.today_orders, 10) || 0,
          totalRevenue: Math.round(parseFloat(stats.total_revenue) || 0),
          totalOrders: parseInt(stats.total_orders, 10) || 0,
          pendingFulfillment: parseInt(stats.pending_fulfillment, 10) || 0,
          totalUsers: parseInt(userStats.rows[0]?.total_users || '0', 10),
          vipUsers: parseInt(userStats.rows[0]?.vip_users || '0', 10),
        },
        supplier: supplierData,
        shopeepay: {
          isOnline: shopeeTokenStatus.valid,
          tokenStatus: shopeeTokenStatus.tokenStatus,
          message: shopeeTokenStatus.message,
          gatewayUrl: SHOPEEPAY_BASE_URL,
        },
        bot: {
          isMaintenance: botStatus === 'maintenance',
        },
        recentOrders: recentOrders.rows,
        timestamp: new Date().toISOString(),
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error('[Admin Dashboard API Error]:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Gagal memuat ringkasan dashboard.',
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
