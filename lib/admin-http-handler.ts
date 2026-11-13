import http from 'http';
import { verifyAdminKey, ADMIN_SECRET_KEY } from './admin-auth';
import { query, Product } from './db';
import { getAllEnrichedProducts, getSupplierBalance } from './supplier';
import { adminManualFulfill } from './fulfillment';
import { getBotStatus, setBotStatus } from './settings';
import {
  getShopeePayTokenStatus,
  updateShopeePayToken,
  fetchShopeePayTransactions,
  extractShopeePayTxId,
  parseShopeePayTimeMs,
  getWibTodayString,
} from './shopeepay';
import { bot, markMessageAsPreserved } from '../bot/handler';
import { broadcastOrderSuccess } from './broadcast';

interface AdminHttpRequestBody {
  key?: string;
  pin?: string;
  credentials?: string;
  media?: { name?: string; content?: string; isPhoto?: boolean };
  file?: { name?: string; content?: string; isPhoto?: boolean };
  name?: string;
  price?: number | string;
  stock?: number | string;
  description?: string;
  requiresEmail?: boolean;
  isActive?: boolean;
  token?: string;
  shopeeToken?: string;
  shopeepayToken?: string;
  text?: string;
  isMaintenance?: boolean;
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
  const rawPath = parsedUrl.pathname.replace(/\/+$/, '') || '/';
  const pathname = rawPath.startsWith('/api') ? rawPath : `/api${rawPath}`;

