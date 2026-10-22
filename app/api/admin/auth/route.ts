import { NextResponse } from 'next/server';
import { verifyAdminKey, ADMIN_SECRET_KEY } from '@/lib/admin-auth';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const key = body.key || body.pin || req.headers.get('x-admin-key');

    if (!verifyAdminKey(key)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Kunci otentikasi admin atau PIN tidak valid.',
        },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Otentikasi admin berhasil.',
        token: ADMIN_SECRET_KEY,
        admin: {
          role: 'admin',
          username: 'Dafung Owner',
          channel: '@DafungHub',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message || 'Terjadi kesalahan sistem.',
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
