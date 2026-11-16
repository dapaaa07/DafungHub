'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  X,
  Send,
  MessageCircle,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ArrowRight,
  Zap,
  CreditCard,
  Wallet,
  Sparkles,
  Loader2,
  AlertCircle,
  Tag,
  Lock,
  LogIn,
  UserPlus,
} from 'lucide-react';
import { EnrichedProduct } from '@/lib/types';
import { formatRupiah, CS_WHATSAPP_INTL, TELEGRAM_BOT_USERNAME } from '@/lib/pricing';
import { useBotStatus } from './BotStatusContext';
import { useCustomerAuth } from './CustomerAuthContext';

interface OrderModalProps {
  product: EnrichedProduct | null;
  onClose: () => void;
}

export default function OrderModal({ product, onClose }: OrderModalProps) {
  const router = useRouter();
  const { botStatus } = useBotStatus();
  const { customer, openAuthModal } = useCustomerAuth();
  const isOnline = botStatus === 'online';

  const [paymentMethod, setPaymentMethod] = useState<'qris' | 'balance'>('qris');
  const [voucherCode, setVoucherCode] = useState('');
  const [targetEmail, setTargetEmail] = useState('');
  const [targetPhone, setTargetPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (product) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
      setErrorMessage('');
    }
    return () => {
      document.body.style.overflow = 'auto';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [product, onClose]);

  if (!product) return null;

  const basePrice = product.sellingPrice;
  const isVip = customer?.membership_tier === 'vip';
  const vipDiscount = isVip && basePrice > 1000 ? 1000 : 0;
  const balanceDiscount = paymentMethod === 'balance' ? 200 : 0;
  const qrisFee = paymentMethod === 'qris' ? 100 : 0;
  const estimatedTotal = Math.max(0, basePrice - vipDiscount - balanceDiscount + qrisFee);

  const telegramUrl = `https://t.me/${TELEGRAM_BOT_USERNAME}?start=buy_${product.id}`;
  const waMessage = `Halo Admin Dafung Hub, saya ingin memesan produk digital:
- Produk: ${product.name}
- Durasi: ${product.durationText}
- Harga: ${formatRupiah(product.sellingPrice)}
- ID Produk: ${product.id}

Mohon panduan ketersediaan & metode pembayarannya. Terima kasih!`;
  const waUrl = `https://wa.me/${CS_WHATSAPP_INTL}?text=${encodeURIComponent(waMessage)}`;

  const handleWebCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!customer) {
      setErrorMessage('Silakan masuk ke akun Anda terlebih dahulu untuk melakukan pemesanan.');
      openAuthModal('login');
      return;
    }

    setIsSubmitting(true);

    try {
      if (paymentMethod === 'balance' && customer.balance < estimatedTotal) {
        setErrorMessage(
          `Saldo akun Anda (${formatRupiah(customer.balance)}) tidak mencukupi untuk pesanan ini.`
        );
        setIsSubmitting(false);
        return;
      }

      const res = await fetch('/api/orders/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          paymentMethod,
          voucherCode: voucherCode.trim() || undefined,
          targetEmail: targetEmail.trim() || customer.email || undefined,
          targetPhone: targetPhone.trim() || customer.phone || undefined,
          targetName: customer.name || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data.requiresAuth) {
          openAuthModal('login');
        }
        setErrorMessage(data.error || 'Gagal memproses pesanan web.');
        setIsSubmitting(false);
        return;
      }

      onClose();
      router.push(data.redirectUrl || `/order/${data.orderCode}`);
    } catch (err) {
      setErrorMessage((err as Error).message || 'Terjadi kesalahan jaringan.');
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto bg-black/70 backdrop-blur-sm animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden my-auto max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Header Ribbon with Close Button */}
        <div className="sticky top-0 z-20 bg-[#121212] text-white p-4 sm:p-5 flex items-center justify-between border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FFDE00]" />
            <span className="font-extrabold text-sm tracking-wide text-gray-200">
              Pemesanan Produk Digital
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 sm:w-8 sm:h-8 rounded-full bg-white/15 hover:bg-white/25 active:bg-white/35 text-white flex items-center justify-center transition-all border border-white/20 shrink-0 focus:outline-none focus:ring-2 focus:ring-[#FFDE00]"
            aria-label="Tutup modal"
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto flex-1">
          {/* Product Overview Box */}
          <div className="p-3 sm:p-4 rounded-2xl bg-[#F8F9FA] border border-gray-200 flex items-center gap-3">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl bg-white border border-gray-200 p-1.5 sm:p-2 flex items-center justify-center shrink-0 shadow-sm">
              {product.logoUrl ? (
                <Image
                  src={product.logoUrl}
                  alt={product.platformName}
                  width={56}
                  height={56}
                  className="object-contain max-h-10 sm:max-h-12 w-auto"
                />
              ) : (
                <span className="text-xs sm:text-sm font-black tracking-wider uppercase text-gray-700">
                  {product.platformName.slice(0, 3)}
                </span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <span className="text-[10px] sm:text-[11px] font-bold text-gray-500 uppercase block truncate">
                {product.platformName}
              </span>
              <h4 className="text-sm sm:text-base font-extrabold text-[#121212] truncate">
                {product.name}
              </h4>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="px-2 py-0.5 rounded-md bg-[#121212] text-white text-[10px] sm:text-[11px] font-bold shrink-0">
                  {product.durationText}
                </span>
                <span className="text-[10px] sm:text-[11px] text-gray-500 flex items-center gap-1 font-medium shrink-0">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#3AA8E8]" /> {product.warrantyText}
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 1: INSTANT WEB ORDER (PRIMARY) */}
          <form onSubmit={handleWebCheckout} className="p-4 rounded-2xl bg-amber-50/50 border-2 border-yellow-300 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-lg bg-[#FFDE00] text-[#121212]">
                  <Zap className="w-4 h-4 fill-current" />
                </span>
                <div>
                  <h5 className="font-extrabold text-xs sm:text-sm text-[#121212]">
                    Pesan Langsung di Website
                  </h5>
                  <span className="text-[10px] text-gray-500 block">
                    Instan QRIS / Saldo Akun • Akun langsung muncul di layar
                  </span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                Paling Cepat ⚡
              </span>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-700 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{errorMessage}</span>
              </div>
            )}

            {/* Payment Method Selector */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-gray-700">
                Pilih Metode Pembayaran:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('qris')}
                  className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all ${
                    paymentMethod === 'qris'
                      ? 'border-[#121212] bg-white ring-2 ring-[#121212] shadow-sm'
                      : 'border-gray-200 bg-white/70 hover:bg-white text-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="text-xs font-black text-[#121212] flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-[#3AA8E8]" /> QRIS
                    </span>
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-gray-100 text-gray-600">
                      Semua Bank
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-500 leading-tight">
                    GoPay, OVO, Dana, BCA, ShopeePay
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('balance')}
                  className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all ${
                    paymentMethod === 'balance'
                      ? 'border-[#121212] bg-white ring-2 ring-[#121212] shadow-sm'
                      : 'border-gray-200 bg-white/70 hover:bg-white text-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="text-xs font-black text-[#121212] flex items-center gap-1.5">
                      <Wallet className="w-3.5 h-3.5 text-emerald-600" /> Saldo Akun
                    </span>
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">
                      -Rp 200
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-500 leading-tight">
                    {customer ? `Saldo: ${formatRupiah(customer.balance)}` : 'Masuk akun untuk pakai'}
                  </span>
                </button>
              </div>
            </div>

            {/* Customer Authentication Status Gate */}
            {customer ? (
              <div className="flex items-center justify-between px-3.5 py-2.5 bg-white rounded-xl border border-gray-200 text-xs shadow-xs">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-extrabold text-gray-900 truncate">
                        {customer.name || customer.email || customer.phone}
                      </span>
                      {isVip && (
                        <span className="px-1.5 py-0.2 rounded bg-[#FFDE00] text-[#121212] text-[9px] font-black shrink-0">
                          VIP ⭐
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-400 block truncate">
                      {customer.email || customer.phone}
                    </span>
                  </div>
                </div>
                <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 font-bold px-2 py-0.5 rounded-full text-[10px] shrink-0">
                  Akun Aktif
                </span>
              </div>
            ) : (
              <div className="p-4 bg-gradient-to-br from-amber-50 to-orange-50/50 rounded-2xl border-2 border-dashed border-amber-300 text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-900 flex items-center justify-center mx-auto shadow-inner">
                  <Lock className="w-5 h-5 text-amber-900" />
                </div>
                <div>
                  <h6 className="font-extrabold text-xs sm:text-sm text-[#121212]">
                    Login Diperlukan untuk Pemesanan
                  </h6>
                  <p className="text-[11px] text-gray-600 mt-1 leading-relaxed max-w-xs mx-auto">
                    Untuk keamanan transaksi, melacak pesanan, dan menerima lisensi akun secara instan, silakan masuk ke akun Anda.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => openAuthModal('login')}
                    className="py-2.5 px-3 rounded-xl bg-[#121212] hover:bg-[#252525] active:scale-[0.98] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
                  >
                    <LogIn className="w-3.5 h-3.5 text-[#FFDE00]" />
                    <span>Masuk Akun</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openAuthModal('register')}
                    className="py-2.5 px-3 rounded-xl bg-white hover:bg-gray-50 active:scale-[0.98] text-gray-800 border border-gray-300 font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5 text-gray-500" />
                    <span>Daftar Baru</span>
                  </button>
                </div>

                <a
                  href="/api/auth/google?returnTo=/"
                  className="w-full py-2 px-3 rounded-xl bg-white hover:bg-gray-50 active:scale-[0.98] text-gray-700 border border-gray-200 text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-all"
                >
                  <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>1-Klik Masuk dengan Google</span>
                </a>
              </div>
            )}

            {/* Voucher Input */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Punya kode voucher promo?"
                  value={voucherCode}
                  onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-gray-200 text-xs uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-[#FFDE00]"
                />
              </div>
            </div>

            {/* Pricing Breakdown Summary */}
            <div className="p-3 bg-white rounded-xl border border-gray-200 space-y-1 text-xs">
              <div className="flex justify-between text-gray-500 text-[11px]">
                <span>Harga Normal</span>
                <span>{formatRupiah(basePrice)}</span>
              </div>
              {vipDiscount > 0 && (
                <div className="flex justify-between text-amber-700 font-semibold text-[11px]">
                  <span>Diskon Member VIP</span>
                  <span>-Rp {vipDiscount.toLocaleString('id-ID')}</span>
                </div>
              )}
              {balanceDiscount > 0 && (
                <div className="flex justify-between text-emerald-700 font-semibold text-[11px]">
                  <span>Hemat Bayar Saldo</span>
                  <span>-Rp {balanceDiscount.toLocaleString('id-ID')}</span>
                </div>
              )}
              {paymentMethod === 'qris' && (
                <div className="flex justify-between text-gray-400 text-[10px]">
                  <span>Biaya Gateway QRIS</span>
                  <span>+{formatRupiah(qrisFee)}</span>
                </div>
              )}
              <div className="border-t border-gray-100 pt-1.5 flex justify-between items-center font-extrabold text-[#121212] text-sm">
                <span>Total Bayar</span>
                <span className="text-base text-[#121212]">{formatRupiah(estimatedTotal)}</span>
              </div>
            </div>

            {/* Big Web Checkout CTA */}
            {customer ? (
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 px-4 rounded-xl bg-[#121212] hover:bg-[#252525] active:scale-[0.99] text-white font-black text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#FFDE00]" />
                    <span>Membuat Pesanan & Invoice...</span>
                  </>
                ) : (
                  <>
                    <span>Bayar Sekarang ({formatRupiah(estimatedTotal)})</span>
                    <ArrowRight className="w-4 h-4 text-[#FFDE00]" />
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openAuthModal('login')}
                className="w-full py-3.5 px-4 rounded-xl bg-[#121212] hover:bg-[#252525] active:scale-[0.99] text-white font-black text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Lock className="w-4 h-4 text-[#FFDE00]" />
                <span>Masuk Akun untuk Memesan ({formatRupiah(estimatedTotal)})</span>
              </button>
            )}
          </form>

          {/* Divider to Secondary Channels */}
          <div className="relative flex items-center justify-center pt-2">
            <div className="border-t border-gray-200 w-full" />
            <span className="bg-white px-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider shrink-0">
              atau pesan lewat bot / whatsapp
            </span>
            <div className="border-t border-gray-200 w-full" />
          </div>

          {/* Secondary Options: Telegram Bot & WhatsApp */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Telegram Bot */}
            {isOnline ? (
              <a
                href={telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 p-3 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-800 transition-all text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-[#121212] text-white flex items-center justify-center shrink-0">
                  <Send className="w-4 h-4 text-[#3AA8E8]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-[#121212] truncate">Telegram Bot</div>
                  <div className="text-[10px] text-gray-500 truncate">Auto order 24 jam</div>
                </div>
              </a>
            ) : (
              <div className="flex items-center gap-2.5 p-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-400 text-left cursor-not-allowed">
                <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center shrink-0">
                  <Send className="w-4 h-4 text-gray-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-gray-500 truncate">Telegram Bot</div>
                  <div className="text-[10px] text-gray-400 truncate">Maintenance</div>
                </div>
              </div>
            )}

            {/* WhatsApp CS */}
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 p-3 rounded-xl border border-yellow-200 bg-yellow-50 hover:bg-yellow-100 text-gray-800 transition-all text-left"
            >
              <div className="w-8 h-8 rounded-lg bg-[#FFDE00] text-[#121212] flex items-center justify-center shrink-0">
                <MessageCircle className="w-4 h-4 text-[#121212]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-[#121212] truncate">WhatsApp CS</div>
                <div className="text-[10px] text-yellow-900/80 truncate">Dibantu tim admin</div>
              </div>
            </a>
          </div>

          {/* Trust Guarantees Footer */}
          <div className="pt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] sm:text-[11px] text-gray-500 font-medium text-center">
            <span className="flex items-center gap-1 shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Garansi Aktif
            </span>
            <span className="text-gray-300 hidden sm:inline">•</span>
            <span className="flex items-center gap-1 shrink-0">
              <Clock className="w-3.5 h-3.5 text-[#3AA8E8] shrink-0" /> Pengiriman Otomatis
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
