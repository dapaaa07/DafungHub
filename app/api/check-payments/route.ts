import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { checkAndProcessUnpaidShopeeOrders } from '@/lib/fulfillment';
import { bot, initBot } from '@/bot/handler';
import { verifyAdminRequest } from '@/lib/admin-auth';

let isCheckRunning = false;
let lastCheckAt = 0;
const MIN_CHECK_INTERVAL_MS = 10_000;

function isCronAuthorized(req: NextRequest): boolean {
  if (verifyAdminRequest(req)) return true;

  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;

  const authHeader = req.headers.get('authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const headerSecret = req.headers.get('x-cron-secret')?.trim() || '';
  const candidate = bearer || headerSecret;
  if (!candidate) return false;

  const a = crypto.createHash('sha256').update(candidate).digest();
  const b = crypto.createHash('sha256').update(cronSecret).digest();
  return crypto.timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }

  try {

    const now = Date.now();
    if (isCheckRunning || now - lastCheckAt < MIN_CHECK_INTERVAL_MS) {
      return NextResponse.json(
        {
          success: true,
          service: 'ShopeePay Payment Auto-Checker',
          processed: 0,
          throttled: true,
          timestamp: new Date().toISOString(),
        },
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    }

    isCheckRunning = true;
    lastCheckAt = now;
    try {
      await initBot({ mode: 'webhook' });
      const count = await checkAndProcessUnpaidShopeeOrders(bot);

      return NextResponse.json(
        {
          success: true,
          service: 'ShopeePay Payment Auto-Checker',
          processed: count,
          timestamp: new Date().toISOString(),
        },
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    } finally {
      isCheckRunning = false;
    }
  } catch (error) {
    console.error('[Check Payments API Error]:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
