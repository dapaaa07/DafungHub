'use client';

import React from 'react';
import { MessageCircle } from 'lucide-react';
import { CS_WHATSAPP_INTL } from '@/lib/pricing';

export default function FloatingWhatsApp() {
  return (
    <aside aria-label="Customer Support WhatsApp" className="fixed bottom-6 right-6 z-40">
      <a
        href={`https://wa.me/${CS_WHATSAPP_INTL}?text=${encodeURIComponent(
          'Halo CS Dafung Hub, saya ingin konsultasi produk digital premium.'
        )}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2.5 px-4 py-3 rounded-full bg-[#25D366] hover:bg-[#20bd5a] text-white shadow-xl shadow-green-600/30 hover:shadow-2xl hover:scale-105 active:scale-95 transition-all group font-extrabold text-xs sm:text-sm cursor-pointer"
        title="Chat CS WhatsApp (08.00 - 23.00 WIB)"
      >
        <div className="relative">
          <MessageCircle className="w-5 h-5 text-white" />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-white animate-pulse" />
        </div>
        <span className="tracking-wide">Chat CS WA</span>
      </a>
    </aside>
  );
}
