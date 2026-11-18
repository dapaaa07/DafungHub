import { NextResponse } from 'next/server';
import { verifyAdminRequest, unauthorizedResponse } from '@/lib/admin-auth';
import { getServerHealth } from '@/lib/server-health';

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key',
  'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: HEADERS });
}

export async function GET(req: Request) {
  if (!verifyAdminRequest(req)) {
    return unauthorizedResponse();
  }

  try {
    const health = await getServerHealth();
    return NextResponse.json(
      {
        success: true,
        health,
      },
      { status: 200, headers: HEADERS }
    );
  } catch (error) {
    console.error('[Admin Health API Error]:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Gagal mengambil metrik resource server.',
      },
      { status: 500, headers: HEADERS }
    );
  }
}
