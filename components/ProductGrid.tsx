'use client';

import { useState, useMemo } from 'react';
import { EnrichedProduct, ProductCategory } from '@/lib/types';
import CategoryFilter from './CategoryFilter';
import ProductCard from './ProductCard';
import OrderModal from './OrderModal';
import { Sparkles, PackageSearch } from 'lucide-react';

interface ProductGridProps {
  initialProducts: EnrichedProduct[];
}

export default function ProductGrid({ initialProducts }: ProductGridProps) {
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('popular');
  const [stockOnly, setStockOnly] = useState(false);
  const [activeModalProduct, setActiveModalProduct] = useState<EnrichedProduct | null>(null);

  // Compute category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<ProductCategory, number> = {
      all: initialProducts.length,
      streaming: 0,
      ai: 0,
      creative: 0,
      office: 0,
      security: 0,
      other: 0,
    };

    initialProducts.forEach((p) => {
      if (counts[p.category] !== undefined) {
        counts[p.category]++;
      } else {
        counts.other++;
      }
    });

    return counts;
  }, [initialProducts]);

  // Filter & sort products
  const filteredProducts = useMemo(() => {
    let list = [...initialProducts];

    // Filter by Category
    if (selectedCategory !== 'all') {
      list = list.filter((p) => p.category === selectedCategory);
    }

    // Filter by Stock
    if (stockOnly) {
      list = list.filter((p) => p.availability === 'in_stock');
    }

    // Filter by Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.platformName.toLowerCase().includes(q)
      );
    }

    // Sort Products
    if (sortBy === 'price_asc') {
      list.sort((a, b) => a.sellingPrice - b.sellingPrice);
    } else if (sortBy === 'price_desc') {
      list.sort((a, b) => b.sellingPrice - a.sellingPrice);
    } else if (sortBy === 'name_asc') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'popular') {
      // Prioritize popular items first, then in_stock, then name
      list.sort((a, b) => {
        if (a.isPopular && !b.isPopular) return -1;
        if (!a.isPopular && b.isPopular) return 1;
        if (a.availability === 'in_stock' && b.availability !== 'in_stock') return -1;
        if (a.availability !== 'in_stock' && b.availability === 'in_stock') return 1;
        return a.name.localeCompare(b.name);
      });
    }

    return list;
  }, [initialProducts, selectedCategory, searchQuery, sortBy, stockOnly]);

  return (
    <section id="katalog" className="py-16 sm:py-24 bg-[#F8F9FA]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        {/* Section Heading */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFDE00]/20 text-yellow-900 border border-yellow-300 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Katalog Resmi Supplier Live</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#121212] tracking-tight">
            Pilih Paket Digital Kebutuhan Anda
          </h2>
          <p className="text-sm sm:text-base text-gray-600">
            Semua produk bergaransi penuh, harga distributor terbaik, dan siap dikirim otomatis melalui Bot Telegram atau WhatsApp Admin.
          </p>
        </div>

        {/* Filter Controls Bar */}
        <CategoryFilter
          currentCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          sortBy={sortBy}
          onSortChange={setSortBy}
          stockOnly={stockOnly}
          onStockToggle={setStockOnly}
          counts={categoryCounts}
        />

        {/* Results Counter */}
        <div className="flex items-center justify-between text-xs text-gray-500 font-medium px-1">
          <span>
            Menampilkan <strong className="text-black">{filteredProducts.length}</strong> dari{' '}
            {initialProducts.length} produk
          </span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-yellow-700 hover:underline font-semibold"
            >
              Reset Pencarian
            </button>
          )}
        </div>

        {/* Products Grid */}
        {filteredProducts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredProducts.map((prod) => (
              <ProductCard
                key={prod.id}
                product={prod}
                onSelect={(p) => setActiveModalProduct(p)}
              />
            ))}
          </div>
        ) : (
          /* Empty State */
          <div className="bg-white rounded-3xl border border-gray-200 p-12 text-center max-w-md mx-auto space-y-4 shadow-sm">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto text-gray-400">
              <PackageSearch className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-[#121212]">
              Produk Tidak Ditemukan
            </h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              Tidak ada produk yang cocok dengan kata kunci &quot;{searchQuery}&quot;. Coba cari dengan nama platform lain seperti Netflix, Capcut, Canva, atau Office.
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
                setStockOnly(false);
              }}
              className="px-5 py-2.5 rounded-xl bg-[#121212] text-white font-bold text-xs hover:bg-[#252525] transition-all"
            >
              Tampilkan Semua Produk
            </button>
          </div>
        )}

        {/* Order Modal Component */}
        <OrderModal
          product={activeModalProduct}
          onClose={() => setActiveModalProduct(null)}
        />
      </div>
    </section>
  );
}
