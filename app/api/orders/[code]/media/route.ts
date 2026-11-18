import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getDeliveredTelegramMedia } from '@/lib/telegram-media';
import { getCustomerFromRequest } from '@/lib/customer-auth';
import { verifyAdminRequest } from '@/lib/admin-auth';

const SAFE_INLINE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
]);

function sanitizeHeaderFileName(name: string): string {
  return name.replace(/["\\\r\n]/g, '_').trim() || 'attachment';
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const isAdmin = verifyAdminRequest(req);
    const customer = isAdmin ? null : await getCustomerFromRequest(req);

    if (!isAdmin && !customer) {
      return new NextResponse('Autentikasi diperlukan untuk mengakses lampiran pesanan', {
        status: 401,
        headers: { 'Cache-Control': 'private, no-store, max-age=0' },
      });
    }

    const { code } = await params;
    const orderCode = code?.trim();

    if (!orderCode) {
      return new NextResponse('Kode order tidak valid', { status: 400 });
    }

    const orderRes = await query<{
      id: string;
      user_id: string;
      order_code: string;
      fulfillment_status: string;
      invoice_data: unknown;
    }>(
      `SELECT id, user_id, order_code, fulfillment_status, invoice_data
       FROM orders
       WHERE order_code = $1 LIMIT 1`,
      [orderCode]
    );

    if (orderRes.rows.length === 0) {
      return new NextResponse('Pesanan tidak ditemukan', { status: 404 });
    }

    const order = orderRes.rows[0];

    if (!isAdmin && customer && order.user_id !== customer.id) {
      return new NextResponse('Anda tidak memiliki izin mengakses lampiran pesanan ini', {
        status: 403,
        headers: { 'Cache-Control': 'private, no-store, max-age=0' },
      });
    }

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
    const normalizedMime = (mediaResult.mimeType || 'application/octet-stream').toLowerCase().split(';')[0].trim();
    // Never render SVG/HTML/active formats inline to prevent same-origin XSS
    const allowInline = !isDownload && SAFE_INLINE_MIME_TYPES.has(normalizedMime);
    const dispositionType = allowInline ? 'inline' : 'attachment';
    const cleanFileName = sanitizeHeaderFileName(mediaResult.fileName);
    const encodedFileName = encodeURIComponent(cleanFileName);

    return new NextResponse(new Uint8Array(mediaResult.buffer), {
      status: 200,
      headers: {
        'Content-Type': mediaResult.mimeType,
        'Content-Length': mediaResult.fileSize.toString(),
        'Content-Disposition': `${dispositionType}; filename="${cleanFileName}"; filename*=UTF-8''${encodedFileName}`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    console.error('[/api/orders/[code]/media] Error:', error);
    return new NextResponse('Terjadi kesalahan internal server', { status: 500 });
  }
}
