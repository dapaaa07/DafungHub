import http from 'http';
import { bot, initBot, handleWebhookUpdate } from '../bot/handler';
import { processOrderPayment } from '../lib/fulfillment';
import { query } from '../lib/db';

console.log('🤖 Starting DaFung Hub Telegram Bot Service...');

// HTTP Server for Webhook & Healthcheck
const port = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Cache-Control, Pragma, x-callback-signature, x-callback-event',
    });
    res.end();
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');

        // Check if Sakurupiah webhook
        if (req.url?.includes('sakurupiah')) {
          const signature = (req.headers['x-callback-signature'] as string) || '';
          const { verifySakurupiahCallbackSignature } = await import('../lib/sakurupiah');
          if (signature && !verifySakurupiahCallbackSignature(body, signature)) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Invalid signature' }));
            return;
          }

          const orderId = data.merchant_ref;
          const status = data.status;
          const statusCode = Number(data.status_kode);
          const isPaid = status === 'berhasil' && (statusCode === 1 || isNaN(statusCode));

          if (isPaid && orderId) {
            console.log(`[Sakurupiah Webhook] Payment confirmed for order: ${orderId}`);
            await processOrderPayment(orderId, bot);
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Payment status processed', order_id: orderId }));
          return;
        }

        // Check if Midtrans webhook
        if (req.url?.includes('midtrans')) {
          const orderId = data.order_id;
          const status = data.transaction_status;
          const fraud = data.fraud_status;
          const isPaid = status === 'settlement' || (status === 'capture' && fraud === 'accept');
          if (isPaid && orderId) {
            console.log(`[Midtrans Webhook] Payment confirmed for order: ${orderId}`);
            await processOrderPayment(orderId, bot);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', order_id: orderId, paid: isPaid }));
          return;
        }

        // Check if ShopeePay webhook
        if (req.url?.includes('shopeepay')) {
          let orderId = data.order_id || data.order_code || data.merchant_ref || data.token;
          const status = String(data.status || data.payment_status || 'paid').toLowerCase();

          let detectedAmount = Number((data as Record<string, unknown>).amount || (data as Record<string, unknown>).nominal || 0);

          if (!orderId) {
            if (!detectedAmount) {
              const fullText = `${(data as Record<string, unknown>).notification || ''} ${(data as Record<string, unknown>).text || ''} ${(data as Record<string, unknown>).message || ''} ${(data as Record<string, unknown>).body || ''} ${(data as Record<string, unknown>).not_body || ''} ${body}`;
              const match = fullText.match(/(?:rp\.?|idr)\s*([0-9.,]+)/i) || fullText.match(/([0-9]{3,7})/);
              if (match) {
                const clean = match[1].replace(/[^0-9]/g, '');
                detectedAmount = parseInt(clean, 10);
              }
            }

            if (detectedAmount > 0) {
              const matchOrd = await query<{ order_code: string }>(
                `SELECT order_code FROM orders
                 WHERE payment_status = 'unpaid'
                   AND (
                     (invoice_data->>'payable_amount')::numeric = $1
                     OR (invoice_data->>'amount')::numeric = $1
                   )
                   AND created_at >= NOW() - INTERVAL '24 hours'
                 ORDER BY created_at DESC LIMIT 1`,
                [detectedAmount]
              );
              if (matchOrd.rows.length > 0) {
                orderId = matchOrd.rows[0].order_code;
              }
            }
          }

          const isPaid = status === 'success' || status === 'paid' || status === 'settlement' || status === 'completed';

          if (isPaid && orderId) {
            console.log(`[ShopeePay Webhook] Payment confirmed for order: ${orderId}`);
            await processOrderPayment(orderId, bot);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              message: 'ShopeePay payment successfully confirmed',
              order_id: orderId,
              detected_amount: detectedAmount || null,
              paid: true,
            }));
            return;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            message: orderId
              ? `Status received: ${status || 'unknown'}`
              : (detectedAmount > 0
                  ? `Amount detected (Rp ${detectedAmount.toLocaleString('id-ID')}) but no unpaid order found within last 24h`
                  : `Notification received, no amount or order found`),
            order_id: orderId || null,
            detected_amount: detectedAmount || null,
            paid: false,
          }));
          return;
        }

        // Default: Telegram Webhook update
        await initBot({ mode: 'webhook' });
        await handleWebhookUpdate(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        console.error('[Webhook Error]:', err);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: (err as Error).message }));
      }
    });
    return;
  }

  // GET /api/bot-status route
  if (req.url?.includes('bot-status')) {
    (async () => {
      try {
        const { getBotStatus } = await import('../lib/settings');
        const status = await getBotStatus();
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Cache-Control, Pragma, Authorization',
        });
        res.end(
          JSON.stringify({
            status,
            timestamp: new Date().toISOString(),
          })
        );
      } catch (err) {
        console.error('[HTTP Server] bot-status error:', err);
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify({ status: 'online', fallback: true }));
      }
    })();
    return;
  }

  // GET /api/products route
  if (req.method === 'GET' && req.url?.includes('products')) {
    (async () => {
      try {
        const { getAllEnrichedProducts } = await import('../lib/supplier');
        const products = await getAllEnrichedProducts();
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Cache-Control, Pragma, Authorization',
        });
        res.end(
          JSON.stringify({
            success: true,
            timestamp: new Date().toISOString(),
            count: products.length,
            products,
          })
        );
      } catch (err) {
        console.error('[HTTP Server] /api/products error:', err);
        res.writeHead(500, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify({ success: false, error: (err as Error).message }));
      }
    })();
    return;
  }

  // Default GET Request (Health check)
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(
    JSON.stringify({
      status: 'ok',
      service: 'DaFung Hub Telegram Bot & Webhook Service',
      mode: process.env.TELEGRAM_BOT_MODE || 'webhook',
      timestamp: new Date().toISOString(),
    })
  );
});

