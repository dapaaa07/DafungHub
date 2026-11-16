import { NextRequest, NextResponse } from 'next/server';
import { getCustomerFromRequest, getCustomerDisplayId } from '@/lib/customer-auth';
import {
  getUserMembership,
  MEMBERSHIP_PACKAGES,
  formatWibDate,
  findMembershipPackage,
} from '@/lib/membership';
import { query, Product } from '@/lib/db';
import { createWebOrder } from '@/lib/web-order';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  try {
    const customer = await getCustomerFromRequest(req);
    if (!customer) {
      return NextResponse.json(
        { success: false, error: 'Sesi telah berakhir. Silakan login kembali.' },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const membership = await getUserMembership(customer.id);

    // Fetch live membership products from database
    const dbProductsRes = await query<Product>(
      `SELECT * FROM products
       WHERE is_active = true AND name ILIKE '%membership%'
       ORDER BY price ASC`
    );

    const packages = MEMBERSHIP_PACKAGES.map((pkg) => {
      const matchedDb = dbProductsRes.rows.find(
        (p) =>
          p.name.toLowerCase().includes(pkg.name.toLowerCase()) ||
          p.name.toLowerCase().includes(`${pkg.durationMonths} bulan`)
      );

      return {
        id: pkg.id,
        productId: matchedDb ? matchedDb.id : pkg.id,
        name: pkg.name,
        durationDays: pkg.durationDays,
        durationMonths: pkg.durationMonths,
        price: matchedDb ? Number(matchedDb.price) : pkg.price,
        badge: pkg.badge,
        tagline: pkg.tagline,
        available: Boolean(matchedDb),
      };
    });

    return NextResponse.json(
      {
        success: true,
        user: {
          id: customer.id,
          displayId: getCustomerDisplayId(customer),
          username: customer.username,
          name: customer.name || customer.first_name || (customer.username ? `@${customer.username}` : 'Pelanggan'),
          email: customer.email,
          phone: customer.phone,
          balance: Number(customer.balance || 0),
        },
        membership: {
          isVip: membership.isVip,
          tier: membership.tier,
          expiresAt: membership.expiresAt ? membership.expiresAt.toISOString() : null,
          formattedExpiresAt: membership.expiresAt ? formatWibDate(membership.expiresAt) : null,
          daysRemaining: membership.daysRemaining,
          weeklyUsed: membership.weeklyUsed,
          weeklyLimit: membership.weeklyLimit,
          remainingWeeklyQuota: membership.remainingWeeklyQuota,
          resetAt: membership.resetAt ? membership.resetAt.toISOString() : null,
        },
        packages,
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error('[API /api/user/membership GET] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal mengambil data membership.' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const customer = await getCustomerFromRequest(req);
    if (!customer) {
      return NextResponse.json(
        { success: false, error: 'Sesi telah berakhir. Silakan login kembali.' },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { packageId, paymentMethod, voucherCode } = body;

    if (!packageId) {
      return NextResponse.json(
        { success: false, error: 'Paket membership wajib dipilih.' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const selectedMethod = paymentMethod === 'balance' ? 'balance' : 'qris';

    // Find the package metadata
    const pkgMeta = findMembershipPackage(packageId) || MEMBERSHIP_PACKAGES.find((p) => p.id === packageId);
    const searchName = pkgMeta ? pkgMeta.name : packageId;

    // Find matching product in database
    const prodRes = await query<Product>(
      `SELECT * FROM products
       WHERE (id::text = $1 OR name ILIKE $2 OR name ILIKE $3)
         AND is_active = true
       ORDER BY price ASC
       LIMIT 1`,
      [packageId, `%${searchName}%`, `%${packageId}%`]
    );

    if (prodRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Produk paket membership tidak ditemukan di sistem katalog.' },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    const product = prodRes.rows[0];

    // Create web order for this membership subscription
    const result = await createWebOrder({
      userId: customer.id,
      productId: product.id,
      paymentMethod: selectedMethod,
      voucherCode: voucherCode || undefined,
      customerName: customer.name || customer.username || undefined,
      customerEmail: customer.email || undefined,
      customerPhone: customer.phone || undefined,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Gagal memproses langganan membership.',
          shortfall: result.shortfall,
        },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // If paid with balance, fetch updated membership status
    let updatedMembership = null;
    if (selectedMethod === 'balance') {
      updatedMembership = await getUserMembership(customer.id);
    }

    return NextResponse.json(
      {
        success: true,
        orderCode: result.orderCode,
        paymentMethod: selectedMethod,
        payableAmount: result.payableAmount,
        qrCodeUrl: result.qrCodeUrl,
        qrString: result.qrString,
        checkoutUrl: result.checkoutUrl,
        redirectUrl: result.redirectUrl || `/order/${result.orderCode}`,
        message:
          selectedMethod === 'balance'
            ? 'Selamat! Paket VIP Membership Anda berhasil diaktifkan.'
            : 'Silakan selesaikan pembayaran QRIS untuk mengaktifkan VIP Membership.',
        membership: updatedMembership
          ? {
              isVip: updatedMembership.isVip,
              tier: updatedMembership.tier,
              expiresAt: updatedMembership.expiresAt ? updatedMembership.expiresAt.toISOString() : null,
              formattedExpiresAt: updatedMembership.expiresAt
                ? formatWibDate(updatedMembership.expiresAt)
                : null,
              daysRemaining: updatedMembership.daysRemaining,
              remainingWeeklyQuota: updatedMembership.remainingWeeklyQuota,
            }
          : undefined,
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error('[API /api/user/membership POST] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Terjadi kesalahan sistem saat memproses membership.' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
