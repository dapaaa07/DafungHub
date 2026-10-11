'use client';

import Image from 'next/image';
import { Check, Send, ShieldCheck, Zap } from 'lucide-react';
import { EnrichedProduct } from '@/lib/types';
import { formatRupiah, TELEGRAM_BOT_USERNAME } from '@/lib/pricing';
import { useBotStatus } from './BotStatusContext';

interface ProductCardProps {
  product: EnrichedProduct;
  onSelect: (product: EnrichedProduct) => void;
}

export default function ProductCard({ product, onSelect }: ProductCardProps) {
  const isAvailable = product.availability === 'in_stock';
  const { botStatus } = useBotStatus();
  const isOnline = botStatus === 'online';
  const telegramBuyUrl = `https://t.me/${TELEGRAM_BOT_USERNAME}?start=buy_${product.id}`;

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-gray-200 hover:border-yellow-400 hover:shadow-xl hover:shadow-yellow-400/5 transition-all duration-300 overflow-hidden group">
      {/* Card Header Bar */}
      <div className="p-5 pb-3">
        <div className="flex items-start justify-between gap-3">
          {/* Logo & Platform Info */}
          <div className="flex items-center gap-3">
            <div className="relative w-12 h-12 rounded-xl bg-gray-50 border border-gray-100 p-1.5 flex items-center justify-center overflow-hidden shrink-0 group-hover:scale-105 transition-transform">
              {product.logoUrl ? (
                <Image
                  src={product.logoUrl}
                  alt={product.platformName}
                  width={40}
                  height={40}
                  className="object-contain max-h-9 w-auto"
                />
              ) : (
                <span className="text-xl">{product.platformIcon}</span>
              )}
            </div>
            <div>
              <span className="text-[11px] font-bold tracking-wider uppercase text-gray-500 block">
                {product.platformName}
              </span>
              <h3 className="text-base font-extrabold text-[#121212] line-clamp-1 group-hover:text-yellow-600 transition-colors">
                {product.name}
              </h3>
            </div>
          </div>

          {/* Badges: Duration & Stock */}
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-[#121212] text-white">
              {product.durationText}
            </span>
            {isAvailable ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Ready
              </span>
            ) : (
              <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                Habis
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Feature Bullet Points */}
      <div className="px-5 py-3 flex-1 space-y-2 text-xs text-gray-600 border-t border-b border-gray-50 bg-[#fafafa]/50">
        {product.features.slice(0, 3).map((feat, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <div className="w-4 h-4 rounded-full bg-[#3AA8E8]/15 flex items-center justify-center shrink-0 mt-0.5 text-[#3AA8E8]">
              <Check className="w-2.5 h-2.5 stroke-[3]" />
            </div>
            <span className="line-clamp-1">{feat}</span>
          </div>
        ))}

        {/* Guarantee Pill Tag */}
        <div className="pt-1 flex items-center gap-1.5 text-[11px] font-semibold text-gray-500">
          <ShieldCheck className="w-3.5 h-3.5 text-[#3AA8E8]" />
          <span>{product.warrantyText}</span>
        </div>
      </div>

      {/* Card Pricing & Action Buttons */}
      <div className="p-5 pt-4 bg-white mt-auto space-y-3">
        {/* Price Display */}
        <div className="flex items-baseline justify-between">
          <div>
            <span className="text-[11px] text-gray-400 line-through mr-1.5 font-medium">
              {formatRupiah(product.originalPrice)}
            </span>
            <div className="text-xl sm:text-2xl font-black tracking-tight text-[#121212]">
              {formatRupiah(product.sellingPrice)}
            </div>
          </div>
          <span className="text-[10px] font-bold px-2 py-1 rounded bg-[#FFDE00]/20 text-yellow-800 border border-yellow-300/40">
            Hemat 30%+
          </span>
        </div>

        {/* Buttons: Primary "Beli Sekarang" & Secondary "Pesan via Bot" */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          {/* Primary Action Button: Open Detail & Order Modal */}
          <button
            onClick={() => onSelect(product)}
            disabled={!isAvailable}
            className={`w-full py-3 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
              isAvailable
                ? 'bg-[#FFDE00] text-[#121212] hover:bg-[#FFE838] shadow-sm hover:scale-[1.02] active:scale-95'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            <Zap className="w-3.5 h-3.5 fill-[#121212]" />
            <span>Beli Sekarang</span>
          </button>

          {/* Secondary Action: Dynamic Online vs Maintenance */}
          {isOnline && isAvailable ? (
            <a
              href={telegramBuyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 px-2 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1.5 bg-gray-100 hover:bg-[#121212] hover:text-[#FFDE00] text-gray-700 border border-gray-200 transition-all text-center"
              title="Order langsung via Bot Telegram"
            >
              <Send className="w-3 h-3 text-[#3AA8E8]" />
              <span className="truncate">Pesan via Bot</span>
            </a>
          ) : (
            <button
              disabled
              className="w-full py-3 px-2 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1.5 bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"
              title={isOnline ? 'Stok produk sedang habis' : 'Bot Telegram sedang maintenance'}
            >
              <Send className="w-3 h-3 text-gray-400" />
              <span className="truncate">{isOnline ? 'Habis' : 'Bot Maint.'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