server.listen(port, () => {
  console.log(`🌐 Webhook & Health check HTTP server active on port ${port}`);
});

// Periodic background poller for unpaid ShopeePay orders (checks orders created in the last 60 minutes)
setInterval(async () => {
  try {
    const { query } = await import('../lib/db');
    const { checkShopeePayPayment } = await import('../lib/shopeepay');

    const unpaidOrders = await query<any>(
      `SELECT o.*, p.price as product_price
       FROM orders o
       LEFT JOIN products p ON o.product_id = p.id
       WHERE o.payment_status = 'unpaid'
         AND o.created_at >= NOW() - INTERVAL '60 minutes'
       ORDER BY o.created_at DESC LIMIT 10`
    );

    for (const ord of unpaidOrders.rows) {
      const invData =
        typeof ord.invoice_data === 'string'
          ? JSON.parse(ord.invoice_data || '{}')
          : (ord.invoice_data || {});

      const actualAmount =
        Number(invData.payable_amount) ||
        Number(invData.amount) ||
        Number(ord.product_price) ||
        0;

      const gateway = (invData.gateway || process.env.PAYMENT_GATEWAY || 'shopeepay').toLowerCase();
      if (gateway === 'shopeepay' && actualAmount > 0) {
        const checkResult = await checkShopeePayPayment({
          token: invData.token,
          orderCode: ord.order_code,
          amount: actualAmount,
          orderCreatedAt: ord.created_at,
        });

        if (checkResult.paid) {
          console.log(`[ShopeePay Poller] Auto-detected payment for order: ${ord.order_code}`);
          await processOrderPayment(ord.order_code, bot, checkResult.transaction as any);
        }
      }
    }
  } catch {
    // Non-fatal, suppress periodic polling errors
  }
}, 20000);

async function start(): Promise<void> {
  const mode = process.env.TELEGRAM_BOT_MODE || 'webhook';
  if (mode === 'polling') {
    try {
      await bot.api.deleteWebhook({ drop_pending_updates: false });
      console.log('✅ Webhook cleared.');
    } catch (err) {
      console.warn('⚠️ deleteWebhook skipped:', (err as Error).message);
    }
    await initBot({ mode: 'polling' });
    console.log('🚀 Bot is LIVE in polling mode!');
  } else {
    await initBot({ mode: 'webhook' });
    console.log('🚀 Bot is READY in webhook mode!');
  }
}

start().catch((err) => {
  console.error('❌ Failed to start bot:', err);
});
