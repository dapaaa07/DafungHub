/**
 * Helper tool to set or delete Telegram Bot Webhook
 * Usage:
 *   npx tsx scripts/set-webhook.ts [optional_webhook_url]
 *   npx tsx scripts/set-webhook.ts delete
 */

if (!process.env.TELEGRAM_BOT_TOKEN) {
  try {
    process.loadEnvFile?.();
  } catch {}
}

const token = process.env.TELEGRAM_BOT_TOKEN;
const defaultUrl = process.env.WEBHOOK_URL ? `${process.env.WEBHOOK_URL.replace(/\/+$/, '')}/api/webhooks/telegram` : '';
const targetArg = process.argv[2] || defaultUrl;

if (!token) {
  console.error('❌ TELEGRAM_BOT_TOKEN is missing in environment or .env.');
  process.exit(1);
}

async function run() {
  if (targetArg === 'delete') {
    console.log('🔄 Deleting webhook to revert bot back to polling mode...');
    const res = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`);
    const json = await res.json();
    console.log('Result:', json);
    return;
  }

  if (!targetArg) {
    console.error('❌ Please provide a valid HTTPS Webhook URL or set WEBHOOK_URL in .env.');
    console.log('Usage: npx tsx scripts/set-webhook.ts https://yourdomain.com/api/webhooks/telegram');
    process.exit(1);
  }

  console.log(`🚀 Setting Telegram Webhook to: ${targetArg}`);
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: targetArg }),
  });
  const json = await res.json();
  console.log('Result:', json);

  const infoRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  const infoJson = await infoRes.json();
  console.log('\n📊 Current Webhook Info:', infoJson);
}

run();
