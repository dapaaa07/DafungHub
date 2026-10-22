import { NextResponse } from 'next/server';
import { verifyAdminRequest, unauthorizedResponse } from '@/lib/admin-auth';
import { getBroadcastChannel, sendManualBroadcast } from '@/lib/broadcast';

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
    return NextResponse.json(
      { success: true, channel, timestamp: new Date().toISOString() },
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
    const text = (body.text || body.message || '').trim();

    if (!text) {
      return NextResponse.json(
        { success: false, error: 'Teks pesan siaran tidak boleh kosong.' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const broadcastRes = await sendManualBroadcast(text);

    if (!broadcastRes.success) {
      return NextResponse.json(
        {
          success: false,
          error: broadcastRes.error || 'Gagal mengirim siaran ke channel.',
        },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: `Siaran berhasil dipublikasikan ke channel ${broadcastRes.channel}.`,
        messageId: broadcastRes.messageId,
        channel: broadcastRes.channel,
        timestamp: new Date().toISOString(),
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message || 'Gagal memproses siaran.' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
