import { query, Product } from '../core/db';
import { SupplierProduct } from './supplier-api';

/**
 * Fetch products stored in local database
 */
export async function getInternalProducts(): Promise<SupplierProduct[]> {
  try {
    const res = await query<Product>(
      `SELECT * FROM products WHERE is_active = true ORDER BY name ASC`
    );

    return res.rows.map((p) => ({
      id: p.id,
      name: p.name,
      availability: p.stock > 0 ? 'in_stock' : 'out_of_stock',
      price_idr: p.price,
      description: `Stok internal: ${p.stock} akun tersedia.`,
    }));
  } catch (err) {
    console.error('[InternalCatalog] Failed to fetch internal products:', err);
    return [];
  }
}
