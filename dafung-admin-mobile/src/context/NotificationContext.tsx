import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import { api, NotificationCheckData } from '../api/client';
import { useAuth } from './AuthContext';

export interface OrderNotification {
  id: string;
  orderCode: string;
  productName: string;
  price: number;
  formattedPrice: string;
  customerName: string;
  timestamp: string;
}

interface NotificationContextType {
  pendingCount: number;
  latestNotification: OrderNotification | null;
  clearNotification: () => void;
  refreshNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType>({
  pendingCount: 0,
  latestNotification: null,
  clearNotification: () => {},
  refreshNotifications: async () => {},
});

export const useNotifications = () => useContext(NotificationContext);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [latestNotification, setLatestNotification] = useState<OrderNotification | null>(null);
  const lastCheckTimeRef = useRef<string>(new Date(Date.now() - 60000).toISOString());
  const seenOrderCodesRef = useRef<Set<string>>(new Set());

  const checkOrders = async () => {
    if (!isAuthenticated) return;

    try {
      const data: NotificationCheckData = await api.checkNotifications(lastCheckTimeRef.current);
      setPendingCount(data.pendingFulfillmentCount || 0);
      lastCheckTimeRef.current = data.serverTime || new Date().toISOString();

      if (data.hasNewOrders && data.newPaidOrders?.length > 0) {
        // Find orders we haven't alerted for yet
        const unnotified = data.newPaidOrders.filter(
          (o) => !seenOrderCodesRef.current.has(o.orderCode)
        );

        if (unnotified.length > 0) {
          unnotified.forEach((o) => seenOrderCodesRef.current.add(o.orderCode));
          const newest = unnotified[0];

          setLatestNotification({
            id: newest.id,
            orderCode: newest.orderCode,
            productName: newest.productName,
            price: newest.price,
            formattedPrice: newest.formattedPrice,
            customerName: newest.customer.username
              ? `@${newest.customer.username}`
              : newest.customer.firstName || newest.customer.telegramId,
            timestamp: newest.createdAt,
          });

          // Haptic alert on device
          try {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {
            // Ignore if haptics unsupported
          }
        }
      }
    } catch {
      // Ignore background network errors
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;

    // Initial check
    checkOrders();

    // Poll every 10 seconds
    const interval = setInterval(() => {
      checkOrders();
    }, 10000);

    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const clearNotification = () => {
    setLatestNotification(null);
  };

  const refreshNotifications = async () => {
    await checkOrders();
  };

  return (
    <NotificationContext.Provider
      value={{
        pendingCount,
        latestNotification,
        clearNotification,
        refreshNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};
