'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { EnrichedProduct, ProductCategory } from '@/lib/types';
import CategoryFilter from './CategoryFilter';
import ProductCard from './ProductCard';
import OrderModal from './OrderModal';
import { useBotStatus } from './BotStatusContext';
import { ChevronDown, PackageSearch } from 'lucide-react';

interface ProductGridProps {
  initialProducts: EnrichedProduct[];
}

const PAGE_SIZE = 20;

export default function ProductGrid({ initialProducts }: ProductGridProps) {
  const [products, setProducts] = useState<EnrichedProduct[]>(initialProducts);
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('popular');
  const [stockOnly, setStockOnly] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [activeModalProduct, setActiveModalProduct] = useState<EnrichedProduct | null>(null);
  const { botStatus } = useBotStatus();
  const isOnline = botStatus === 'online';

  // Gentle background refresh every 2 minutes only when the tab is visible
  useEffect(() => {
    let isMounted = true;
    const fetchLiveProducts = async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      try {
        const res = await fetch('/api/products', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted && data.success && Array.isArray(data.products) && data.products.length > 0) {
          setProducts(data.products);
        }
      } catch {
        // Retain current catalog silently on transient errors
      }
    };

    const interval = setInterval(fetchLiveProducts, 120_000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Reset pagination when filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [selectedCategory, searchQuery, sortBy, stockOnly]);

  const handleSelectProduct = useCallback((p: EnrichedProduct) => {
    setActiveModalProduct(p);
  }, []);

  // Compute category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<ProductCategory, number> = {
      all: products.length,
      streaming: 0,
      ai: 0,
      creative: 0,
      office: 0,
      security: 0,
      other: 0,
    };

    products.forEach((p) => {
      if (counts[p.category] !== undefined) {
        counts[p.category]++;
      } else {
        counts.other++;
      }
    });

    return counts;
  }, [products]);

  // Filter & sort products
  const filteredProducts = useMemo(() => {
    let list = [...products];

    if (selectedCategory !== 'all') {
      list = list.filter((p) => p.category === selectedCategory);
    }

    if (stockOnly) {
      list = list.filter((p) => p.availability === 'in_stock');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.platformName.toLowerCase().includes(q)
      );
    }

    if (sortBy === 'price_asc') {
      list.sort((a, b) => a.sellingPrice - b.sellingPrice);
    } else if (sortBy === 'price_desc') {
      list.sort((a, b) => b.sellingPrice - a.sellingPrice);
    } else if (sortBy === 'name_asc') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'popular') {
      list.sort((a, b) => {
        if (a.isPopular && !b.isPopular) return -1;
        if (!a.isPopular && b.isPopular) return 1;
        if (a.availability === 'in_stock' && b.availability !== 'in_stock') return -1;
        if (a.availability !== 'in_stock' && b.availability === 'in_stock') return 1;
        return a.name.localeCompare(b.name);
      });
    }

    return list;
  }, [products, selectedCategory, searchQuery, sortBy, stockOnly]);

  const visibleProducts = useMemo(
    () => filteredProducts.slice(0, visibleCount),
    [filteredProducts, visibleCount]
  );
  const remainingCount = filteredProducts.length - visibleProducts.length;

  return (
    <section id="katalog" className="py-16 sm:py-24 bg-[#F8F9FA]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        {/* Section Heading */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#121212] tracking-tight">
            Pilih Paket Digital Kebutuhan Anda
          </h2>
          <p className="text-sm sm:text-base text-gray-600">
            Semua produk bergaransi penuh, harga distributor terbaik, dan siap dipesan otomatis via Website Checkout maupun Bot Telegram 24 jam.
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
            Menampilkan <strong className="text-black">{visibleProducts.length}</strong> dari{' '}
            <strong className="text-black">{filteredProducts.length}</strong> produk
          </span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-yellow-700 hover:underline font-semibold cursor-pointer"
            >
              Reset Pencarian
            </button>
          )}
        </div>

        {/* Products Grid */}
        {visibleProducts.length > 0 ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {visibleProducts.map((prod) => (
                <ProductCard
                  key={prod.id}
                  product={prod}
                  isOnline={isOnline}
                  onSelect={handleSelectProduct}
                />
              ))}
            </div>

            {remainingCount > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#121212] hover:bg-[#252525] text-white text-xs sm:text-sm font-bold shadow-sm transition-all cursor-pointer"
                >
                  <ChevronDown className="w-4 h-4 text-[#FFDE00]" />
                  <span>
                    Muat {Math.min(PAGE_SIZE, remainingCount)} Produk Lainnya ({remainingCount} tersisa)
                  </span>
                </button>
                {remainingCount > PAGE_SIZE && (
                  <button
                    type="button"
                    onClick={() => setVisibleCount(filteredProducts.length)}
                    className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-3 rounded-xl bg-white hover:bg-gray-100 text-[#121212] border border-gray-200 text-xs sm:text-sm font-bold transition-all cursor-pointer"
                  >
                    Tampilkan Semua ({filteredProducts.length})
                  </button>
                )}
              </div>
            )}
          </>
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
              className="px-5 py-2.5 rounded-xl bg-[#121212] text-white font-bold text-xs hover:bg-[#252525] transition-all cursor-pointer"
            >
              Tampilkan Semua Produk
            </button>
          </div>
        )}

        {/* Mount Order Modal only when opened */}
        {activeModalProduct && (
          <OrderModal
            product={activeModalProduct}
            onClose={() => setActiveModalProduct(null)}
          />
        )}
      </div>
    </section>
  );
}
