import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyAdminRequest, unauthorizedResponse } from '@/lib/admin-auth';
import { SHOPEEPAY_BASE_URL, SHOPEEPAY_API_KEY, ShopeePayTransactionItem } from '@/lib/shopeepay';

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
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));

    // 1. Fetch raw transaction mutations from ShopeePay gateway
    const gatewayUrl = `${SHOPEEPAY_BASE_URL.replace(/\/+$/, '')}/transactions?page_size=${pageSize}`;
    const gatewayRes = await fetch(gatewayUrl, {
      method: 'GET',
      headers: {
        'x-api-key': SHOPEEPAY_API_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (!gatewayRes.ok) {
      const errText = await gatewayRes.text().catch(() => '');
      return NextResponse.json(
        {
          success: false,
          error: `Gateway ShopeePay merespons status ${gatewayRes.status}: ${errText}`,
        },
        { status: 502, headers: CORS_HEADERS }
      );
    }

    const gatewayJson = await gatewayRes.json();
    const rawList: ShopeePayTransactionItem[] =
      gatewayJson?.data?.transactions || gatewayJson?.transactions || [];

    // 2. Fetch recent paid orders to correlate with mutations
    const ordersRes = await query<{
      id: string;
      order_code: string;
      product_name: string;
      price: number;
      created_at: string;
      shopeepay_tx_id: string | null;
      username: string | null;
      first_name: string | null;
      telegram_id: string;
    }>(
      `SELECT o.id, o.order_code, p.name as product_name, p.price, o.created_at,
              o.invoice_data->>'shopeepay_tx_id' as shopeepay_tx_id,
              u.username, u.first_name, u.telegram_id
       FROM orders o
       JOIN products p ON o.product_id = p.id
       JOIN users u ON o.user_id = u.id
       WHERE o.payment_status = 'paid'
       ORDER BY o.created_at DESC
       LIMIT 100`
    );

    const paidOrders = ordersRes.rows;
    const orderMapByTxId = new Map<string, typeof paidOrders[0]>();
    paidOrders.forEach((ord) => {
      if (ord.shopeepay_tx_id) {
        orderMapByTxId.set(String(ord.shopeepay_tx_id).trim(), ord);
      }
    });

    let totalIncomingToday = 0;
    let totalIncomingAll = 0;
    let matchedCount = 0;

    const todayStr = new Date().toISOString().slice(0, 10);

    const correlatedTransactions = rawList.map((tx) => {
      const txId = String(tx.transactionId || tx.id || '').trim();
      const amount = Math.round(Number(tx.amount || tx.nominal || tx.total || 0));
      const rawTime = String(tx.time || tx.created_at || tx.timestamp || tx.date || '').trim();
      const isToday = rawTime.startsWith(todayStr);

      totalIncomingAll += amount;
      if (isToday) {
        totalIncomingToday += amount;
      }

      // Check direct match by transaction ID
      let matched = txId ? orderMapByTxId.get(txId) : undefined;

      // Fallback: match by amount and close creation time if not matched by ID
      if (!matched && amount > 0) {
        const txTimeMs = new Date(rawTime.replace(' ', 'T') + '+07:00').getTime();
        matched = paidOrders.find((ord) => {
          if (ord.price !== amount) return false;
          if (isNaN(txTimeMs)) return true;
          const ordTimeMs = new Date(ord.created_at).getTime();
          return Math.abs(ordTimeMs - txTimeMs) <= 30 * 60 * 1000; // within 30 mins
        });
      }

      if (matched) {
        matchedCount++;
      }

      return {
        transactionId: txId,
        amount,
        formattedAmount: `Rp ${amount.toLocaleString('id-ID')}`,
        status: String(tx.status || 'success'),
        time: rawTime,
        issuer: String(tx.issuer || 'ShopeePay'),
        isMatched: Boolean(matched),
        order: matched
          ? {
              orderCode: matched.order_code,
              productName: matched.product_name,
              customer: matched.username ? `@${matched.username}` : matched.first_name || matched.telegram_id,
              telegramId: matched.telegram_id,
            }
          : null,
      };
    });

    return NextResponse.json(
      {
        success: true,
        summary: {
          totalTransactions: rawList.length,
          matchedOrdersCount: matchedCount,
          unmatchedCount: rawList.length - matchedCount,
          totalIncomingAll,
          totalIncomingToday,
          formattedTotalToday: `Rp ${totalIncomingToday.toLocaleString('id-ID')}`,
          formattedTotalAll: `Rp ${totalIncomingAll.toLocaleString('id-ID')}`,
        },
        transactions: correlatedTransactions,
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
