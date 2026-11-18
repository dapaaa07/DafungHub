import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { handleWebhookUpdate, initBot } from '@/bot/handler';

function verifyTelegramSecret(headerToken: string | null, expectedSecret: string): boolean {
  if (!headerToken || !expectedSecret) return false;
  try {
    const a = crypto.createHash('sha256').update(headerToken).digest();
    const b = crypto.createHash('sha256').update(expectedSecret).digest();
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
    if (configuredSecret) {
      const incomingSecret = req.headers.get('x-telegram-bot-api-secret-token');
      if (!verifyTelegramSecret(incomingSecret, configuredSecret)) {
        console.error('[Telegram Webhook] Rejected request with invalid or missing secret token');
        return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
      }
    } else {
      console.warn('[Telegram Webhook] TELEGRAM_WEBHOOK_SECRET is not configured. Set it in .env and re-run set-webhook.');
    }

    const update = await req.json();
    await initBot({ mode: 'webhook' });
    await handleWebhookUpdate(update);

    // Auto-check recent unpaid ShopeePay orders in background
    import('@/lib/fulfillment')
      .then(({ checkAndProcessUnpaidShopeeOrders }) => {
        import('@/bot/handler').then(({ bot }) => {
          checkAndProcessUnpaidShopeeOrders(bot).catch(() => {});
        });
      })
      .catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Telegram webhook error:', err);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'DaFung Hub Telegram Bot Webhook Endpoint',
    timestamp: new Date().toISOString(),
  });
}
