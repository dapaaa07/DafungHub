import { NextResponse } from 'next/server';
import { getBotStatus } from '@/lib/settings';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Cache-Control, Pragma',
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

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
          ...CORS_HEADERS,
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
          ...CORS_HEADERS,
        },
      }
    );
  }
}
