'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  Wallet,
  CreditCard,
  ArrowRight,
  Loader2,
  AlertCircle,
  Tag,
  Zap,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { formatRupiah } from '@/lib/pricing';
import { useCustomerAuth } from './CustomerAuthContext';

const PRESET_AMOUNTS = [10000, 25000, 50000, 100000, 200000, 500000];

export default function TopUpModal() {
  const router = useRouter();
  const { customer, isTopUpModalOpen, initialTopUpAmount, closeTopUpModal } = useCustomerAuth();

  const [selectedAmount, setSelectedAmount] = useState<number>(50000);
  const [customAmountStr, setCustomAmountStr] = useState<string>('');
  const [voucherCode, setVoucherCode] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    if (isTopUpModalOpen) {
      document.body.style.overflow = 'hidden';
      setErrorMessage('');
      if (initialTopUpAmount && initialTopUpAmount >= 5000) {
        if (PRESET_AMOUNTS.includes(initialTopUpAmount)) {
          setSelectedAmount(initialTopUpAmount);
          setCustomAmountStr('');
        } else {
          setSelectedAmount(initialTopUpAmount);
          setCustomAmountStr(String(initialTopUpAmount));
        }
      }
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isTopUpModalOpen, initialTopUpAmount]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTopUpModalOpen) {
        closeTopUpModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTopUpModalOpen, closeTopUpModal]);

  if (!isTopUpModalOpen || !customer) return null;

  const currentAmount = customAmountStr ? parseInt(customAmountStr, 10) || 0 : selectedAmount;
  const qrisFee = 100;
  const totalPayable = currentAmount > 0 ? currentAmount + qrisFee : 0;

  const handleSelectPreset = (amt: number) => {
    setSelectedAmount(amt);
    setCustomAmountStr('');
    setErrorMessage('');
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const clean = e.target.value.replace(/\D/g, '');
    setCustomAmountStr(clean);
    setErrorMessage('');
  };

  const handleTopUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (currentAmount < 5000) {
      setErrorMessage('Nominal top-up minimal adalah Rp 5.000.');
      return;
    }

    if (currentAmount > 10000000) {
      setErrorMessage('Nominal top-up maksimal adalah Rp 10.000.000 per transaksi.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/orders/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: `deposit_${currentAmount}`,
          paymentMethod: 'qris',
          voucherCode: voucherCode.trim() || undefined,
          targetEmail: customer.email || undefined,
          targetPhone: customer.phone || undefined,
          targetName: customer.name || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error || 'Gagal membuat invoice top-up saldo.');
        setIsSubmitting(false);
        return;
      }

      closeTopUpModal();
      router.push(`/order/${data.orderCode}`);
    } catch (err) {
      setErrorMessage((err as Error).message || 'Terjadi kesalahan jaringan.');
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto bg-black/70 backdrop-blur-sm animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeTopUpModal();
      }}
    >
      <div
        className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden my-auto max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="bg-[#121212] text-white p-4 sm:p-5 flex items-center justify-between border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#FFDE00] text-[#121212] flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-gray-100">
                Top-Up Saldo Akun
              </h3>
              <span className="text-[10px] text-gray-400 block">
                QRIS Instan Otomatis 24 Jam
              </span>
            </div>
          </div>
          <button
            onClick={closeTopUpModal}
            className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 active:bg-white/35 text-white flex items-center justify-center transition-all border border-white/20 shrink-0 focus:outline-none"
            aria-label="Tutup modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body Form */}
        <form onSubmit={handleTopUpSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {/* User Current Balance Snapshot */}
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <div>
                <span className="text-[10px] font-bold text-gray-500 uppercase block">
                  Saldo Akun Anda Saat Ini
                </span>
                <span className="text-base font-black text-emerald-800">
                  {formatRupiah(customer.balance)}
                </span>
              </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800">
              Hemat Rp 200/Order
            </span>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-700 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{errorMessage}</span>
            </div>
          )}

          {/* Preset Amount Chips */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-extrabold text-gray-700">
              Pilih Nominal Top-Up:
            </label>
            <div className="grid grid-cols-3 gap-2">
              {PRESET_AMOUNTS.map((amt) => {
                const isSelected = !customAmountStr && selectedAmount === amt;
                return (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => handleSelectPreset(amt)}
                    className={`py-2.5 px-2 rounded-xl border text-xs font-bold transition-all text-center ${
                      isSelected
                        ? 'border-[#121212] bg-[#121212] text-white shadow-sm ring-2 ring-[#FFDE00]'
                        : 'border-gray-200 bg-white hover:border-gray-300 text-gray-700'
                    }`}
                  >
                    {amt >= 100000 ? `Rp ${(amt / 1000).toLocaleString('id-ID')}k` : `Rp ${amt.toLocaleString('id-ID')}`}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Amount Input */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-extrabold text-gray-700">
              Atau Masukkan Nominal Lain:
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-extrabold text-xs text-gray-500">
                Rp
              </span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Contoh: 15000 (Min. Rp 5.000)"
                value={customAmountStr}
                onChange={handleCustomChange}
                className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#FFDE00]"
              />
            </div>
          </div>

          {/* Voucher Input */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-extrabold text-gray-700">
              Kode Voucher Cashback (Opsional):
            </label>
            <div className="relative">
              <Tag className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Punya voucher deposit cashback?"
                value={voucherCode}
                onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-xs uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-[#FFDE00]"
              />
            </div>
          </div>

          {/* Pricing Breakdown Summary */}
          <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-1.5 text-xs">
            <div className="flex justify-between text-gray-500 text-[11px]">
              <span>Nominal Saldo</span>
              <span>{formatRupiah(currentAmount)}</span>
            </div>
            <div className="flex justify-between text-gray-400 text-[10px]">
              <span>Biaya Gateway QRIS</span>
              <span>+{formatRupiah(qrisFee)}</span>
            </div>
            <div className="border-t border-gray-200/80 pt-1.5 flex justify-between items-center font-extrabold text-[#121212]">
              <span>Total Pembayaran</span>
              <span className="text-sm sm:text-base font-black text-[#121212]">
                {formatRupiah(totalPayable)}
              </span>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || currentAmount < 5000}
            className="w-full py-3.5 px-4 rounded-xl bg-[#121212] hover:bg-[#252525] active:scale-[0.99] text-white font-black text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-[#FFDE00]" />
                <span>Membuat Invoice QRIS...</span>
              </>
            ) : (
              <>
                <CreditCard className="w-4 h-4 text-[#FFDE00]" />
                <span>Buat QRIS Pembayaran ({formatRupiah(totalPayable)})</span>
                <ArrowRight className="w-4 h-4 text-[#FFDE00]" />
              </>
            )}
          </button>

          {/* Trust Guarantees */}
          <div className="pt-1 flex items-center justify-center gap-2 text-[10px] text-gray-500 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Saldo otomatis masuk segera setelah QRIS terbayar</span>
          </div>
        </form>
      </div>
    </div>
  );
}
