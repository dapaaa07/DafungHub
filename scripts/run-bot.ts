import { bot, initBot } from '../bot/handler';

console.log('🤖 Starting DaFung Hub Telegram Bot...');

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
