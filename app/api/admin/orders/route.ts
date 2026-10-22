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
    const status = url.searchParams.get('status') || 'all'; // all | pending | paid | delivered | unpaid
    const search = url.searchParams.get('search') || '';
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '30', 10)));
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    const params: unknown[] = [];

    if (status === 'pending') {
      params.push('paid');
      whereClause += ` AND o.payment_status = $${params.length}`;
      whereClause += ` AND o.fulfillment_status IN ('pending', 'processing')`;
    } else if (status === 'paid') {
      params.push('paid');
      whereClause += ` AND o.payment_status = $${params.length}`;
    } else if (status === 'delivered') {
      params.push('delivered');
      whereClause += ` AND o.fulfillment_status = $${params.length}`;
    } else if (status === 'unpaid') {
      params.push('unpaid');
      whereClause += ` AND o.payment_status = $${params.length}`;
    }

    if (search.trim()) {
      params.push(`%${search.trim()}%`);
      const pIdx = params.length;
      whereClause += ` AND (o.order_code ILIKE $${pIdx} OR u.telegram_id ILIKE $${pIdx} OR u.username ILIKE $${pIdx} OR p.name ILIKE $${pIdx})`;
    }

    // Count total matching
    const countRes = await query<{ total: string }>(
      `SELECT COUNT(*)::text as total
       FROM orders o
       JOIN products p ON o.product_id = p.id
       JOIN users u ON o.user_id = u.id
       WHERE ${whereClause}`,
      params
    );
    const totalCount = parseInt(countRes.rows[0]?.total || '0', 10);

    // Fetch orders page
    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const ordersRes = await query<{
      id: string;
      order_code: string;
      product_id: string;
      product_name: string;
      product_price: number;
      payment_status: string;
      fulfillment_status: string;
      invoice_data: Record<string, unknown>;
      credential_encrypted: string | null;
      delivered_at: string | null;
      created_at: string;
      telegram_id: string;
      username: string | null;
      first_name: string | null;
      membership_tier: string | null;
    }>(
      `SELECT o.id, o.order_code, o.product_id, p.name as product_name, p.price as product_price,
              o.payment_status, o.fulfillment_status, o.invoice_data, o.credential_encrypted,
              o.delivered_at, o.created_at,
              u.telegram_id, u.username, u.first_name, u.membership_tier
       FROM orders o
       JOIN products p ON o.product_id = p.id
       JOIN users u ON o.user_id = u.id
       WHERE ${whereClause}
       ORDER BY o.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    return NextResponse.json(
      {
        success: true,
        orders: ordersRes.rows.map((row) => ({
          id: row.id,
          orderCode: row.order_code,
          productId: row.product_id,
          productName: row.product_name,
          price: row.product_price,
          paymentStatus: row.payment_status,
          fulfillmentStatus: row.fulfillment_status,
          isDelivered: row.fulfillment_status === 'delivered',
          deliveredAt: row.delivered_at,
          createdAt: row.created_at,
          hasEncryptedCredential: Boolean(row.credential_encrypted),
          customer: {
            telegramId: row.telegram_id,
            username: row.username,
            firstName: row.first_name,
            isVip: row.membership_tier && row.membership_tier !== 'free',
          },
          invoiceData: row.invoice_data,
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
        error: (error as Error).message || 'Gagal memuat daftar pesanan.',
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
