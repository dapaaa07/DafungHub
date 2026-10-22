import { NextResponse } from 'next/server';
import { query, Product } from '@/lib/db';
import { verifyAdminRequest, unauthorizedResponse } from '@/lib/admin-auth';
import { getAllEnrichedProducts } from '@/lib/supplier';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: Request) {
  if (!verifyAdminRequest(req)) {
    return unauthorizedResponse();
  }

  try {
    const products = await getAllEnrichedProducts(true);

    return NextResponse.json(
      {
        success: true,
        count: products.length,
        products,
        timestamp: new Date().toISOString(),
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message || 'Gagal memuat katalog produk.',
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function POST(req: Request) {
  if (!verifyAdminRequest(req)) {
    return unauthorizedResponse();
  }

  try {
    const body = await req.json();
    const name = (body.name || '').trim();
    const price = Math.round(Number(body.price || 0));
    const stock = Math.max(0, parseInt(body.stock || '50', 10));
    const description = (body.description || '').trim();
    const requiresEmail = Boolean(body.requiresEmail || body.requires_email);

    if (!name || price <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Nama produk dan harga jual (lebih besar dari 0) wajib diisi.',
        },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const insertRes = await query<Product>(
      `INSERT INTO products (name, price, stock, description, is_manual, requires_email, is_active)
       VALUES ($1, $2, $3, $4, true, $5, true)
       RETURNING *`,
      [name, price, stock, description, requiresEmail]
    );

    const newProduct = insertRes.rows[0];

    return NextResponse.json(
      {
        success: true,
        message: `Produk "${name}" berhasil ditambahkan ke katalog.`,
        product: newProduct,
        timestamp: new Date().toISOString(),
      },
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message || 'Gagal menambahkan produk manual.',
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
