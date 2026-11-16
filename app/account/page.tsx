'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  User as UserIcon,
  Wallet,
  Crown,
  Sparkles,
  ShieldCheck,
  Send,
  MessageCircle,
  PackageCheck,
  LogOut,
  ArrowRight,
  Loader2,
  Calendar,
  CheckCircle2,
  Copy,
  Check,
  Zap,
  Tag,
  Clock,
  ChevronRight,
  QrCode,
  Flame,
} from 'lucide-react';
import { formatRupiah, CS_WHATSAPP_INTL, TELEGRAM_BOT_USERNAME } from '@/lib/pricing';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useCustomerAuth } from '@/components/CustomerAuthContext';

interface MembershipStatusData {
  isVip: boolean;
  tier: string;
  expiresAt: string | null;
  formattedExpiresAt: string | null;
  daysRemaining: number;
  weeklyUsed: number;
  weeklyLimit: number;
  remainingWeeklyQuota: number;
  resetAt: string | null;
}

interface MembershipPackageItem {
  id: string;
  productId: string;
  name: string;
  durationDays: number;
  durationMonths: number;
  price: number;
  badge: string;
  tagline: string;
  available: boolean;
}

export default function AccountPage() {
  const router = useRouter();
  const { customer, isLoading, openAuthModal, openTopUpModal, logout, refreshCustomer } =
    useCustomerAuth();

  const [copiedId, setCopiedId] = useState(false);
  const [membershipData, setMembershipData] = useState<MembershipStatusData | null>(null);
  const [packages, setPackages] = useState<MembershipPackageItem[]>([]);
  const [isLoadingMembership, setIsLoadingMembership] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<MembershipPackageItem | null>(null);
  const [isProcessingUpgrade, setIsProcessingUpgrade] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [upgradeSuccess, setUpgradeSuccess] = useState<string | null>(null);

  // Fetch full membership data
  const fetchMembership = async () => {
    if (!customer) return;
    setIsLoadingMembership(true);
    try {
      const res = await fetch('/api/user/membership');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setMembershipData(data.membership);
          if (Array.isArray(data.packages)) {
            setPackages(data.packages);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load membership data:', err);
    } finally {
      setIsLoadingMembership(false);
    }
  };

  useEffect(() => {
    if (customer) {
      fetchMembership();
    }
  }, [customer]);

  const displayId =
    customer?.display_id ||
    customer?.telegram_id ||
    (customer?.id ? `WEB-${customer.id.replace(/-/g, '').slice(0, 8).toUpperCase()}` : 'WEB-BUYER');

  const handleCopyId = () => {
    if (navigator.clipboard && displayId) {
      navigator.clipboard.writeText(displayId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const handleUpgradeWithBalance = async (pkg: MembershipPackageItem) => {
    if (!customer) {
      openAuthModal('login');
      return;
    }

    if (customer.balance < pkg.price) {
      const shortfall = pkg.price - customer.balance;
      openTopUpModal(shortfall);
      return;
    }

    setIsProcessingUpgrade(true);
    setUpgradeError(null);
    setUpgradeSuccess(null);

    try {
      const res = await fetch('/api/user/membership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId: pkg.id,
          paymentMethod: 'balance',
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setUpgradeError(data.error || 'Gagal memproses upgrade VIP.');
        return;
      }

      setUpgradeSuccess(data.message || 'VIP Membership berhasil diaktifkan!');
      setSelectedPackage(null);
      await refreshCustomer();
      await fetchMembership();
    } catch {
      setUpgradeError('Terjadi kesalahan koneksi saat memproses.');
    } finally {
      setIsProcessingUpgrade(false);
    }
  };

  const handleUpgradeWithQris = async (pkg: MembershipPackageItem) => {
    if (!customer) {
      openAuthModal('login');
      return;
    }

    setIsProcessingUpgrade(true);
    setUpgradeError(null);

    try {
      const res = await fetch('/api/user/membership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId: pkg.id,
          paymentMethod: 'qris',
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setUpgradeError(data.error || 'Gagal membuat invoice QRIS.');
        setIsProcessingUpgrade(false);
        return;
      }

      if (data.redirectUrl) {
        router.push(data.redirectUrl);
      } else if (data.orderCode) {
        router.push(`/order/${data.orderCode}`);
      }
    } catch {
      setUpgradeError('Terjadi kesalahan koneksi saat membuat pembayaran.');
      setIsProcessingUpgrade(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-16 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#FFDE00]" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-lg w-full mx-auto px-4 py-16 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-yellow-100 text-[#121212] flex items-center justify-center mx-auto">
            <UserIcon className="w-7 h-7 text-yellow-800" />
          </div>
          <h1 className="text-xl font-black text-gray-900">Masuk ke Akun Anda</h1>
          <p className="text-xs text-gray-500">
            Akses saldo akun, status VIP membership, dan riwayat pesanan Anda di Dafung Hub.
          </p>
          <button
            onClick={() => openAuthModal('login')}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#121212] hover:bg-[#252525] text-white font-black text-xs shadow-md transition-all cursor-pointer"
          >
            <span>Masuk / Daftar Akun</span>
            <ArrowRight className="w-4 h-4 text-[#FFDE00]" />
          </button>
        </main>
        <Footer />
      </div>
    );
  }

  const isVip = Boolean(
    membershipData?.isVip ?? (customer.membership_tier === 'vip')
  );

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8 sm:py-12 space-y-8">
        {/* Success Alert Banner */}
        {upgradeSuccess && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>{upgradeSuccess}</span>
            </div>
            <button
              onClick={() => setUpgradeSuccess(null)}
              className="px-2 py-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-900 cursor-pointer"
            >
              Tutup
            </button>
          </div>
        )}

        {/* Error Alert Banner */}
        {upgradeError && (
          <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs font-bold flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
            <span>{upgradeError}</span>
            <button
              onClick={() => setUpgradeError(null)}
              className="px-2 py-1 text-[11px] font-bold text-red-700 hover:text-red-900 cursor-pointer"
            >
              Tutup
            </button>
          </div>
        )}

        {/* Profile Header Card */}
        <div className="bg-white rounded-3xl border border-gray-200 p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-[#121212] text-white flex items-center justify-center text-2xl font-black shadow-md shrink-0">
              {customer.avatar_url ? (
                <img
                  src={customer.avatar_url}
                  alt={customer.name || ''}
                  className="w-full h-full rounded-2xl object-cover"
                />
              ) : (
                (customer.name?.[0] || customer.username?.[0] || customer.email?.[0] || 'U').toUpperCase()
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-xl font-black text-[#121212]">
                  {customer.name || 'Pelanggan Dafung Hub'}
                </h1>
                {customer.username && (
                  <span className="px-2 py-0.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-mono font-bold">
                    @{customer.username}
                  </span>
                )}
                {isVip ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-[#FFDE00] text-[#121212] text-[10px] font-black inline-flex items-center gap-1 shadow-sm">
                    <Crown className="w-3 h-3 fill-current" /> MEMBER VIP
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-bold">
                    Reguler
                  </span>
                )}
              </div>

              {/* ID Pelanggan with Copy */}
              <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500">
                <span className="inline-flex items-center gap-1.5 font-mono bg-gray-50 border border-gray-200 px-2.5 py-0.5 rounded-md text-[11px] text-gray-700 font-bold">
                  ID: <code>{displayId}</code>
                  <button
                    type="button"
                    onClick={handleCopyId}
                    className="hover:text-black transition-colors cursor-pointer"
                    title="Salin ID Pelanggan"
                  >
                    {copiedId ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Copy className="w-3 h-3 text-gray-400 hover:text-gray-700" />
                    )}
                  </button>
                </span>
                {customer.email && <span className="text-gray-400">• {customer.email}</span>}
                {customer.phone && <span className="text-gray-400">• {customer.phone}</span>}
              </div>
            </div>
          </div>

          <div className="flex sm:flex-col gap-2 w-full sm:w-auto">
            <Link
              href="/orders"
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-800 font-bold text-xs shadow-sm transition-all"
            >
              <PackageCheck className="w-4 h-4 text-[#3AA8E8]" />
              <span>Riwayat Pesanan</span>
            </Link>

            <button
              onClick={() => logout()}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-red-600 bg-red-50 hover:bg-red-100 font-bold text-xs transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Keluar</span>
            </button>
          </div>
        </div>

        {/* Dual Cards: Saldo & Membership Status */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Saldo Akun */}
          <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Wallet className="w-4 h-4 text-emerald-600" /> Saldo Dompet Akun
                </span>
                <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-extrabold">
                  Aktif
                </span>
              </div>

              <div>
                <span className="text-3xl sm:text-4xl font-black text-[#121212] block">
                  {formatRupiah(customer.balance)}
                </span>
                <span className="text-[11px] text-gray-500 mt-1 block">
                  Hemat <b>Rp 200</b> untuk setiap pembelian akun jika dibayar menggunakan Saldo!
                </span>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold text-gray-800">
                  Isi Ulang Saldo Akun:
                </span>
                <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">
                  QRIS Otomatis 24 Jam
                </span>
              </div>

              {/* Quick Preset Buttons */}
              <div className="grid grid-cols-3 gap-1.5">
                {[10000, 25000, 50000, 100000, 200000, 500000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => openTopUpModal(amt)}
                    className="py-2 px-1 text-center rounded-xl border border-gray-200 bg-gray-50 hover:bg-[#121212] hover:text-[#FFDE00] text-gray-800 text-xs font-bold transition-all shadow-2xs cursor-pointer"
                  >
                    {amt >= 100000
                      ? `Rp ${(amt / 1000).toLocaleString('id-ID')}k`
                      : `Rp ${amt.toLocaleString('id-ID')}`}
                  </button>
                ))}
              </div>

              {/* Main Top-Up Button */}
              <button
                type="button"
                onClick={() => openTopUpModal()}
                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-[#121212] hover:bg-[#252525] active:scale-[0.99] text-white font-extrabold text-xs shadow-md transition-all cursor-pointer"
              >
                <Wallet className="w-4 h-4 text-[#FFDE00]" />
                <span>Top-Up Saldo Instan (QRIS)</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#FFDE00]" />
              </button>
            </div>
          </div>

          {/* Card 2: VIP Membership Status */}
          <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Crown className="w-4 h-4 text-amber-500 fill-amber-500/20" /> Status Keanggotaan
                </span>
                {isVip ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-[#FFDE00] text-[#121212] text-[10px] font-black shadow-sm">
                    VIP AKTIF
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-bold">
                    REGULER
                  </span>
                )}
              </div>

              {isVip ? (
                <div className="space-y-2">
                  <div className="text-2xl font-black text-[#121212]">
                    Status VIP Premium
                  </div>
                  {membershipData?.formattedExpiresAt || customer.membership_expires_at ? (
                    <div className="flex items-center gap-1.5 text-xs text-gray-600">
                      <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span>
                        Aktif hingga:{' '}
                        <b>
                          {membershipData?.formattedExpiresAt ||
                            new Date(customer.membership_expires_at!).toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })}
                        </b>{' '}
                        {membershipData?.daysRemaining !== undefined && (
                          <span className="text-amber-700 font-extrabold">
                            (Sisa {membershipData.daysRemaining} hari)
                          </span>
                        )}
                      </span>
                    </div>
                  ) : null}

                  {/* Weekly Quota Bar */}
                  {membershipData && (
                    <div className="pt-2 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-gray-500">Kuota Diskon Mingguan:</span>
                        <span className="font-extrabold text-gray-800">
                          {formatRupiah(membershipData.remainingWeeklyQuota)} / {formatRupiah(membershipData.weeklyLimit)}
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className="h-full bg-[#FFDE00] rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(
                                0,
                                (membershipData.remainingWeeklyQuota / (membershipData.weeklyLimit || 20000)) * 100
                              )
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="text-xl font-black text-[#121212]">
                    Belum Jadi Member VIP
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Upgrade ke VIP untuk mendapatkan potongan langsung Rp 1.000 pada setiap akun digital!
                  </p>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-gray-100 space-y-2">
              <a
                href="#membership"
                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-extrabold text-xs shadow-md transition-all cursor-pointer"
              >
                <Crown className="w-4 h-4 fill-current" />
                <span>{isVip ? 'Perpanjang Masa Aktif VIP' : 'Upgrade ke VIP Sekarang'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>

        {/* Section: Kelola Paket VIP Membership */}
        <section id="membership" className="space-y-6 pt-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-gray-200 pb-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-black uppercase tracking-wider mb-2">
                <Crown className="w-3.5 h-3.5 fill-current" />
                <span>Langganan VIP Membership</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-[#121212]">
                Pilih Durasi Paket VIP Anda
              </h2>
              <p className="text-xs text-gray-500 mt-1 max-w-xl">
                Dapatkan potongan otomatis <b>Rp 1.000</b> untuk setiap akun digital yang Anda beli, antrean pesanan prioritas, dan garansi ekspres.
              </p>
            </div>

            <div className="text-right hidden sm:block">
              <span className="text-xs font-bold text-gray-400 block">Metode Pembayaran:</span>
              <span className="text-xs font-extrabold text-gray-800">
                Saldo Akun (Instan) atau QRIS
              </span>
            </div>
          </div>

          {/* Package Selection Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {packages.map((pkg) => {
              const isSelected = selectedPackage?.id === pkg.id;
              const is12m = pkg.durationMonths === 12;

              return (
                <div
                  key={pkg.id}
                  onClick={() => setSelectedPackage(pkg)}
                  className={`relative rounded-3xl border p-5 flex flex-col justify-between transition-all cursor-pointer bg-white ${
                    isSelected
                      ? 'border-[#121212] ring-2 ring-[#121212] shadow-lg scale-[1.02]'
                      : 'border-gray-200 hover:border-gray-400 shadow-sm hover:shadow-md'
                  }`}
                >
                  {is12m && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[10px] font-black px-3 py-0.5 rounded-full shadow-md flex items-center gap-1 whitespace-nowrap">
                      <Flame className="w-3 h-3 fill-current" /> PALING HEMAT
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-gray-800">{pkg.badge}</span>
                      <span className="text-[10px] text-gray-400 font-bold">
                        {pkg.durationDays} Hari
                      </span>
                    </div>

                    <div>
                      <span className="text-2xl font-black text-[#121212]">
                        {formatRupiah(pkg.price)}
                      </span>
                      <span className="text-[10px] text-gray-400 block">
                        ≈ Rp {Math.round(pkg.price / pkg.durationMonths).toLocaleString('id-ID')} / bulan
                      </span>
                    </div>

                    <p className="text-[11px] text-gray-600 leading-relaxed">{pkg.tagline}</p>
                  </div>

                  <div className="pt-4 border-t border-gray-100 mt-4 space-y-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPackage(pkg);
                      }}
                      className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#121212] text-[#FFDE00]'
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                      }`}
                    >
                      <span>{isSelected ? 'Paket Terpilih' : 'Pilih Paket'}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Box when Package is Selected */}
          {selectedPackage && (
            <div className="p-6 rounded-3xl bg-white border border-[#121212] shadow-xl space-y-5 animate-in fade-in zoom-in-95">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
                <div>
                  <span className="text-xs font-bold text-amber-700 uppercase tracking-wider block">
                    Konfirmasi Pembelian VIP
                  </span>
                  <h3 className="text-xl font-black text-gray-900">
                    {selectedPackage.name} ({selectedPackage.durationDays} Hari)
                  </h3>
                  <p className="text-xs text-gray-500">{selectedPackage.tagline}</p>
                </div>

                <div className="text-left sm:text-right">
                  <span className="text-xs text-gray-400 block">Total Tagihan:</span>
                  <span className="text-2xl font-black text-[#121212]">
                    {formatRupiah(selectedPackage.price)}
                  </span>
                </div>
              </div>

              {/* Payment Methods Choice */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Method 1: Saldo Akun */}
                <div
                  className={`p-4 rounded-2xl border transition-all ${
                    customer.balance >= selectedPackage.price
                      ? 'border-emerald-200 bg-emerald-50/50'
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-extrabold text-gray-800 flex items-center gap-1.5">
                      <Wallet className="w-4 h-4 text-emerald-600" /> Bayar dengan Saldo Akun
                    </span>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                      Instan & Gratis Biaya
                    </span>
                  </div>

                  <p className="text-xs text-gray-600 mb-3">
                    Saldo saat ini: <b>{formatRupiah(customer.balance)}</b>
                  </p>

                  {customer.balance >= selectedPackage.price ? (
                    <button
                      type="button"
                      disabled={isProcessingUpgrade}
                      onClick={() => handleUpgradeWithBalance(selectedPackage)}
                      className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {isProcessingUpgrade ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Aktifkan Langsung Pakai Saldo</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-[11px] text-amber-800 font-bold">
                        Saldo kurang {formatRupiah(selectedPackage.price - customer.balance)}.
                      </p>
                      <button
                        type="button"
                        onClick={() => openTopUpModal(selectedPackage.price - customer.balance)}
                        className="w-full py-2 rounded-xl bg-gray-900 hover:bg-black text-[#FFDE00] font-extrabold text-xs shadow-sm transition-all cursor-pointer"
                      >
                        Top-Up Saldo Sekarang
                      </button>
                    </div>
                  )}
                </div>

                {/* Method 2: QRIS */}
                <div className="p-4 rounded-2xl border border-gray-200 bg-gray-50/50 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-extrabold text-gray-800 flex items-center gap-1.5">
                        <QrCode className="w-4 h-4 text-blue-600" /> Bayar dengan QRIS
                      </span>
                      <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                        Semua E-Wallet & Bank
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mb-3">
                      Scan QRIS dari GoPay, OVO, Dana, ShopeePay, BCA, Mandiri, BRI, dll. Aktif otomatis dalam hitungan detik.
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={isProcessingUpgrade}
                    onClick={() => handleUpgradeWithQris(selectedPackage)}
                    className="w-full py-2.5 rounded-xl bg-[#121212] hover:bg-[#252525] text-[#FFDE00] font-extrabold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isProcessingUpgrade ? (
                      <Loader2 className="w-4 h-4 animate-spin text-[#FFDE00]" />
                    ) : (
                      <>
                        <QrCode className="w-4 h-4" />
                        <span>Lanjut Bayar via QRIS</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Exclusive VIP Perks Grid */}
          <div className="bg-white rounded-3xl border border-gray-200 p-6 sm:p-8 shadow-sm space-y-6">
            <h3 className="text-base sm:text-lg font-black text-gray-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              <span>Keuntungan Eksklusif Anggota VIP Dafung Hub</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-1.5">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center">
                  <Tag className="w-4 h-4" />
                </div>
                <h4 className="font-extrabold text-xs text-gray-900">Potongan Rp 1.000 / Produk</h4>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Hemat Rp 1.000 langsung untuk setiap akun digital Netflix, Spotify, Canva, ChatGPT, dll.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-1.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-900 flex items-center justify-center">
                  <Zap className="w-4 h-4" />
                </div>
                <h4 className="font-extrabold text-xs text-gray-900">Antrean Prioritas Otomatis</h4>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Pesanan manual diproses paling depan saat terjadi lonjakan antrean transaksi.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-1.5">
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-900 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <h4 className="font-extrabold text-xs text-gray-900">Garansi & Fast Response</h4>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Klaim garansi dan penggantian kredensial akun digital ditangani dengan cepat oleh tim CS.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
