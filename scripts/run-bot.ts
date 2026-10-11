import http from 'http';
import { bot, initBot, handleWebhookUpdate } from '../bot/handler';
import { processOrderPayment } from '../lib/fulfillment';

console.log('🤖 Starting DaFung Hub Telegram Bot Service...');

// HTTP Server for Webhook & Healthcheck
const port = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
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

  // GET Request (Health check)
  res.writeHead(200, { 'Content-Type': 'application/json' });
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
