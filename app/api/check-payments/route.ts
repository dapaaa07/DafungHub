import { NextResponse } from 'next/server';
import { checkAndProcessUnpaidShopeeOrders } from '@/lib/fulfillment';
import { bot, initBot } from '@/bot/handler';


export async function GET() {
  try {
    await initBot({ mode: 'webhook' });
    const count = await checkAndProcessUnpaidShopeeOrders(bot);

    return NextResponse.json({
      success: true,
      service: 'ShopeePay Payment Auto-Checker',
      processed: count,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Check Payments API Error]:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
