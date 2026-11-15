'use client';

import React, { useState, useEffect } from 'react';
import { X, Mail, Phone, Lock, Eye, EyeOff, User as UserIcon, AlertCircle, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { useCustomerAuth } from './CustomerAuthContext';

export default function AuthModal() {
  const {
    isAuthModalOpen,
    authModalMode,
    closeAuthModal,
    setAuthModalMode,
    login,
    register,
  } = useCustomerAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAuthModal();
    };
    if (isAuthModalOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
      setErrorMessage('');
    }
    return () => {
      document.body.style.overflow = 'auto';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isAuthModalOpen, closeAuthModal]);

  if (!isAuthModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsLoading(true);

    try {
      if (authModalMode === 'login') {
        const res = await login(identifier, password);
        if (!res.success) {
          setErrorMessage(res.error || 'Identitas atau password salah.');
        }
      } else {
        const res = await register(identifier, password, name);
        if (!res.success) {
          setErrorMessage(res.error || 'Pendaftaran gagal. Silakan coba kembali.');
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeAuthModal();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden my-auto max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Ribbon */}
        <div className="bg-[#121212] text-white p-4 sm:p-5 flex items-center justify-between border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FFDE00]" />
            <span className="font-extrabold text-sm tracking-wide text-gray-200">
              {authModalMode === 'login' ? 'Masuk ke Akun Dafung Hub' : 'Daftar Akun Baru'}
            </span>
          </div>
          <button
            onClick={closeAuthModal}
            className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 active:bg-white/35 text-white flex items-center justify-center transition-all border border-white/20 shrink-0"
            aria-label="Tutup popup"
          >
            <X className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {/* Mode Switch Tabs */}
          <div className="grid grid-cols-2 p-1 bg-gray-100 rounded-2xl">
            <button
              type="button"
              onClick={() => {
                setAuthModalMode('login');
                setErrorMessage('');
              }}
              className={`py-2 text-xs sm:text-sm font-bold rounded-xl transition-all ${
                authModalMode === 'login'
                  ? 'bg-white text-[#121212] shadow-sm'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              Masuk
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthModalMode('register');
                setErrorMessage('');
              }}
              className={`py-2 text-xs sm:text-sm font-bold rounded-xl transition-all ${
                authModalMode === 'register'
                  ? 'bg-white text-[#121212] shadow-sm'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              Daftar Akun
            </button>
          </div>

          {/* Google 1-Click OAuth Button */}
          <div>
            <a
              href="/api/auth/google"
              className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 active:scale-[0.99] text-gray-800 font-bold text-xs sm:text-sm shadow-sm transition-all"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                />
              </svg>
              <span>Lanjutkan dengan Akun Google</span>
            </a>
          </div>

          <div className="relative flex items-center justify-center">
            <div className="border-t border-gray-200 w-full" />
            <span className="bg-white px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider shrink-0">
              atau gunakan email / no hp
            </span>
            <div className="border-t border-gray-200 w-full" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {errorMessage && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-700 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{errorMessage}</span>
              </div>
            )}

            {authModalMode === 'register' && (
              <div className="space-y-1">
                <label className="block text-xs font-bold text-gray-700">
                  Nama Lengkap <span className="text-gray-400 font-normal">(opsional)</span>
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Contoh: Budi Santoso"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#FFDE00] focus:border-transparent transition-all"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-xs font-bold text-gray-700">
                Email atau No. WhatsApp
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="08123456789 atau nama@email.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#FFDE00] focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-gray-700">Password</label>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  minLength={6}
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#FFDE00] focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3 rounded-xl bg-[#121212] hover:bg-[#252525] active:scale-[0.99] text-white font-extrabold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#FFDE00]" />
                  <span>Memproses...</span>
                </>
              ) : (
                <>
                  <span>{authModalMode === 'login' ? 'Masuk ke Akun' : 'Daftar Sekarang'}</span>
                  <ArrowRight className="w-4 h-4 text-[#FFDE00]" />
                </>
              )}
            </button>
          </form>

          {/* Value Prop Footer */}
          <div className="p-3 bg-yellow-50/60 rounded-xl border border-yellow-100 flex items-center gap-2 text-[11px] text-yellow-900">
            <Sparkles className="w-4 h-4 text-yellow-600 shrink-0" />
            <span>
              Member VIP mendapatkan potongan harga otomatis dan riwayat akun tersimpan aman di website!
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
