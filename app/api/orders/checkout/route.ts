import { NextRequest, NextResponse } from 'next/server';
import { getCustomerFromRequest } from '@/lib/customer-auth';
import { createWebOrder } from '@/lib/web-order';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      productId,
      paymentMethod = 'qris',
      voucherCode,
      targetEmail,
      targetPhone,
      targetName,
    } = body;

    if (!productId) {
      return NextResponse.json(
        { success: false, error: 'ID Produk harus disertakan.' },
        { status: 400 }
      );
    }

    const customer = await getCustomerFromRequest(req);
    if (!customer) {
      return NextResponse.json(
        {
          success: false,
          error: 'Silakan masuk ke akun Anda terlebih dahulu untuk melakukan pemesanan.',
          requiresAuth: true,
        },
        { status: 401 }
      );
    }

    const result = await createWebOrder({
      userId: customer.id,
      productId: String(productId),
      paymentMethod: paymentMethod === 'balance' ? 'balance' : 'qris',
      voucherCode: voucherCode ? String(voucherCode).trim() : undefined,
      customerName: targetName || customer.name || undefined,
      customerEmail: targetEmail || customer.email || undefined,
      customerPhone: targetPhone || customer.phone || undefined,
    });

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('[/api/orders/checkout] Error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message || 'Terjadi kesalahan sistem saat memproses pesanan.' },
      { status: 500 }
    );
  }
}
