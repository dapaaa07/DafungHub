import http from 'http';
import { bot, initBot } from '../bot/handler';

console.log('🤖 Starting DaFung Hub Telegram Bot...');

// Lightweight HTTP server for Cloud Web Service Healthcheck (Render, Koyeb, PaaS)
const port = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      status: 'ok',
      service: 'DaFung Hub Telegram Bot',
      timestamp: new Date().toISOString(),
    })
  );
});

server.listen(port, () => {
  console.log(`🌐 Health check HTTP server active on port ${port}`);
});

async function start(): Promise<void> {
  try {
    await bot.api.deleteWebhook({ drop_pending_updates: false });
    console.log('✅ Webhook cleared.');
  } catch (err) {
    console.warn('⚠️ Notice: deleteWebhook check skipped or timed out:', (err as Error).message);
  }

  await initBot({ mode: 'polling' });
  console.log('🚀 Bot is LIVE and listening for messages!');
  console.log('📱 Silakan buka Telegram dan chat dengan @dafung_hub_bot');
}

start().catch((err) => {
  console.error('❌ Failed to start bot:', err);
});
