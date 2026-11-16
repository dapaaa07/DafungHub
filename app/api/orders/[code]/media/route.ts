import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getDeliveredTelegramMedia } from '@/lib/telegram-media';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const orderCode = code?.trim();

    if (!orderCode) {
      return new NextResponse('Kode order tidak valid', { status: 400 });
    }

    const orderRes = await query<{
      id: string;
      order_code: string;
      fulfillment_status: string;
      invoice_data: unknown;
    }>(
      `SELECT id, order_code, fulfillment_status, invoice_data
       FROM orders
       WHERE order_code = $1 LIMIT 1`,
      [orderCode]
    );

    if (orderRes.rows.length === 0) {
      return new NextResponse('Pesanan tidak ditemukan', { status: 404 });
    }

    const order = orderRes.rows[0];
    if (order.fulfillment_status !== 'delivered') {
      return new NextResponse('Pesanan belum berstatus delivered', { status: 403 });
    }

    const invData =
      typeof order.invoice_data === 'string'
        ? JSON.parse(order.invoice_data || '{}')
        : ((order.invoice_data || {}) as Record<string, unknown>);

    const deliveredMedia = invData.delivered_media as
      | {
          type?: string;
          fileId?: string;
          fileName?: string;
          mimeType?: string;
        }
      | undefined;

    if (!deliveredMedia?.fileId) {
      return new NextResponse('Tidak ada media kredensial terlampir untuk pesanan ini', {
        status: 404,
      });
    }

    const mediaResult = await getDeliveredTelegramMedia(
      deliveredMedia.fileId,
      deliveredMedia.fileName,
      deliveredMedia.mimeType
    );

    if (!mediaResult) {
      return new NextResponse('Gagal mengambil file media dari server Telegram', { status: 502 });
    }

    const url = new URL(req.url);
    const isDownload = url.searchParams.get('download') === '1';
    const dispositionType = isDownload ? 'attachment' : 'inline';
    const safeFileName = encodeURIComponent(mediaResult.fileName);

    return new NextResponse(new Uint8Array(mediaResult.buffer), {
      status: 200,
      headers: {
        'Content-Type': mediaResult.mimeType,
        'Content-Length': mediaResult.fileSize.toString(),
        'Content-Disposition': `${dispositionType}; filename="${mediaResult.fileName}"; filename*=UTF-8''${safeFileName}`,
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    });
  } catch (error) {
    console.error('[/api/orders/[code]/media] Error:', error);
    return new NextResponse('Terjadi kesalahan internal server', { status: 500 });
  }
}
