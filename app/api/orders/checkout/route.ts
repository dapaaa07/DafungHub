import { NextRequest, NextResponse } from 'next/server';
import { getCustomerFromRequest, ensureCustomerUser, signCustomerToken, CUSTOMER_COOKIE_NAME, TOKEN_EXPIRY_DAYS } from '@/lib/customer-auth';
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

    let customer = await getCustomerFromRequest(req);
    let shouldSetCookie = false;
    let newSessionToken = '';

    if (!customer) {
      if (!targetEmail && !targetPhone) {
        return NextResponse.json(
          {
            success: false,
            error: 'Silakan masuk ke akun Anda atau masukkan email / nomor WhatsApp untuk melanjutkan.',
          },
          { status: 401 }
        );
      }

      customer = await ensureCustomerUser({
        email: targetEmail,
        phone: targetPhone,
        name: targetName,
      });

      newSessionToken = signCustomerToken(customer);
      shouldSetCookie = true;
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

    const response = NextResponse.json(result, { status: 200 });

    if (shouldSetCookie && newSessionToken) {
      response.cookies.set(CUSTOMER_COOKIE_NAME, newSessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: TOKEN_EXPIRY_DAYS * 24 * 3600,
      });
    }

    return response;
  } catch (error) {
    console.error('[/api/orders/checkout] Error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message || 'Terjadi kesalahan sistem saat memproses pesanan.' },
      { status: 500 }
    );
  }
}
