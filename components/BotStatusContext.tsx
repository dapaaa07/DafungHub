'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

export type BotStatus = 'online' | 'maintenance';

interface BotStatusContextValue {
  botStatus: BotStatus;
  refreshStatus: () => Promise<void>;
}

const BotStatusContext = createContext<BotStatusContextValue>({
  botStatus: 'online',
  refreshStatus: async () => {},
});

export function BotStatusProvider({
  initialStatus = 'online',
  children,
}: {
  initialStatus?: BotStatus;
  children: React.ReactNode;
}) {
  const [botStatus, setBotStatus] = useState<BotStatus>(initialStatus);
  const lastFetchedRef = useRef<number>(0);

  const fetchLatestStatus = async (force = false) => {
    if (!force && typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      return;
    }
    const now = Date.now();
    if (!force && now - lastFetchedRef.current < 15_000) {
      return;
    }
    lastFetchedRef.current = now;

    try {
      const res = await fetch('/api/bot-status', {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.status === 'online' || data?.status === 'maintenance') {
          setBotStatus(data.status);
        }
      }
    } catch {
      // Ignore background fetch error
    }
  };

  useEffect(() => {
    fetchLatestStatus(true);

    // Poll every 60 seconds only while tab is visible
    const interval = setInterval(() => {
      fetchLatestStatus(false);
    }, 60_000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchLatestStatus(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <BotStatusContext.Provider value={{ botStatus, refreshStatus: () => fetchLatestStatus(true) }}>
      {children}
    </BotStatusContext.Provider>
  );
}

export function useBotStatus(): BotStatusContextValue {
  return useContext(BotStatusContext);
}
