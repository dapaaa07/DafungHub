import { NextRequest, NextResponse } from 'next/server';
import { getCustomerFromRequest, formatCustomerProfile } from '@/lib/customer-auth';

export async function GET(req: NextRequest) {
  try {
    const user = await getCustomerFromRequest(req);
    if (!user) {
      return NextResponse.json({ success: false, user: null });
    }

    return NextResponse.json({
      success: true,
      user: formatCustomerProfile(user),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, user: null, error: error.message },
      { status: 500 }
    );
  }
}
