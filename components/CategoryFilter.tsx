'use client';

import { Search, X, ArrowUpDown } from 'lucide-react';
import { ProductCategory } from '@/lib/types';

interface CategoryFilterProps {
  currentCategory: ProductCategory;
  onSelectCategory: (cat: ProductCategory) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  sortBy: string;
  onSortChange: (sort: string) => void;
  stockOnly: boolean;
  onStockToggle: (v: boolean) => void;
  counts: Record<ProductCategory, number>;
}

export const CATEGORIES: { id: ProductCategory; label: string; icon: string }[] = [
  { id: 'all', label: 'Semua Produk', icon: '🌟' },
  { id: 'streaming', label: 'Streaming Video', icon: '🍿' },
  { id: 'ai', label: 'AI & Produktivitas', icon: '🤖' },
  { id: 'creative', label: 'Desain & Kreatif', icon: '🎨' },
  { id: 'office', label: 'Office & Bisnis', icon: '📊' },
  { id: 'security', label: 'Security & VPN', icon: '🛡️' },
];

export default function CategoryFilter({
  currentCategory,
  onSelectCategory,
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  stockOnly,
  onStockToggle,
  counts,
}: CategoryFilterProps) {
  return (
    <div className="space-y-5">
      {/* Search Bar & Secondary Controls */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Search Input Box */}
        <div className="relative flex-1 max-w-xl">
          <Search className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Cari akun, misalnya: Netflix, Canva, Capcut, Claude..."
            className="w-full pl-12 pr-10 py-3.5 rounded-xl bg-white border border-gray-200 text-sm font-medium text-[#121212] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FFDE00] focus:border-[#121212] transition-all shadow-sm"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-gray-400 hover:text-black hover:bg-gray-100"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter Controls: Sort & Stock Toggle */}
        <div className="flex items-center gap-3">
          {/* In-Stock Only Toggle */}
          <button
            onClick={() => onStockToggle(!stockOnly)}
            className={`inline-flex items-center gap-2 px-3.5 py-3 rounded-xl text-xs font-bold border transition-all ${
              stockOnly
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                stockOnly ? 'bg-emerald-500 ring-2 ring-emerald-200' : 'bg-gray-300'
              }`}
            />
            <span>Stok Ready Saja</span>
          </button>

          {/* Sort Dropdown */}
          <div className="relative inline-block">
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value)}
              className="appearance-none bg-white border border-gray-200 text-gray-700 text-xs font-bold py-3 pl-3.5 pr-8 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FFDE00] shadow-sm cursor-pointer"
            >
              <option value="popular">🔥 Paling Populer</option>
              <option value="price_asc">💰 Harga Terendah</option>
              <option value="price_desc">💎 Harga Tertinggi</option>
              <option value="name_asc">🔤 Nama A - Z</option>
            </select>
            <ArrowUpDown className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Category Pill Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {CATEGORIES.map((cat) => {
          const isActive = currentCategory === cat.id;
          const count = counts[cat.id] ?? 0;

          return (
            <button
              key={cat.id}
              onClick={() => onSelectCategory(cat.id)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-extrabold whitespace-nowrap transition-all duration-200 ${
                isActive
                  ? 'bg-[#121212] text-white shadow-md scale-[1.02]'
                  : 'bg-white text-gray-700 hover:text-black hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  isActive
                    ? 'bg-[#FFDE00] text-[#121212]'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
