import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyAdminRequest, unauthorizedResponse } from '@/lib/admin-auth';
import { setCustomPrice } from '@/lib/custom-prices';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!verifyAdminRequest(req)) {
    return unauthorizedResponse();
  }

  const { id } = await context.params;
  const productId = decodeURIComponent(id).trim();

  try {
    const body = await req.json();
    const price = body.price !== undefined ? Math.round(Number(body.price)) : undefined;
    const stock = body.stock !== undefined ? Math.max(0, parseInt(body.stock, 10)) : undefined;
    const isActive = body.isActive !== undefined ? Boolean(body.isActive) : undefined;
    const description = body.description !== undefined ? String(body.description).trim() : undefined;
    const name = body.name !== undefined ? String(body.name).trim() : undefined;

    // Check if it exists in local products table (UUID or ID match)
    const dbProd = await query(
      'SELECT * FROM products WHERE id::text = $1 LIMIT 1',
      [productId]
    ).catch(() => ({ rows: [] as Array<Record<string, unknown>> }));

    if (dbProd.rows.length > 0) {
      const updates: string[] = [];
      const params: unknown[] = [];

      if (price !== undefined && price > 0) {
        params.push(price);
        updates.push(`price = $${params.length}`);
      }
      if (stock !== undefined) {
        params.push(stock);
        updates.push(`stock = $${params.length}`);
      }
      if (isActive !== undefined) {
        params.push(isActive);
        updates.push(`is_active = $${params.length}`);
      }
      if (description !== undefined) {
        params.push(description);
        updates.push(`description = $${params.length}`);
      }
      if (name !== undefined && name.length > 0) {
        params.push(name);
        updates.push(`name = $${params.length}`);
      }

      if (updates.length > 0) {
        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        params.push(productId);
        await query(
          `UPDATE products SET ${updates.join(', ')} WHERE id::text = $${params.length}`,
          params
        );
      }

      return NextResponse.json(
        {
          success: true,
          message: 'Produk berhasil diperbarui.',
          productId,
        },
        { status: 200, headers: CORS_HEADERS }
      );
    } else {
      // It's a supplier product: update custom price in product_prices
      if (price !== undefined && price > 0) {
        await setCustomPrice(productId, price);
      }
      return NextResponse.json(
        {
          success: true,
          message: 'Harga kustom produk supplier berhasil diperbarui.',
          productId,
        },
        { status: 200, headers: CORS_HEADERS }
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message || 'Gagal memperbarui produk.',
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!verifyAdminRequest(req)) {
    return unauthorizedResponse();
  }

  const { id } = await context.params;
  const productId = decodeURIComponent(id).trim();

  try {
    // Soft toggle or deactivate product
    await query(
      `UPDATE products SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP WHERE id::text = $1`,
      [productId]
    );

    return NextResponse.json(
      {
        success: true,
        message: 'Status aktif produk berhasil diubah.',
        productId,
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message || 'Gagal mengubah status produk.',
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
