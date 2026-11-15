'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { CustomerProfile } from '@/lib/customer-auth';

interface CustomerAuthContextType {
  customer: CustomerProfile | null;
  isLoading: boolean;
  isAuthModalOpen: boolean;
  authModalMode: 'login' | 'register';
  openAuthModal: (mode?: 'login' | 'register') => void;
  closeAuthModal: () => void;
  setAuthModalMode: (mode: 'login' | 'register') => void;
  login: (identifier: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (identifier: string, password: string, name?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshCustomer: () => Promise<void>;
}

const CustomerAuthContext = createContext<CustomerAuthContextType | undefined>(undefined);

export function CustomerAuthProvider({ children }: { children: React.ReactNode }) {
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');

  const refreshCustomer = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.customer) {
          setCustomer(data.customer);
          return;
        }
      }
      setCustomer(null);
    } catch {
      setCustomer(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCustomer();
  }, [refreshCustomer]);

  const openAuthModal = useCallback((mode: 'login' | 'register' = 'login') => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false);
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
      setCustomer(data.customer);
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
      setCustomer(data.customer);
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
      setCustomer(null);
    }
  };

  return (
    <CustomerAuthContext.Provider
      value={{
        customer,
        isLoading,
        isAuthModalOpen,
        authModalMode,
        openAuthModal,
        closeAuthModal,
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
