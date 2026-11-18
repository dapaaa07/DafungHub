import { bot } from '../bot/handler';

const url = process.argv[2];
if (!url) {
  console.error('Usage: npx tsx scripts/set-webhook.ts <BASE_URL>');
  console.error('Example: npx tsx scripts/set-webhook.ts https://dafung-hub.vercel.app');
  process.exit(1);
}

const webhookUrl = `${url.replace(/\/$/, '')}/api/webhooks/telegram`;

async function main() {
  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  console.log(`Setting Telegram webhook to: ${webhookUrl}`);
  await bot.api.setWebhook({
    url: webhookUrl,
    ...(secretToken ? { secret_token: secretToken } : {}),
  });
  const info = await bot.api.getWebhookInfo();
  console.log(`Webhook successfully set! (secret_token: ${secretToken ? 'enabled' : 'NOT SET'})`);
  console.log('Webhook Info:', info);
}

main().catch((err) => {
  console.error('❌ Failed to set webhook:', err);
  process.exit(1);
});