  // Only handle admin paths
  if (!pathname.startsWith('/api/admin') && !rawPath.includes('admin')) {
    return false;
  }

  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return true;
  }

  let body: AdminHttpRequestBody = {};
  try {
    if (bodyStr && bodyStr.trim()) {
      body = JSON.parse(bodyStr) as AdminHttpRequestBody;
    }
  } catch {
    body = {};
  }

  // 1. POST /api/admin/auth
  if (pathname === '/api/admin/auth' && req.method === 'POST') {
    const rawHeaderKey = req.headers['x-admin-key'];
    const headerKey = Array.isArray(rawHeaderKey) ? rawHeaderKey[0] : rawHeaderKey;
    const key = body.key || body.pin || headerKey;
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

      const recentOrdersRes = await query<Record<string, unknown>>(
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

      const shopeeTokenStatus = await getShopeePayTokenStatus().catch(() => ({
        success: false,
        valid: false,
        tokenStatus: 'unreachable',
        message: 'Gagal memeriksa status gateway ShopeePay',
      }));
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
          username: (supplierBalance as { username?: string }).username || 'Supplier API',
        },
        shopeepay: {
          isOnline: shopeeTokenStatus.valid,
          tokenStatus: shopeeTokenStatus.tokenStatus,
          message: shopeeTokenStatus.message,
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
      const values: unknown[] = [];
      let valIdx = 1;

      if (status) {
        if (status === 'pending_fulfillment' || status === 'pending') {
          conditions.push(`o.payment_status = 'paid' AND o.fulfillment_status IN ('pending', 'processing')`);
        } else if (status === 'paid' || status === 'unpaid' || status === 'cancelled') {
          conditions.push(`o.payment_status = $${valIdx++}`);
          values.push(status);
        } else if (status === 'fulfilled' || status === 'delivered') {
          conditions.push(`o.fulfillment_status = 'delivered'`);
        } else if (status === 'failed') {
          conditions.push(`o.fulfillment_status = 'failed'`);
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
        SELECT o.id, o.order_code, o.payment_status, o.fulfillment_status,
               (o.fulfillment_status = 'delivered') as is_delivered,
               o.delivered_at, o.created_at, o.credential_encrypted as encrypted_credential, o.invoice_data,
               p.id as product_id, p.name as product_name, p.price,
               u.telegram_id, u.username, u.first_name, u.membership_tier
        FROM orders o
        JOIN products p ON o.product_id = p.id
        LEFT JOIN users u ON o.user_id = u.id
        ${whereClause}
        ORDER BY o.created_at DESC
        LIMIT $${valIdx++} OFFSET $${valIdx++}
      `;
      const ordersRes = await query<{
        id: string;
        order_code: string;
        product_id: string;
        product_name: string;
        price: number | string;
        payment_status: string;
        fulfillment_status: string;
        is_delivered: boolean;
        delivered_at: string | null;
        created_at: string;
        encrypted_credential: string | null;
        invoice_data: unknown;
        telegram_id: string | null;
        username: string | null;
        first_name: string | null;
        membership_tier: string | null;
      }>(ordersSql, [...values, limit, offset]);

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
    const credentials = String(body.credentials || '').trim();
    const mediaObj = (body.media || body.file) as
      | { name?: string; content?: string; isPhoto?: boolean }
      | undefined;

    if (!credentials && (!mediaObj || !mediaObj.content)) {
      sendJson(res, 400, {
        success: false,
        error: 'Teks kredensial atau file dokumen wajib diisi.',
      });
      return true;
    }

    try {
      const orderRes = await query<{
        id: string;
        order_code: string;
        telegram_id: string;
        product_name: string;
      }>(
        `SELECT o.*, COALESCE(u.telegram_id, '') as telegram_id, COALESCE(p.name, 'Produk Khusus') as product_name
         FROM orders o
         LEFT JOIN users u ON o.user_id = u.id
         LEFT JOIN products p ON o.product_id = p.id
         WHERE o.order_code = $1 LIMIT 1`,
        [orderCode]
      );

      if (orderRes.rows.length === 0) {
        sendJson(res, 404, {
          success: false,
          error: `Pesanan "${orderCode}" tidak ditemukan.`,
        });
        return true;
      }

      const ord = orderRes.rows[0];
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (mediaObj?.content && token && ord.telegram_id && ord.telegram_id !== 'Guest') {
        const fileName = mediaObj.name || (mediaObj.isPhoto ? `${orderCode}_voucher.jpg` : `${orderCode}_kredensial.txt`);
        const fileBuffer =
          mediaObj.content.startsWith('data:') && mediaObj.content.includes('base64,')
            ? Buffer.from(mediaObj.content.split('base64,')[1], 'base64')
            : Buffer.from(mediaObj.content, 'base64');
        const isPhoto = Boolean(mediaObj.isPhoto || /\.(jpe?g|png|webp|gif)$/i.test(fileName));
        const endpoint = isPhoto ? 'sendPhoto' : 'sendDocument';
        const mimeType = isPhoto ? 'image/jpeg' : 'application/octet-stream';
        const formData = new FormData();
        formData.append('chat_id', String(ord.telegram_id));
        formData.append('parse_mode', 'HTML');
        formData.append(
          'caption',
          `🎉 <b>PESANAN ANDA TELAH SELESAI!</b>\n━━━━━━━━━━━━━━━━━━━\n📦 <b>Produk:</b> ${escapeHtml(ord.product_name)}\n🆔 <b>Kode Order:</b> <code>${escapeHtml(ord.order_code)}</code>\n━━━━━━━━━━━━━━━━━━━` +
            (credentials ? `\n\n🔑 <b>Kredensial / Petunjuk:</b>\n<code>${escapeHtml(credentials)}</code>` : '') +
            `\n\n📎 <i>Lampiran akun digital terlampir di atas. Simpan baik-baik!</i>`
        );
        formData.append(
          'reply_markup',
          JSON.stringify({
            inline_keyboard: [
              [
                { text: '📩 Riwayat Pesanan', callback_data: 'menu_orders' },
                { text: '🛍️ Beli Produk Baru', callback_data: 'menu_products' },
              ],
              [{ text: '🔙 Menu Utama', callback_data: 'menu_main' }],
            ],
          })
        );
        formData.append(isPhoto ? 'photo' : 'document', new Blob([new Uint8Array(fileBuffer)], { type: mimeType }), fileName);

        const tgRes = await fetch(`https://api.telegram.org/bot${token}/${endpoint}`, {
          method: 'POST',
          body: formData,
        });
        const tgJson = await tgRes.json().catch(() => null);

        if (tgJson?.ok && tgJson?.result) {
          const r = tgJson.result;
          if (r.message_id) {
            markMessageAsPreserved(String(ord.telegram_id), r.message_id);
          }
          const uploadedFileId = isPhoto
            ? r.photo?.[r.photo.length - 1]?.file_id
            : r.document?.file_id || r.video?.file_id || r.audio?.file_id || r.animation?.file_id;
          const uploadedType = isPhoto
            ? 'photo'
            : r.animation?.file_id
              ? 'animation'
              : r.video?.file_id
                ? 'video'
                : r.audio?.file_id
                  ? 'audio'
                  : 'document';
          if (uploadedFileId) {
            const { encrypt } = await import('./encrypt');
            const storedCred = `[MEDIA: ${fileName}] ${credentials || 'Dikirim via lampiran media'}`;
            await query(
              `UPDATE orders
               SET payment_status = 'paid',
                   fulfillment_status = 'delivered',
                   credential_encrypted = $1,
                   delivered_at = CURRENT_TIMESTAMP,
                   invoice_data = jsonb_set(COALESCE(invoice_data::jsonb, '{}'::jsonb), '{delivered_media}', $3::jsonb)
               WHERE id = $2`,
              [
                encrypt(storedCred),
                ord.id,
                JSON.stringify({ type: uploadedType, fileId: uploadedFileId, fileName, mimeType }),
              ]
            );
            broadcastOrderSuccess(orderCode, bot).catch((bErr) => {
              console.warn('[Broadcast Warning] Failed to broadcast admin HTTP media fulfill:', bErr);
            });
            sendJson(res, 200, {
              success: true,
              message: `Pesanan ${orderCode} beserta lampiran berhasil dipenuhi dan dikirim ke pembeli.`,
            });
            return true;
          }
        }
      }

      const fulfillRes = await adminManualFulfill(orderCode, credentials, bot);
      if (fulfillRes.success) {
        sendJson(res, 200, {
          success: true,
          message: `Pesanan ${orderCode} berhasil dipenuhi dan kredensial telah dikirimkan ke Telegram pembeli.`,
        });
      } else {
        sendJson(res, 400, {
          success: false,
          error: fulfillRes.message || `Gagal memenuhi pesanan ${orderCode}.`,
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

        const insertRes = await query<Product>(
          `INSERT INTO products (name, price, stock, is_active, description, is_manual, requires_email)
           VALUES ($1, $2, $3, true, $4, true, $5)
           RETURNING *`,
          [name.trim(), Math.round(Number(price)), Number(stock) || 0, description?.trim() || null, Boolean(requiresEmail)]
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
        const values: unknown[] = [];
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
      const limit = Math.min(100, Math.max(1, parseInt(parsedUrl.searchParams.get('limit') || '20', 10)));
      const offset = (page - 1) * limit;

      const conditions: string[] = [];
      const values: unknown[] = [];
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
      const usersRes = await query<{
        id: string;
        telegram_id: string;
        role: string;
        balance: number | string | null;
        username: string | null;
        first_name: string | null;
        membership_tier: string | null;
        membership_expires_at: string | Date | null;
        created_at: string | Date;
        total_orders: string | number;
        total_spent: string | number;
      }>(usersSql, [...values, limit, offset]);

      const totalPages = Math.ceil(totalCount / limit);
      const formatted = usersRes.rows.map((row) => {
        const isVip = Boolean(
          row.membership_tier === 'vip' &&
          (!row.membership_expires_at || new Date(row.membership_expires_at) > new Date())
        );
        const tier = isVip ? 'vip' : 'free';
        return {
          id: row.id,
          telegramId: row.telegram_id,
          telegram_id: row.telegram_id,
          role: row.role,
          balance: Number(row.balance || 0),
          username: row.username,
          firstName: row.first_name,
          first_name: row.first_name,
          membershipTier: tier,
          membership_tier: tier,
          membershipExpiresAt: row.membership_expires_at,
          membership_expires_at: row.membership_expires_at,
          isVip,
          createdAt: row.created_at,
          stats: {
            totalOrders: Number(row.total_orders || 0),
            totalSpent: Number(row.total_spent || 0),
          },
        };
      });

      sendJson(res, 200, {
        success: true,
        users: formatted,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages,
          hasMore: page < totalPages,
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
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      const userRes = await query<
        Record<string, unknown> & {
          id: string;
          balance?: number | string | null;
          membership_tier?: string | null;
          membership_expires_at?: string | Date | null;
        }
      >(
        isUuid
          ? `SELECT * FROM users WHERE id = $1 LIMIT 1`
          : `SELECT * FROM users WHERE telegram_id = $1 LIMIT 1`,
        [id]
      );
      if (userRes.rows.length === 0) {
        sendJson(res, 404, { success: false, error: 'User tidak ditemukan.' });
        return true;
      }
      const user = userRes.rows[0];

      const ordersRes = await query<Record<string, unknown>>(
        `SELECT o.id, o.order_code, o.payment_status, o.fulfillment_status, o.created_at,
                COALESCE(p.name, 'Produk Khusus') as product_name,
                COALESCE(p.price, (o.invoice_data->>'amount')::int, 0) as price
         FROM orders o
         LEFT JOIN products p ON o.product_id = p.id
         WHERE o.user_id = $1
         ORDER BY o.created_at DESC LIMIT 50`,
        [user.id]
      );

      const isVip = Boolean(
        user.membership_tier === 'vip' &&
        (!user.membership_expires_at || new Date(user.membership_expires_at) > new Date())
      );
      const tier = isVip ? 'vip' : 'free';

      sendJson(res, 200, {
        success: true,
        user: {
          ...user,
          id: user.id,
          telegramId: user.telegram_id,
          telegram_id: user.telegram_id,
          balance: Number(user.balance || 0),
          username: user.username,
          firstName: user.first_name,
          first_name: user.first_name,
          membershipTier: tier,
          membership_tier: tier,
          membershipExpiresAt: user.membership_expires_at,
          membership_expires_at: user.membership_expires_at,
          isVip,
        },
        orders: ordersRes.rows.map((o: any) => ({
          id: o.id,
          orderCode: o.order_code,
          productName: o.product_name,
          price: Number(o.price || 0),
          paymentStatus: o.payment_status,
          fulfillmentStatus: o.fulfillment_status,
          createdAt: o.created_at,
        })),
      });
      return true;
    } catch (err) {
      sendJson(res, 500, { success: false, error: (err as Error).message });
      return true;
    }
  }

  // 9. GET & POST /api/admin/shopeepay
  if (pathname === '/api/admin/shopeepay' && req.method === 'GET') {
    try {
      const limit = Math.min(100, Math.max(10, parseInt(parsedUrl.searchParams.get('limit') || '50', 10)));
      const txFetch = await fetchShopeePayTransactions(limit);
      const rawTransactions = txFetch.transactions;

      const reconciliationRes = await query<{
        order_code: string;
        payment_status: string;
        created_at: string;
        payable_amount: string | null;
        price: number;
        shopeepay_tx_id: string | null;
        product_name: string;
        telegram_id: string;
        username: string | null;
      }>(
        `SELECT o.order_code, o.payment_status, o.created_at,
                (o.invoice_data->>'payable_amount') as payable_amount,
                (o.invoice_data->>'shopeepay_tx_id') as shopeepay_tx_id,
                p.price, p.name as product_name, u.telegram_id, u.username
         FROM orders o
         JOIN products p ON o.product_id = p.id
         LEFT JOIN users u ON o.user_id = u.id
         WHERE o.created_at >= NOW() - INTERVAL '7 days'
         ORDER BY o.created_at DESC LIMIT 200`
      );

      const recentOrders = reconciliationRes.rows;
      const orderByTxId = new Map<string, (typeof recentOrders)[number]>();
      for (const ord of recentOrders) {
        if (ord.shopeepay_tx_id) {
          orderByTxId.set(String(ord.shopeepay_tx_id).trim(), ord);
        }
      }

      const todayStr = getWibTodayString();
      let totalToday = 0;

      const reconciledTransactions = rawTransactions.map((tx, idx: number) => {
        const txId = extractShopeePayTxId(tx) || `TX-${Date.now()}-${idx}`;
        const txAmount = Math.round(Number(tx.amount || tx.nominal || tx.total || 0));
        const rawTime = String(tx.time || tx.created_at || tx.timestamp || tx.date || '').trim();
        const txTimeMs = parseShopeePayTimeMs(rawTime);
        const effectiveTimeMs = isNaN(txTimeMs) ? Date.now() : txTimeMs;

        const txWibDate = !isNaN(txTimeMs)
          ? new Date(txTimeMs + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
          : rawTime.slice(0, 10);
        if (txWibDate === todayStr) {
          totalToday += txAmount;
        }

        let matchedOrder = txId ? orderByTxId.get(txId) : undefined;
        if (!matchedOrder && txAmount > 0) {
          matchedOrder = recentOrders.find((ord) => {
            const ordAmount = Math.round(Number(ord.payable_amount || ord.price || 0));
            if (ordAmount !== txAmount) return false;
            const ordTime = new Date(ord.created_at).getTime();
            const diffMinutes = Math.abs(effectiveTimeMs - ordTime) / (1000 * 60);
            return diffMinutes <= 180;
          });
        }

        return {
          transactionId: txId,
          amount: txAmount,
          formattedAmount: `Rp ${txAmount.toLocaleString('id-ID')}`,
          status: String(tx.status || 'Berhasil'),
          time: rawTime || new Date().toISOString(),
          issuer: String(tx.issuer || tx.payment_method || 'ShopeePay'),
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

      const totalAll = reconciledTransactions.reduce((sum: number, tx) => sum + (tx.amount || 0), 0);
      const matchedCount = reconciledTransactions.filter((tx) => tx.isMatched).length;

      sendJson(res, 200, {
        tokenValid: txFetch.ok && !txFetch.sessionExpired,
        gatewayError: txFetch.ok ? null : (txFetch.error || null),
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

  if (pathname === '/api/admin/shopeepay' && req.method === 'POST') {
    const rawToken = String(body.token || body.shopeeToken || body.shopeepayToken || '').trim();
    if (!rawToken) {
      sendJson(res, 400, {
        success: false,
        error: 'Token ShopeePay wajib diisi.',
      });
      return true;
    }

    try {
      const result = await updateShopeePayToken(rawToken);
      sendJson(res, result.success ? 200 : 502, result);
      return true;
    } catch (err) {
      sendJson(res, 500, { success: false, error: (err as Error).message });
      return true;
    }
  }

  // 10. GET & POST /api/admin/notifications
  if (pathname === '/api/admin/notifications') {
    if (req.method === 'POST') {
      try {
        const body = JSON.parse(bodyStr || '{}');
        const token = body.token || body.pushToken;
        if (token && typeof token === 'string') {
          const { registerAdminPushToken } = await import('./push-notifications');
          await registerAdminPushToken(token);
          sendJson(res, 200, { success: true, message: 'Push token berhasil didaftarkan.' });
          return true;
        }
        sendJson(res, 400, { success: false, error: 'Token push tidak valid.' });
        return true;
      } catch (err) {
        sendJson(res, 500, { success: false, error: (err as Error).message });
        return true;
      }
    }

    if (req.method === 'GET') {
      try {
        const newPaidOrdersRes = await query<{
          id: string;
          order_code: string;
          product_name: string;
          price: number | string;
          fulfillment_status: string;
          created_at: string | Date;
          telegram_id: string | null;
          username: string | null;
          first_name: string | null;
          membership_tier: string | null;
          inv_username: string | null;
          inv_first_name: string | null;
        }>(
          `SELECT o.id, o.order_code,
                  COALESCE(p.name, 'Produk Khusus') as product_name,
                  COALESCE(p.price, (o.invoice_data->>'amount')::int, (o.invoice_data->>'payable_amount')::int, 0) as price,
                  o.fulfillment_status,
                  o.created_at,
                  u.telegram_id,
                  u.username,
                  u.first_name,
                  u.membership_tier,
                  (o.invoice_data->>'customer_username') as inv_username,
                  (o.invoice_data->>'customer_first_name') as inv_first_name
           FROM orders o
           LEFT JOIN products p ON o.product_id = p.id
           LEFT JOIN users u ON o.user_id = u.id
           WHERE o.payment_status = 'paid'
             AND o.created_at >= NOW() - INTERVAL '2 hours'
           ORDER BY o.created_at DESC
           LIMIT 30`
        );

        const pendingFulfillRes = await query<{ count: string }>(
          `SELECT COUNT(id) as count FROM orders
           WHERE payment_status = 'paid' AND fulfillment_status IN ('pending', 'processing')`
        );

        const formatted = newPaidOrdersRes.rows.map((row) => {
          const finalUsername = row.username || row.inv_username || null;
          const finalFirstName = row.first_name || row.inv_first_name || null;
          const finalPrice = Number(row.price || 0);

          return {
            id: row.id,
            orderCode: row.order_code,
            productName: row.product_name,
            price: finalPrice,
            formattedPrice: `Rp ${finalPrice.toLocaleString('id-ID')}`,
            fulfillmentStatus: row.fulfillment_status,
            createdAt: row.created_at,
            customer: {
              telegramId: row.telegram_id || 'Pembeli',
              username: finalUsername,
              firstName: finalFirstName,
              isVip: row.membership_tier === 'vip',
            },
          };
        });

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
