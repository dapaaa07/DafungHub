import { NextRequest, NextResponse } from 'next/server';
import {
  loginCustomer,
  signCustomerToken,
  formatCustomerProfile,
  CUSTOMER_COOKIE_NAME,
  TOKEN_EXPIRY_DAYS,
} from '@/lib/customer-auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { identifier, password } = body;

    if (!identifier || !password) {
      return NextResponse.json(
        { success: false, error: 'Email/No. HP dan password wajib diisi.' },
        { status: 400 }
      );
    }

    const user = await loginCustomer({ identifier, password });
    const token = signCustomerToken(user);
    const profile = formatCustomerProfile(user);

    const response = NextResponse.json({
      success: true,
      message: 'Login berhasil! Selamat datang kembali.',
      user: profile,
    });

    response.cookies.set({
      name: CUSTOMER_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: TOKEN_EXPIRY_DAYS * 24 * 3600,
    });

    return response;
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Login gagal. Silakan periksa kembali data Anda.' },
      { status: 400 }
    );
  }
}
