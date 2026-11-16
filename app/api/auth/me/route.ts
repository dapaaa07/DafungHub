import { NextRequest, NextResponse } from 'next/server';
import { getCustomerFromRequest, formatCustomerProfile } from '@/lib/customer-auth';

export async function GET(req: NextRequest) {
  try {
    const user = await getCustomerFromRequest(req);
    if (!user) {
      return NextResponse.json({
        success: false,
        authenticated: false,
        customer: null,
        user: null,
      });
    }

    const profile = formatCustomerProfile(user);
    return NextResponse.json({
      success: true,
      authenticated: true,
      customer: profile,
      user: profile,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        authenticated: false,
        customer: null,
        user: null,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
