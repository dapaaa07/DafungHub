import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyAdminRequest, unauthorizedResponse } from '@/lib/admin-auth';
import { getBroadcastChannel, setBroadcastChannel } from '@/lib/broadcast';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: Request) {
  if (!verifyAdminRequest(req)) {
    return unauthorizedResponse();
  }

  try {
    const channel = await getBroadcastChannel();

    const maintRes = await query<{ value: string }>(
      `SELECT value FROM bot_settings WHERE key = 'bot_maintenance_mode' LIMIT 1`
    ).catch(() => ({ rows: [] as Array<{ value: string }> }));

    const isMaintenance = maintRes.rows[0]?.value === 'true';

    return NextResponse.json(
      {
        success: true,
        settings: {
          broadcastChannel: channel,
          isMaintenance,
        },
        timestamp: new Date().toISOString(),
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function POST(req: Request) {
  if (!verifyAdminRequest(req)) {
    return unauthorizedResponse();
  }

  try {
    const body = await req.json();

    if (body.broadcastChannel) {
      await setBroadcastChannel(String(body.broadcastChannel));
    }

    if (body.isMaintenance !== undefined) {
      const val = body.isMaintenance ? 'true' : 'false';
      await query(
        `INSERT INTO bot_settings (key, value, updated_at)
         VALUES ('bot_maintenance_mode', $1, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
        [val]
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Pengaturan bot berhasil diperbarui.',
        timestamp: new Date().toISOString(),
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
