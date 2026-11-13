import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { api, NotificationCheckData } from '../api/client';
import { useAuth } from './AuthContext';

// Configure foreground notification presentation
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
});

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
  testNotification: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType>({
  pendingCount: 0,
  latestNotification: null,
  clearNotification: () => {},
  refreshNotifications: async () => {},
  testNotification: async () => {},
});

export const useNotifications = () => useContext(NotificationContext);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [latestNotification, setLatestNotification] = useState<OrderNotification | null>(null);
  const lastCheckTimeRef = useRef<string>(new Date(Date.now() - 60000).toISOString());
  const seenOrderCodesRef = useRef<Set<string>>(new Set());
  const isInitialCheckRef = useRef<boolean>(true);

  // Setup Android notification channel & request permission
  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('dafung-orders', {
            name: 'Pesanan Baru Dafung Hub',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 500, 200, 500],
            lightColor: '#008CFF',
            sound: 'default',
            enableVibrate: true,
            showBadge: true,
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
            bypassDnd: true,
          });
        }
        await Notifications.requestPermissionsAsync();
      } catch (e) {
        console.warn('Failed to configure notifications channel:', e);
      }
    })();
  }, []);

  // Register Expo push token when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    (async () => {
      try {
        const tokenData = await Notifications.getExpoPushTokenAsync({
          projectId: 'c0bab3ff-5f86-4402-81da-724147f1615d',
        });
        if (tokenData?.data) {
          await api.registerPushToken(tokenData.data);
        }
      } catch (e) {
        // FCM might not be configured in standalone release build
        console.log('Expo push token registration skipped/failed:', e);
      }
    })();
  }, [isAuthenticated]);

  const checkOrders = async () => {
    if (!isAuthenticated) return;

    try {
      const data: NotificationCheckData = await api.checkNotifications(lastCheckTimeRef.current);
      setPendingCount(data.pendingFulfillmentCount || 0);
      lastCheckTimeRef.current = data.serverTime || new Date().toISOString();

      if (data.newPaidOrders && data.newPaidOrders.length > 0) {
        const now = Date.now();
        // Find orders we haven't alerted for yet
        const unnotified = data.newPaidOrders.filter((o) => {
          if (seenOrderCodesRef.current.has(o.orderCode)) return false;
          // If initial check on app boot, only alert orders paid in the last 15 minutes
          if (isInitialCheckRef.current) {
            const ageMs = now - new Date(o.createdAt).getTime();
            return ageMs < 15 * 60 * 1000;
          }
          return true;
        });

        // Mark all current orders as seen so they won't repeat
        data.newPaidOrders.forEach((o) => seenOrderCodesRef.current.add(o.orderCode));
        isInitialCheckRef.current = false;

        if (unnotified.length > 0) {
          const newest = unnotified[0];
          console.log('[NotificationContext] Alerting for new order:', newest.orderCode);

          const customerDisplay = newest.customer.username
            ? `@${newest.customer.username}`
            : newest.customer.firstName || newest.customer.telegramId;

          setLatestNotification({
            id: newest.id,
            orderCode: newest.orderCode,
            productName: newest.productName,
            price: newest.price,
            formattedPrice: newest.formattedPrice,
            customerName: customerDisplay,
            timestamp: newest.createdAt,
          });

          // Haptic alert on device
          try {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {
            // Ignore if haptics unsupported
          }

          // Native Android System Notification with channelId in trigger
          try {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: '🔔 Pesanan Baru Masuk!',
                body: `${newest.productName} (${newest.formattedPrice}) dari ${customerDisplay}`,
                data: { orderCode: newest.orderCode },
                sound: 'default',
              },
              trigger: {
                seconds: 1,
                channelId: 'dafung-orders',
              },
            });
          } catch (notifErr) {
            console.warn('Native notification error:', notifErr);
          }
        }
      } else {
        if (isInitialCheckRef.current) {
          isInitialCheckRef.current = false;
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

    // Poll every 5 seconds for fast real-time notifications
    const interval = setInterval(() => {
      checkOrders();
    }, 5000);

    // Refresh immediately when app returns to foreground
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        checkOrders();
      }
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [isAuthenticated]);

  const clearNotification = () => {
    setLatestNotification(null);
  };

  const refreshNotifications = async () => {
    await checkOrders();
  };

  const testNotification = async () => {
    const dummy: OrderNotification = {
      id: 'test-' + Date.now(),
      orderCode: 'ORD-TES-' + Math.floor(Math.random() * 89999 + 10000),
      productName: 'Canva Pro 1 Bulan (Tes Notifikasi)',
      price: 15000,
      formattedPrice: 'Rp 15.000',
      customerName: '@DappaSecc',
      timestamp: new Date().toISOString(),
    };

    setLatestNotification(dummy);

    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Ignore
    }

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🔔 Pesanan Baru Masuk!',
          body: `${dummy.productName} (${dummy.formattedPrice}) dari ${dummy.customerName}`,
          data: { orderCode: dummy.orderCode },
          sound: 'default',
        },
        trigger: {
          seconds: 1,
          channelId: 'dafung-orders',
        },
      });
    } catch (err) {
      console.warn('Test notification error:', err);
    }
  };

  return (
    <NotificationContext.Provider
      value={{
        pendingCount,
        latestNotification,
        clearNotification,
        refreshNotifications,
        testNotification,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};
