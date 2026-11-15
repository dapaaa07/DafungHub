import { NextResponse } from 'next/server';
import { CUSTOMER_COOKIE_NAME } from '@/lib/customer-auth';

export async function POST() {
  const response = NextResponse.json({
    success: true,
    message: 'Anda berhasil keluar dari akun.',
  });

  response.cookies.delete(CUSTOMER_COOKIE_NAME);
  return response;
}
