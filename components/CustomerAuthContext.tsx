'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { CustomerProfile } from '@/lib/customer-auth';

interface CustomerAuthContextType {
  customer: CustomerProfile | null;
  isLoading: boolean;
  isAuthModalOpen: boolean;
  authModalMode: 'login' | 'register';
  isTopUpModalOpen: boolean;
  initialTopUpAmount?: number;
  openAuthModal: (mode?: 'login' | 'register') => void;
  closeAuthModal: () => void;
  openTopUpModal: (amount?: number) => void;
  closeTopUpModal: () => void;
  setAuthModalMode: (mode: 'login' | 'register') => void;
  login: (identifier: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (identifier: string, password: string, name?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshCustomer: () => Promise<void>;
}

const CustomerAuthContext = createContext<CustomerAuthContextType | undefined>(undefined);

const AUTH_CACHE_KEY = 'dafung_customer_profile';

function getCachedCustomer(): CustomerProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(AUTH_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function CustomerAuthProvider({ children }: { children: React.ReactNode }) {
  const [customer, setCustomer] = useState<CustomerProfile | null>(getCachedCustomer);
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return !Boolean(getCachedCustomer());
  });
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
  const [initialTopUpAmount, setInitialTopUpAmount] = useState<number | undefined>(undefined);

  const setCustomerState = useCallback((profile: CustomerProfile | null) => {
    setCustomer(profile);
    if (typeof window !== 'undefined') {
      try {
        if (profile) {
          localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(profile));
        } else {
          localStorage.removeItem(AUTH_CACHE_KEY);
        }
      } catch {}
    }
  }, []);

  const refreshCustomer = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (res.ok) {
        const data = await res.json();
        const profile = data.customer || data.user;
        if (profile) {
          setCustomerState(profile);
          return;
        }
      }
      setCustomerState(null);
    } catch {
      // Keep existing customer state on transient network failures
    } finally {
      setIsLoading(false);
    }
  }, [setCustomerState]);

  useEffect(() => {
    refreshCustomer();

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.get('auth') === 'success') {
        refreshCustomer();
        url.searchParams.delete('auth');
        window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
      }
    }
  }, [refreshCustomer]);

  const openAuthModal = useCallback((mode: 'login' | 'register' = 'login') => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false);
  }, []);

  const openTopUpModal = useCallback((amount?: number) => {
    if (!customer) {
      openAuthModal('login');
      return;
    }
    setInitialTopUpAmount(amount);
    setIsTopUpModalOpen(true);
  }, [customer, openAuthModal]);

  const closeTopUpModal = useCallback(() => {
    setIsTopUpModalOpen(false);
  }, []);

  const login = async (identifier: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Gagal masuk akun.' };
      }
      const profile = data.customer || data.user;
      if (profile) {
        setCustomerState(profile);
      }
      setIsAuthModalOpen(false);
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message || 'Terjadi kesalahan jaringan.' };
    }
  };

  const register = async (identifier: string, password: string, name?: string) => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password, name }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Gagal mendaftar akun.' };
      }
      const profile = data.customer || data.user;
      if (profile) {
        setCustomerState(profile);
      }
      setIsAuthModalOpen(false);
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message || 'Terjadi kesalahan jaringan.' };
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      console.warn('Logout network error:', err);
    } finally {
      setCustomerState(null);
    }
  };

  return (
    <CustomerAuthContext.Provider
      value={{
        customer,
        isLoading,
        isAuthModalOpen,
        authModalMode,
        isTopUpModalOpen,
        initialTopUpAmount,
        openAuthModal,
        closeAuthModal,
        openTopUpModal,
        closeTopUpModal,
        setAuthModalMode,
        login,
        register,
        logout,
        refreshCustomer,
      }}
    >
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth() {
  const context = useContext(CustomerAuthContext);
  if (!context) {
    throw new Error('useCustomerAuth must be used within a CustomerAuthProvider');
  }
  return context;
}
