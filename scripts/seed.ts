import { query } from '../lib/db';

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile?.();
  } catch {
    // Ignore if .env is missing
  }
}

export async function seedProducts(): Promise<void> {
  console.log('[Seed] Seeding sample products into PostgreSQL...');

  const sampleProducts = [
    {
      name: 'Spotify Premium 1 Bulan (Family Plan)',
      price: 25000,
      stock: 10,
      is_active: true,
    },
    {
      name: 'Netflix Premium UHD 1 Bulan (Private Profile)',
      price: 45000,
      stock: 5,
      is_active: true,
    },
    {
      name: 'YouTube Premium 1 Bulan (Out of Stock Test)',
      price: 15000,
      stock: 0,
      is_active: true,
    },
    {
      name: 'Canva Pro Edu 1 Tahun (Invite Link)',
      price: 20000,
      stock: 15,
      is_active: true,
    },
  ];

  for (const prod of sampleProducts) {
    const existing = await query('SELECT id FROM products WHERE name = $1', [prod.name]);
    if (existing.rows.length === 0) {
      const res = await query<{ id: string }>(
        `INSERT INTO products (name, price, stock, is_active)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, price, stock`,
        [prod.name, prod.price, prod.stock, prod.is_active]
      );
      console.log(`[Seed] Created product: ${prod.name} (ID: ${res.rows[0].id})`);
    } else {
      console.log(`[Seed] Product already exists: ${prod.name} (ID: ${existing.rows[0].id})`);
    }
  }

  console.log('[Seed] Seeding completed.');
}

if (require.main === module || process.argv[1]?.includes('seed.ts')) {
  seedProducts()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Seed] Error:', err);
      process.exit(1);
    });
}
