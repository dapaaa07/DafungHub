import { NextRequest, NextResponse } from 'next/server';
import { handleWebhookUpdate, initBot } from '@/bot/handler';

export async function POST(req: NextRequest) {
  try {
    const update = await req.json();
    await initBot({ mode: 'webhook' });
    await handleWebhookUpdate(update);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Telegram webhook error:', err);
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
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
