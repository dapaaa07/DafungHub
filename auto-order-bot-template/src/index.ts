import http from 'http';
import { Bot } from 'node-telegram-bot-api';
import { config } from '../config/bot.config';
import { registerBotHandlers, ExtendedBot } from './bot/handler';
import { processOrderPayment } from './core/fulfillment';
import { getBotStatus } from './core/settings';
import { testConnection } from './core/db';
import { verifySakurupiahSignature } from './gateways/sakurupiah';

// Auto-load .env
if (!process.env.TELEGRAM_BOT_TOKEN) {
  try {
    process.loadEnvFile?.();
  } catch {}
}

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('❌ FATAL: TELEGRAM_BOT_TOKEN is not defined in .env.');
  process.exit(1);
}

const mode = process.env.BOT_CONNECTION_MODE === 'webhook' ? 'webhook' : 'polling';
console.log(`🤖 Initializing ${config.store.name} Bot in [${mode.toUpperCase()}] mode...`);

export const bot = new Bot(token, {
  polling: mode === 'polling',
}) as ExtendedBot;

registerBotHandlers(bot);

// HTTP Server for Webhooks & Healthchecks
const port = process.env.PORT || 3000;
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-callback-signature',
    });
    res.end();
    return;
  }

  // Healthcheck & Store Status Route
  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    const isDbConnected = await testConnection();
    const botStatus = await getBotStatus();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        store: config.store.name,
        bot_status: botStatus,
        database: isDbConnected ? 'connected' : 'disconnected',
        mode,
      })
    );
    return;
  }

  // GET /api/bot-status
  if (req.method === 'GET' && req.url?.includes('bot-status')) {
    const status = await getBotStatus();
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify({ status }));
    return;
  }

  // POST Webhooks
  if (req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });

    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');

        // 1. Sakurupiah Payment Webhook
        if (req.url?.includes('sakurupiah')) {
          const signature = (req.headers['x-callback-signature'] as string) || '';
          if (signature && !verifySakurupiahSignature(body, signature)) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Invalid HMAC signature' }));
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
          res.end(JSON.stringify({ success: true, order_id: orderId, paid: isPaid }));
          return;
        }

        // 2. Midtrans Payment Webhook
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

        // 3. Telegram Webhook (if mode === 'webhook')
        if (mode === 'webhook' && typeof (bot as any).processUpdate === 'function') {
          await (bot as any).processUpdate(data);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Endpoint not found' }));
      } catch (err) {
        console.error('[Webhook Processing Error]:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (err as Error).message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(port, () => {
  console.log(`🌐 Bot Webhook & Health Server listening on port ${port}`);
  console.log(`✨ Bot is actively running and ready to accept customers!`);
});

// Graceful Shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Gracefully shutting down bot service...');
  server.close(() => {
    process.exit(0);
  });
});
