import http from 'http';
import { verifyAdminKey, ADMIN_SECRET_KEY } from './admin-auth';
import { query, Product } from './db';
import { getAllEnrichedProducts, getSupplierBalance, FALLBACK_PRODUCTS } from './supplier';
import { adminManualFulfill } from './fulfillment';
import { getBotStatus, setBotStatus } from './settings';
import { getShopeePayAccount } from './shopeepay';
import { bot } from '../bot/handler';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Cache-Control, Pragma, Authorization, x-admin-key',
};

function sendJson(res: http.ServerResponse, statusCode: number, data: unknown) {
  res.writeHead(statusCode, CORS_HEADERS);
  res.end(JSON.stringify(data));
}

function verifyRequestAuth(req: http.IncomingMessage, parsedUrl: URL): boolean {
  const headerKey = (req.headers['x-admin-key'] as string) || '';
  if (headerKey && verifyAdminKey(headerKey)) return true;

  const authHeader = (req.headers['authorization'] as string) || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    if (verifyAdminKey(token)) return true;
  }

  const queryKey = parsedUrl.searchParams.get('key');
  if (queryKey && verifyAdminKey(queryKey)) return true;

  return false;
}

export async function handleAdminHttpRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  bodyStr: string
): Promise<boolean> {
  const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/';

  // Only handle /api/admin/* paths
  if (!pathname.startsWith('/api/admin')) {
    return false;
  }

  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return true;
  }

  let body: Record<string, any> = {};
  try {
    if (bodyStr && bodyStr.trim()) {
      body = JSON.parse(bodyStr);
    }
  } catch {
    body = {};
  }

  // 1. POST /api/admin/auth
  if (pathname === '/api/admin/auth' && req.method === 'POST') {
    const key = body.key || body.pin || req.headers['x-admin-key'];
    if (!verifyAdminKey(key)) {
      sendJson(res, 401, {
        success: false,
        error: 'Kunci otentikasi admin atau PIN tidak valid.',
      });
      return true;
    }

    sendJson(res, 200, {
      success: true,
      message: 'Otentikasi admin berhasil.',
      token: ADMIN_SECRET_KEY,
      admin: {
        role: 'admin',
        username: 'Dafung Owner',
        channel: '@DafungHub',
      },
      timestamp: new Date().toISOString(),
    });
    return true;
  }

  // All other /api/admin/* endpoints require valid admin credentials
  if (!verifyRequestAuth(req, parsedUrl)) {
    sendJson(res, 401, {
      success: false,
      error: 'Akses admin tidak diizinkan. Kunci API atau token tidak valid.',
    });
    return true;
  }

  // 2. GET /api/admin/dashboard
  if (pathname === '/api/admin/dashboard' && req.method === 'GET') {
    try {
      const todayRevRes = await query<{ sum: string; count: string }>(
        `SELECT COALESCE(SUM(p.price), 0) as sum, COUNT(o.id) as count
         FROM orders o
         JOIN products p ON o.product_id = p.id
         WHERE o.payment_status = 'paid'
           AND o.created_at >= CURRENT_DATE`
      );

      const totalRevRes = await query<{ sum: string; count: string }>(
        `SELECT COALESCE(SUM(p.price), 0) as sum, COUNT(o.id) as count
         FROM orders o
         JOIN products p ON o.product_id = p.id
         WHERE o.payment_status = 'paid'`
      );

      const pendingFulfillRes = await query<{ count: string }>(
        `SELECT COUNT(id) as count FROM orders
         WHERE payment_status = 'paid' AND fulfillment_status = 'pending'`
      );

      const usersCountRes = await query<{ total_users: string; vip_users: string }>(
        `SELECT 
           COUNT(id) as total_users,
           COUNT(CASE WHEN membership_tier = 'vip' AND (membership_expires_at IS NULL OR membership_expires_at > NOW()) THEN 1 END) as vip_users
         FROM users`
      );

      const recentOrdersRes = await query<any>(
        `SELECT o.order_code, p.name as product_name, p.price, o.fulfillment_status, o.payment_status,
                u.telegram_id, u.username, o.created_at
         FROM orders o
         JOIN products p ON o.product_id = p.id
         LEFT JOIN users u ON o.user_id = u.id
         ORDER BY o.created_at DESC LIMIT 10`
      );

      const supplierBalance = await getSupplierBalance().catch(() => ({
        balance: 0,
        currency: 'IDR',
        username: 'prastyaaneki',
      }));

      const shopeeAccount = await getShopeePayAccount().catch(() => null);
      const botStatus = await getBotStatus().catch(() => 'online');

      sendJson(res, 200, {
        stats: {
          todayRevenue: Number(todayRevRes.rows[0]?.sum || 0),
          todayOrders: Number(todayRevRes.rows[0]?.count || 0),
          totalRevenue: Number(totalRevRes.rows[0]?.sum || 0),
          totalOrders: Number(totalRevRes.rows[0]?.count || 0),
          pendingFulfillment: Number(pendingFulfillRes.rows[0]?.count || 0),
          totalUsers: Number(usersCountRes.rows[0]?.total_users || 0),
          vipUsers: Number(usersCountRes.rows[0]?.vip_users || 0),
        },
        supplier: {
          balance: supplierBalance.balance,
          currency: supplierBalance.currency || 'IDR',
          username: (supplierBalance as any).username || 'Supplier API',
        },
        shopeepay: {
          isOnline: Boolean(shopeeAccount && (shopeeAccount as any).account_name),
          gatewayUrl: process.env.SHOPEEPAY_API_URL || 'https://shopee.prastyaaneki.biz.id',
        },
        bot: {
          isMaintenance: botStatus === 'maintenance',
        },
        recentOrders: recentOrdersRes.rows,
      });
      return true;
    } catch (err) {
      sendJson(res, 500, { success: false, error: (err as Error).message });
      return true;
    }
  }

  // 3. GET /api/admin/orders
  if (pathname === '/api/admin/orders' && req.method === 'GET') {
    try {
      const status = parsedUrl.searchParams.get('status');
      const search = parsedUrl.searchParams.get('search');
      const page = Math.max(1, parseInt(parsedUrl.searchParams.get('page') || '1', 10));
      const limit = Math.max(1, parseInt(parsedUrl.searchParams.get('limit') || '20', 10));
      const offset = (page - 1) * limit;

      const conditions: string[] = [];
      const values: any[] = [];
      let valIdx = 1;

      if (status) {
        if (status === 'pending_fulfillment') {
          conditions.push(`o.payment_status = 'paid' AND o.fulfillment_status = 'pending'`);
        } else if (status === 'paid' || status === 'unpaid' || status === 'cancelled') {
          conditions.push(`o.payment_status = $${valIdx++}`);
          values.push(status);
        } else if (status === 'fulfilled' || status === 'failed') {
          conditions.push(`o.fulfillment_status = $${valIdx++}`);
          values.push(status);
        }
      }

      if (search) {
        conditions.push(`(o.order_code ILIKE $${valIdx} OR p.name ILIKE $${valIdx} OR u.username ILIKE $${valIdx} OR u.telegram_id ILIKE $${valIdx})`);
        values.push(`%${search}%`);
        valIdx++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countSql = `SELECT COUNT(o.id) as total FROM orders o JOIN products p ON o.product_id = p.id LEFT JOIN users u ON o.user_id = u.id ${whereClause}`;
      const countRes = await query<{ total: string }>(countSql, values);
      const totalCount = parseInt(countRes.rows[0]?.total || '0', 10);

      const ordersSql = `
        SELECT o.id, o.order_code, o.payment_status, o.fulfillment_status, o.is_delivered,
               o.delivered_at, o.created_at, o.encrypted_credential, o.invoice_data,
               p.id as product_id, p.name as product_name, p.price,
               u.telegram_id, u.username, u.first_name, u.membership_tier
        FROM orders o
        JOIN products p ON o.product_id = p.id
        LEFT JOIN users u ON o.user_id = u.id
        ${whereClause}
        ORDER BY o.created_at DESC
        LIMIT $${valIdx++} OFFSET $${valIdx++}
      `;
      const ordersRes = await query<any>(ordersSql, [...values, limit, offset]);

      const formatted = ordersRes.rows.map((row) => ({
        id: row.id,
        orderCode: row.order_code,
        productId: row.product_id,
        productName: row.product_name,
        price: Number(row.price),
        paymentStatus: row.payment_status,
        fulfillmentStatus: row.fulfillment_status,
        isDelivered: row.is_delivered,
        deliveredAt: row.delivered_at,
        createdAt: row.created_at,
        hasEncryptedCredential: Boolean(row.encrypted_credential),
        customer: {
          telegramId: row.telegram_id,
          username: row.username,
          firstName: row.first_name,
          isVip: row.membership_tier === 'vip',
        },
        invoiceData: typeof row.invoice_data === 'string' ? JSON.parse(row.invoice_data || '{}') : (row.invoice_data || {}),
      }));

      sendJson(res, 200, {
        success: true,
        orders: formatted,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      });
      return true;
    } catch (err) {
      sendJson(res, 500, { success: false, error: (err as Error).message });
      return true;
    }
  }

  // 4. POST /api/admin/orders/:code/fulfill
  const fulfillMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)\/fulfill$/);
  if (fulfillMatch && req.method === 'POST') {
    const orderCode = decodeURIComponent(fulfillMatch[1]);
    const credentials = body.credentials;
    const file = body.file;

    if (!credentials && !file?.content) {
      sendJson(res, 400, {
        success: false,
        error: 'Teks kredensial atau file dokumen wajib diisi.',
      });
      return true;
    }

    try {
      const success = await adminManualFulfill(orderCode, credentials || file?.name || 'Kredensial Dokumen', bot, file);
      if (success) {
        sendJson(res, 200, {
          success: true,
          message: `Pesanan ${orderCode} berhasil dipenuhi dan kredensial telah dikirimkan ke Telegram pembeli.`,
        });
      } else {
        sendJson(res, 400, {
          success: false,
          error: `Gagal memenuhi pesanan ${orderCode}. Pastikan status pesanan sudah dibayar.`,
        });
      }
      return true;
    } catch (err) {
      sendJson(res, 500, { success: false, error: (err as Error).message });
      return true;
    }
  }

  // 5. GET & POST /api/admin/products
  if (pathname === '/api/admin/products') {
    if (req.method === 'GET') {
      try {
        const enriched = await getAllEnrichedProducts(true);
        sendJson(res, 200, {
          success: true,
          count: enriched.length,
          products: enriched,
        });
        return true;
      } catch (err) {
        sendJson(res, 500, { success: false, error: (err as Error).message });
        return true;
      }
    }

    if (req.method === 'POST') {
      try {
        const { name, price, stock, description, requiresEmail } = body;
        if (!name || price === undefined || price === null) {
          sendJson(res, 400, {
            success: false,
            error: 'Nama produk dan harga wajib diisi.',
          });
          return true;
        }

        const newId = `manual_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const insertRes = await query<Product>(
          `INSERT INTO products (id, name, price, stock, is_active, description, is_manual, requires_email)
           VALUES ($1, $2, $3, $4, true, $5, true, $6)
           RETURNING *`,
          [newId, name.trim(), Math.round(Number(price)), Number(stock) || 0, description?.trim() || null, Boolean(requiresEmail)]
        );

        sendJson(res, 201, {
          success: true,
          message: `Produk "${name}" berhasil ditambahkan.`,
          product: insertRes.rows[0],
        });
        return true;
      } catch (err) {
        sendJson(res, 500, { success: false, error: (err as Error).message });
        return true;
      }
    }
  }

  // 6. PUT & DELETE /api/admin/products/:id
  const prodMatch = pathname.match(/^\/api\/admin\/products\/([^/]+)$/);
  if (prodMatch) {
    const id = decodeURIComponent(prodMatch[1]);

    if (req.method === 'PUT') {
      try {
        const { price, stock, isActive, description, name } = body;
        const updates: string[] = [];
        const values: any[] = [];
        let vIdx = 1;

        if (price !== undefined) {
          updates.push(`price = $${vIdx++}`);
          values.push(Math.round(Number(price)));
        }
        if (stock !== undefined) {
          updates.push(`stock = $${vIdx++}`);
          values.push(Number(stock));
        }
        if (isActive !== undefined) {
          updates.push(`is_active = $${vIdx++}`);
          values.push(Boolean(isActive));
        }
        if (description !== undefined) {
          updates.push(`description = $${vIdx++}`);
          values.push(description);
        }
        if (name) {
          updates.push(`name = $${vIdx++}`);
          values.push(name.trim());
        }

        if (updates.length > 0) {
          updates.push(`updated_at = NOW()`);
          values.push(id);
          await query(
            `UPDATE products SET ${updates.join(', ')} WHERE id = $${vIdx}`,
            values
          );
        }

        sendJson(res, 200, {
          success: true,
          message: 'Produk berhasil diperbarui.',
        });
        return true;
      } catch (err) {
        sendJson(res, 500, { success: false, error: (err as Error).message });
        return true;
      }
    }

    if (req.method === 'DELETE') {
      try {
        await query(
          `UPDATE products SET is_active = NOT is_active, updated_at = NOW() WHERE id = $1`,
          [id]
        );
        sendJson(res, 200, {
          success: true,
          message: 'Status aktif produk berhasil diubah.',
        });
        return true;
      } catch (err) {
        sendJson(res, 500, { success: false, error: (err as Error).message });
        return true;
      }
    }
  }

  // 7. GET /api/admin/users
  if (pathname === '/api/admin/users' && req.method === 'GET') {
    try {
      const search = parsedUrl.searchParams.get('search');
      const page = Math.max(1, parseInt(parsedUrl.searchParams.get('page') || '1', 10));
      const limit = Math.max(1, parseInt(parsedUrl.searchParams.get('limit') || '25', 10));
      const offset = (page - 1) * limit;

      const conditions: string[] = [];
      const values: any[] = [];
      let valIdx = 1;

      if (search) {
        conditions.push(`(u.telegram_id ILIKE $${valIdx} OR u.username ILIKE $${valIdx} OR u.first_name ILIKE $${valIdx})`);
        values.push(`%${search}%`);
        valIdx++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countRes = await query<{ total: string }>(
        `SELECT COUNT(id) as total FROM users u ${whereClause}`,
        values
      );
      const totalCount = parseInt(countRes.rows[0]?.total || '0', 10);

      const usersSql = `
        SELECT u.id, u.telegram_id, u.role, u.balance, u.username, u.first_name,
               u.membership_tier, u.membership_expires_at, u.created_at,
               COUNT(o.id) as total_orders,
               COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN p.price ELSE 0 END), 0) as total_spent
        FROM users u
        LEFT JOIN orders o ON u.id = o.user_id
        LEFT JOIN products p ON o.product_id = p.id
        ${whereClause}
        GROUP BY u.id
        ORDER BY u.created_at DESC
        LIMIT $${valIdx++} OFFSET $${valIdx++}
      `;
      const usersRes = await query<any>(usersSql, [...values, limit, offset]);

      const formatted = usersRes.rows.map((row) => ({
        id: row.id,
        telegramId: row.telegram_id,
        role: row.role,
        balance: Number(row.balance || 0),
        username: row.username,
        firstName: row.first_name,
        membershipTier: row.membership_tier,
        membershipExpiresAt: row.membership_expires_at,
        isVip: row.membership_tier === 'vip' && (!row.membership_expires_at || new Date(row.membership_expires_at) > new Date()),
        createdAt: row.created_at,
        stats: {
          totalOrders: Number(row.total_orders || 0),
          totalSpent: Number(row.total_spent || 0),
        },
      }));

      sendJson(res, 200, {
        success: true,
        users: formatted,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      });
      return true;
    } catch (err) {
      sendJson(res, 500, { success: false, error: (err as Error).message });
      return true;
    }
  }

  // 8. GET /api/admin/users/:id
  const userDetailMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (userDetailMatch && req.method === 'GET') {
    const id = decodeURIComponent(userDetailMatch[1]);
    try {
      const userRes = await query<any>(
        `SELECT * FROM users WHERE id = $1 OR telegram_id = $1 LIMIT 1`,
        [id]
      );
      if (userRes.rows.length === 0) {
        sendJson(res, 404, { success: false, error: 'User tidak ditemukan.' });
        return true;
      }
      const user = userRes.rows[0];

      const ordersRes = await query<any>(
        `SELECT o.id, o.order_code, o.payment_status, o.fulfillment_status, o.created_at,
                p.name as product_name, p.price
         FROM orders o
         JOIN products p ON o.product_id = p.id
         WHERE o.user_id = $1
         ORDER BY o.created_at DESC LIMIT 50`,
        [user.id]
      );

      sendJson(res, 200, {
        success: true,
        user: {
          ...user,
          balance: Number(user.balance || 0),
          isVip: user.membership_tier === 'vip' && (!user.membership_expires_at || new Date(user.membership_expires_at) > new Date()),
        },
        orders: ordersRes.rows,
      });
      return true;
    } catch (err) {
      sendJson(res, 500, { success: false, error: (err as Error).message });
      return true;
    }
  }

  // 9. GET /api/admin/shopeepay
  if (pathname === '/api/admin/shopeepay' && req.method === 'GET') {
    try {
      const limit = Math.min(100, Math.max(10, parseInt(parsedUrl.searchParams.get('limit') || '50', 10)));
      const gatewayUrl = `${(process.env.SHOPEEPAY_API_URL || 'https://shopee.prastyaaneki.biz.id').replace(/\/+$/, '')}/transactions?page_size=${limit}`;
      const gatewayRes = await fetch(gatewayUrl, {
        method: 'GET',
        headers: {
          'x-api-key': process.env.SHOPEEPAY_API_KEY || '',
          'Content-Type': 'application/json',
        },
      }).catch(() => null);
      const gatewayJson = gatewayRes && gatewayRes.ok ? await gatewayRes.json().catch(() => ({})) : {};
      const rawTransactions: any[] = gatewayJson?.data?.transactions || gatewayJson?.transactions || [];

      const reconciliationRes = await query<{
        order_code: string;
        payment_status: string;
        created_at: string;
        payable_amount: string;
        product_name: string;
        telegram_id: string;
        username: string | null;
      }>(
        `SELECT o.order_code, o.payment_status, o.created_at,
                (o.invoice_data->>'payable_amount') as payable_amount,
                p.name as product_name, u.telegram_id, u.username
         FROM orders o
         JOIN products p ON o.product_id = p.id
         LEFT JOIN users u ON o.user_id = u.id
         WHERE o.created_at >= NOW() - INTERVAL '7 days'
         ORDER BY o.created_at DESC LIMIT 200`
      );

      const recentOrders = reconciliationRes.rows;

      const reconciledTransactions = rawTransactions.map((tx: any) => {
        const txAmount = Number(tx.amount || 0);
        const txTime = new Date(tx.time || tx.created_at || Date.now()).getTime();

        const matchedOrder = recentOrders.find((ord) => {
          const ordAmount = Number(ord.payable_amount || 0);
          if (ordAmount !== txAmount) return false;
          const ordTime = new Date(ord.created_at).getTime();
          const diffMinutes = Math.abs(txTime - ordTime) / (1000 * 60);
          return diffMinutes <= 180;
        });

        return {
          transactionId: tx.transaction_id || tx.id || `TX-${Date.now()}`,
          amount: txAmount,
          formattedAmount: `Rp ${txAmount.toLocaleString('id-ID')}`,
          status: tx.status || 'Berhasil',
          time: tx.time || tx.created_at || new Date().toISOString(),
          issuer: tx.issuer || tx.payment_method || 'ShopeePay',
          isMatched: Boolean(matchedOrder),
          order: matchedOrder
            ? {
                orderCode: matchedOrder.order_code,
                productName: matchedOrder.product_name,
                customer: matchedOrder.username ? `@${matchedOrder.username}` : `ID: ${matchedOrder.telegram_id}`,
                telegramId: matchedOrder.telegram_id,
              }
            : null,
        };
      });

      const todayStr = new Date().toISOString().slice(0, 10);
      const totalToday = reconciledTransactions
        .filter((tx: any) => String(tx.time).startsWith(todayStr))
        .reduce((sum: number, tx: any) => sum + (tx.amount || 0), 0);

      const totalAll = reconciledTransactions.reduce((sum: number, tx: any) => sum + (tx.amount || 0), 0);
      const matchedCount = reconciledTransactions.filter((tx: any) => tx.isMatched).length;

      sendJson(res, 200, {
        summary: {
          totalTransactions: reconciledTransactions.length,
          matchedOrdersCount: matchedCount,
          unmatchedCount: reconciledTransactions.length - matchedCount,
          totalIncomingAll: totalAll,
          totalIncomingToday: totalToday,
          formattedTotalToday: `Rp ${totalToday.toLocaleString('id-ID')}`,
          formattedTotalAll: `Rp ${totalAll.toLocaleString('id-ID')}`,
        },
        transactions: reconciledTransactions,
      });
      return true;
    } catch (err) {
      sendJson(res, 500, { success: false, error: (err as Error).message });
      return true;
    }
  }

  // 10. GET /api/admin/notifications
  if (pathname === '/api/admin/notifications' && req.method === 'GET') {
    try {
      const since = parsedUrl.searchParams.get('since') || new Date(Date.now() - 5 * 60 * 1000).toISOString();

      const newPaidOrdersRes = await query<any>(
        `SELECT o.id, o.order_code, p.name as product_name, p.price, o.fulfillment_status,
                o.created_at, u.telegram_id, u.username, u.first_name, u.membership_tier
         FROM orders o
         JOIN products p ON o.product_id = p.id
         LEFT JOIN users u ON o.user_id = u.id
         WHERE o.payment_status = 'paid'
           AND o.created_at > $1
         ORDER BY o.created_at DESC`,
        [since]
      );

      const pendingFulfillRes = await query<{ count: string }>(
        `SELECT COUNT(id) as count FROM orders
         WHERE payment_status = 'paid' AND fulfillment_status = 'pending'`
      );

      const formatted = newPaidOrdersRes.rows.map((row) => ({
        id: row.id,
        orderCode: row.order_code,
        productName: row.product_name,
        price: Number(row.price),
        formattedPrice: `Rp ${Number(row.price).toLocaleString('id-ID')}`,
        fulfillmentStatus: row.fulfillment_status,
        createdAt: row.created_at,
        customer: {
          telegramId: row.telegram_id,
          username: row.username,
          firstName: row.first_name,
          isVip: row.membership_tier === 'vip',
        },
      }));

      sendJson(res, 200, {
        hasNewOrders: formatted.length > 0,
        newOrdersCount: formatted.length,
        pendingFulfillmentCount: parseInt(pendingFulfillRes.rows[0]?.count || '0', 10),
        newPaidOrders: formatted,
        serverTime: new Date().toISOString(),
      });
      return true;
    } catch (err) {
      sendJson(res, 500, { success: false, error: (err as Error).message });
      return true;
    }
  }

  // 11. POST /api/admin/broadcast
  if (pathname === '/api/admin/broadcast' && req.method === 'POST') {
    try {
      const text = body.text;
      if (!text || !text.trim()) {
        sendJson(res, 400, { success: false, error: 'Teks siaran tidak boleh kosong.' });
        return true;
      }

      const channel = process.env.BROADCAST_CHANNEL || '@DafungHub';
      await bot.sendMessage(channel, text.trim(), { parse_mode: 'HTML' });

      sendJson(res, 200, {
        success: true,
        message: `Pesan siaran berhasil dikirim ke channel ${channel}`,
        channel,
      });
      return true;
    } catch (err) {
      sendJson(res, 500, { success: false, error: (err as Error).message });
      return true;
    }
  }

  // 12. GET & POST /api/admin/settings
  if (pathname === '/api/admin/settings') {
    if (req.method === 'GET') {
      try {
        const botStatus = await getBotStatus().catch(() => 'online');
        sendJson(res, 200, {
          success: true,
          settings: {
            broadcastChannel: process.env.BROADCAST_CHANNEL || '@DafungHub',
            isMaintenance: botStatus === 'maintenance',
          },
        });
        return true;
      } catch (err) {
        sendJson(res, 500, { success: false, error: (err as Error).message });
        return true;
      }
    }

    if (req.method === 'POST') {
      try {
        if (body.isMaintenance !== undefined) {
          await setBotStatus(body.isMaintenance ? 'maintenance' : 'online');
        }
        sendJson(res, 200, {
          success: true,
          message: 'Pengaturan berhasil diperbarui.',
        });
        return true;
      } catch (err) {
        sendJson(res, 500, { success: false, error: (err as Error).message });
        return true;
      }
    }
  }

  sendJson(res, 404, { success: false, error: `Route ${pathname} tidak ditemukan.` });
  return true;
}
