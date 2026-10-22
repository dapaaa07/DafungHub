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
    const search = url.searchParams.get('search') || '';
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    const params: unknown[] = [];

    if (search.trim()) {
      params.push(`%${search.trim()}%`);
      const pIdx = params.length;
      whereClause += ` AND (u.telegram_id ILIKE $${pIdx} OR u.username ILIKE $${pIdx} OR u.first_name ILIKE $${pIdx})`;
    }

    // Total count
    const countRes = await query<{ total: string }>(
      `SELECT COUNT(*)::text as total FROM users u WHERE ${whereClause}`,
      params
    );
    const totalCount = parseInt(countRes.rows[0]?.total || '0', 10);

    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    // Fetch users with order stats
    const usersRes = await query<{
      id: string;
      telegram_id: string;
      role: string;
      balance: number;
      username: string | null;
      first_name: string | null;
      membership_tier: string | null;
      membership_expires_at: string | null;
      created_at: string;
      total_orders: string;
      total_spent: string;
    }>(
      `SELECT
        u.id, u.telegram_id, u.role, COALESCE(u.balance, 0) as balance,
        u.username, u.first_name, u.membership_tier, u.membership_expires_at,
        u.created_at,
        COUNT(CASE WHEN o.payment_status = 'paid' THEN 1 END)::text as total_orders,
        COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN p.price ELSE 0 END), 0)::text as total_spent
       FROM users u
       LEFT JOIN orders o ON u.id = o.user_id
       LEFT JOIN products p ON o.product_id = p.id
       WHERE ${whereClause}
       GROUP BY u.id
       ORDER BY total_spent DESC, u.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    return NextResponse.json(
      {
        success: true,
        users: usersRes.rows.map((row) => ({
          id: row.id,
          telegramId: row.telegram_id,
          role: row.role,
          balance: row.balance,
          username: row.username,
          firstName: row.first_name,
          membershipTier: row.membership_tier || 'free',
          membershipExpiresAt: row.membership_expires_at,
          isVip: Boolean(row.membership_tier && row.membership_tier !== 'free'),
          createdAt: row.created_at,
          stats: {
            totalOrders: parseInt(row.total_orders, 10) || 0,
            totalSpent: parseInt(row.total_spent, 10) || 0,
          },
        })),
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
        timestamp: new Date().toISOString(),
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message || 'Gagal memuat data pelanggan.',
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
