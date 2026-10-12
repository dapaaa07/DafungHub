import { NextResponse } from 'next/server';
import { getAllEnrichedProducts } from '@/lib/supplier';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Cache-Control, Pragma, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function GET() {
  try {
    const products = await getAllEnrichedProducts();

    return NextResponse.json(
      {
        success: true,
        timestamp: new Date().toISOString(),
        count: products.length,
        products,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          Pragma: 'no-cache',
          Expires: '0',
          ...CORS_HEADERS,
        },
      }
    );
  } catch (error) {
    console.error('[/api/products] Error retrieving products:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch live products',
        timestamp: new Date().toISOString(),
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          ...CORS_HEADERS,
        },
      }
    );
  }
}
