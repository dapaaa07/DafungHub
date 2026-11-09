import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyAdminRequest, unauthorizedResponse } from '@/lib/admin-auth';
import {
  fetchShopeePayTransactions,
  extractShopeePayTxId,
  parseShopeePayTimeMs,
  getWibTodayString,
  updateShopeePayToken,
} from '@/lib/shopeepay';

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
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));

    // 1. Fetch raw transaction mutations from ShopeePay gateway (/transactions with /v1/transactions fallback)
    const txFetch = await fetchShopeePayTransactions(pageSize);

    if (!txFetch.ok) {
      return NextResponse.json(
        {
          success: false,
          tokenValid: !txFetch.sessionExpired && txFetch.ok,
          error: txFetch.error || `Gateway ShopeePay merespons status ${txFetch.statusCode}`,
        },
        { status: 502, headers: CORS_HEADERS }
      );
    }

    const rawList = txFetch.transactions;

    // 2. Fetch recent paid orders to correlate with mutations
    const ordersRes = await query<{
      id: string;
      order_code: string;
      product_name: string;
      price: number;
      payable_amount: string | null;
      created_at: string;
      shopeepay_tx_id: string | null;
      username: string | null;
      first_name: string | null;
      telegram_id: string;
    }>(
      `SELECT o.id, o.order_code, p.name as product_name, p.price, o.created_at,
              o.invoice_data->>'payable_amount' as payable_amount,
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
    const orderMapByTxId = new Map<string, (typeof paidOrders)[0]>();
    paidOrders.forEach((ord) => {
      if (ord.shopeepay_tx_id) {
        orderMapByTxId.set(String(ord.shopeepay_tx_id).trim(), ord);
      }
    });

    let totalIncomingToday = 0;
    let totalIncomingAll = 0;
    let matchedCount = 0;

    const todayStr = getWibTodayString();

    const correlatedTransactions = rawList.map((tx, idx) => {
      const txId = extractShopeePayTxId(tx) || `TX-${Date.now()}-${idx}`;
      const amount = Math.round(Number(tx.amount || tx.nominal || tx.total || 0));
      const rawTime = String(tx.time || tx.created_at || tx.timestamp || tx.date || '').trim();
      const txTimeMs = parseShopeePayTimeMs(rawTime);
      const txWibDate = !isNaN(txTimeMs)
        ? new Date(txTimeMs + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
        : rawTime.slice(0, 10);

      totalIncomingAll += amount;
      if (txWibDate === todayStr) {
        totalIncomingToday += amount;
      }

      // Check direct match by normalized transaction ID
      let matched = txId ? orderMapByTxId.get(txId) : undefined;

      // Fallback: match by payable amount / price and close creation time if not matched by ID
      if (!matched && amount > 0) {
        matched = paidOrders.find((ord) => {
          const ordAmount = Math.round(Number(ord.payable_amount || ord.price || 0));
          if (ordAmount !== amount) return false;
          if (isNaN(txTimeMs)) return true;
          const ordTimeMs = new Date(ord.created_at).getTime();
          return Math.abs(ordTimeMs - txTimeMs) <= 30 * 60 * 1000;
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
        tokenValid: true,
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
