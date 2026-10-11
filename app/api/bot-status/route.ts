import { NextResponse } from 'next/server';
import { getBotStatus } from '@/lib/settings';

export async function GET() {
  try {
    const status = await getBotStatus();
    return NextResponse.json(
      {
        status,
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  } catch (error) {
    console.error('[/api/bot-status] Error retrieving bot status:', error);
    return NextResponse.json(
      {
        status: 'online',
        timestamp: new Date().toISOString(),
        fallback: true,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  }
}
