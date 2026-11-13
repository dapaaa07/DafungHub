import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyAdminRequest, unauthorizedResponse } from '@/lib/admin-auth';
import { updateShopeePayToken } from '@/lib/shopeepay';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));

    // Fetch paid orders directly from Dafung Hub database (no external Shopee session needed)
    const ordersRes = await query<{
      id: string;
      order_code: string;
      product_name: string;
      price: number;
      payable_amount: string | null;
      created_at: string;
      shopeepay_tx_id: string | null;
      payment_method: string | null;
      username: string | null;
      first_name: string | null;
      telegram_id: string;
    }>(
      `SELECT o.id, o.order_code, p.name as product_name, p.price, o.created_at,
              o.invoice_data->>'payable_amount' as payable_amount,
              o.invoice_data->>'shopeepay_tx_id' as shopeepay_tx_id,
              o.invoice_data->>'payment_method' as payment_method,
              u.username, u.first_name, u.telegram_id
       FROM orders o
       JOIN products p ON o.product_id = p.id
       JOIN users u ON o.user_id = u.id
       WHERE o.payment_status = 'paid'
       ORDER BY o.created_at DESC
       LIMIT $1`,
      [limit]
    );

    const paidOrders = ordersRes.rows;

    // Calculate overall stats from Dafung Hub DB
    const statsRes = await query<{
      total_incoming_today: string;
      total_incoming_all: string;
      total_count: string;
    }>(
      `SELECT
        COALESCE(SUM(CASE WHEN o.created_at >= CURRENT_DATE THEN COALESCE((o.invoice_data->>'payable_amount')::numeric, p.price) ELSE 0 END), 0)::text as total_incoming_today,
        COALESCE(SUM(COALESCE((o.invoice_data->>'payable_amount')::numeric, p.price)), 0)::text as total_incoming_all,
        COUNT(*)::text as total_count
       FROM orders o
       JOIN products p ON o.product_id = p.id
       WHERE o.payment_status = 'paid'`
    );

    const totalIncomingToday = Math.round(Number(statsRes.rows[0]?.total_incoming_today || 0));
    const totalIncomingAll = Math.round(Number(statsRes.rows[0]?.total_incoming_all || 0));
    const totalTransactions = parseInt(statsRes.rows[0]?.total_count || '0', 10);

    const transactions = paidOrders.map((ord, idx) => {
      const amount = Math.round(Number(ord.payable_amount || ord.price || 0));
      const txId = ord.shopeepay_tx_id || ord.order_code || `TX-${Date.now()}-${idx}`;
      const method = (ord.payment_method || '').toLowerCase();
      const issuer = method === 'saldo' ? 'Saldo Akun' : 'QRIS (Dafung Hub)';

      return {
        transactionId: txId,
        amount,
        formattedAmount: `Rp ${amount.toLocaleString('id-ID')}`,
        status: 'success',
        time: new Date(ord.created_at).toLocaleString('id-ID', {
          timeZone: 'Asia/Jakarta',
          dateStyle: 'medium',
          timeStyle: 'short',
        }),
        issuer,
        isMatched: true,
        order: {
          orderCode: ord.order_code,
          productName: ord.product_name,
          customer: ord.username ? `@${ord.username}` : ord.first_name || ord.telegram_id,
          telegramId: ord.telegram_id,
        },
      };
    });

    return NextResponse.json(
      {
        success: true,
        tokenValid: true,
        summary: {
          totalTransactions,
          matchedOrdersCount: totalTransactions,
          unmatchedCount: 0,
          totalIncomingAll,
          totalIncomingToday,
          formattedTotalToday: `Rp ${totalIncomingToday.toLocaleString('id-ID')}`,
          formattedTotalAll: `Rp ${totalIncomingAll.toLocaleString('id-ID')}`,
        },
        transactions,
        timestamp: new Date().toISOString(),
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message || 'Gagal memuat catatan transaksi ShopeePay.',
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function POST(req: Request) {
  if (!verifyAdminRequest(req)) {
    return unauthorizedResponse();
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const rawToken = String(body.token || body.shopeeToken || body.shopeepayToken || '').trim();
    if (!rawToken) {
      return NextResponse.json(
        { success: false, error: 'Token ShopeePay wajib diisi.' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const result = await updateShopeePayToken(rawToken);
    return NextResponse.json(result, {
      status: result.success ? 200 : 502,
      headers: CORS_HEADERS,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message || 'Gagal memperbarui token ShopeePay.',
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
