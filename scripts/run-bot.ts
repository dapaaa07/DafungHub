import http from 'http';
import { bot, initBot, handleWebhookUpdate } from '../bot/handler';
import { processOrderPayment, checkAndProcessUnpaidShopeeOrders } from '../lib/fulfillment';
import { processShopeePayWebhookPayload } from '../lib/shopeepay';
import { handleAdminHttpRequest } from '../lib/admin-http-handler';

console.log('🤖 Starting DaFung Hub Telegram Bot Service...');

// HTTP Server for Webhook & Healthcheck
const port = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Cache-Control, Pragma, Authorization, x-admin-key, x-callback-signature, x-callback-event, x-signature',
    });
    res.end();
    return;
  }

  // Route admin requests (supports /api/admin/* and /admin/*)
  if (req.url?.includes('admin')) {
    if (req.method === 'GET') {
      handleAdminHttpRequest(req, res, '').catch((err) => {
        console.error('[Admin HTTP Handler Error]:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: (err as Error).message }));
      });
      return;
    }

    let adminBody = '';
    req.on('data', (chunk) => {
      adminBody += chunk;
    });
    req.on('end', () => {
      handleAdminHttpRequest(req, res, adminBody).catch((err) => {
        console.error('[Admin HTTP Handler Error]:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: (err as Error).message }));
      });
    });
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', async () => {
      try {
        // Check if ShopeePay webhook first (handles JSON validation, X-Signature & deduplication)
        if (req.url?.includes('shopeepay')) {
          const signature = (req.headers['x-signature'] as string) || undefined;
          const { httpStatus, body: respBody } = await processShopeePayWebhookPayload(
            body,
            bot,
            signature
          );
          res.writeHead(httpStatus, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(respBody));
          return;
        }

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

  // GET /api/webhooks/shopeepay health/status route
  if (req.method === 'GET' && req.url?.includes('shopeepay')) {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(
      JSON.stringify({
        status: 'active',
        endpoint: '/api/webhooks/shopeepay',
        service: 'DaFung Hub ShopeePay Webhook Handler',
      })
    );
    return;
  }

  // GET /api/check-payments route (on-demand sweep for unpaid ShopeePay orders)
  if (req.method === 'GET' && req.url?.includes('check-payments')) {
    (async () => {
      try {
        await initBot({ mode: 'webhook' });
        const count = await checkAndProcessUnpaidShopeeOrders(bot);
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(
          JSON.stringify({
            success: true,
            service: 'ShopeePay Payment Auto-Checker',
            processed: count,
            timestamp: new Date().toISOString(),
          })
        );
      } catch (err) {
        console.error('[HTTP Server] /api/check-payments error:', err);
        res.writeHead(500, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify({ success: false, error: (err as Error).message }));
      }
    })();
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
      requested_url: req.url,
      timestamp: new Date().toISOString(),
    })
  );
});

server.listen(port, () => {
  console.log(`🌐 Webhook & Health check HTTP server active on port ${port}`);
});

// Periodic background poller for unpaid ShopeePay orders & session keep-alive heartbeat
setInterval(async () => {
  try {
    await checkAndProcessUnpaidShopeeOrders(bot);
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
