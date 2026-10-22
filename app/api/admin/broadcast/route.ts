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
    const media = body.media as { name?: string; content?: string; isPhoto?: boolean } | undefined;

    if (!text && (!media || !media.content)) {
      return NextResponse.json(
        { success: false, error: 'Pesan siaran atau lampiran media wajib diisi.' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const channel = await getBroadcastChannel();
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (media?.content && token) {
      let fileBuffer: Buffer;
      if (media.content.startsWith('data:') && media.content.includes('base64,')) {
        const base64Data = media.content.split('base64,')[1];
        fileBuffer = Buffer.from(base64Data, 'base64');
      } else {
        fileBuffer = Buffer.from(media.content, 'base64');
        if (fileBuffer.length === 0) {
          fileBuffer = Buffer.from(media.content, 'utf-8');
        }
      }

      const isPhoto = Boolean(
        media.isPhoto ||
        /\.(jpe?g|png|webp|gif)$/i.test(media.name || '')
      );

      const formData = new FormData();
      formData.append('chat_id', channel);
      if (text) {
        formData.append('caption', text);
        formData.append('parse_mode', 'HTML');
      }

      const mimeType = isPhoto ? 'image/jpeg' : 'application/octet-stream';
      const blob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType });
      const fileName = media.name || (isPhoto ? 'broadcast.jpg' : 'broadcast_doc.pdf');

      if (isPhoto) {
        formData.append('photo', blob, fileName);
      } else {
        formData.append('document', blob, fileName);
      }

      const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'dafung_hub_bot';
      formData.append(
        'reply_markup',
        JSON.stringify({
          inline_keyboard: [
            [{ text: '🛍️ Order via Bot', url: `https://t.me/${botUsername}` }],
          ],
        })
      );

      const endpoint = isPhoto ? 'sendPhoto' : 'sendDocument';
      const tgRes = await fetch(`https://api.telegram.org/bot${token}/${endpoint}`, {
        method: 'POST',
        body: formData,
      });
      const tgJson = await tgRes.json().catch(() => null);

      if (tgJson?.ok) {
        return NextResponse.json(
          {
            success: true,
            message: `Siaran media berhasil dipublikasikan ke channel ${channel}.`,
            messageId: tgJson.result?.message_id,
            channel,
            timestamp: new Date().toISOString(),
          },
          { status: 200, headers: CORS_HEADERS }
        );
      }
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
