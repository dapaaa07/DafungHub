'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

export type BotStatus = 'online' | 'maintenance';

interface BotStatusContextValue {
  botStatus: BotStatus;
  refreshStatus: () => Promise<void>;
}

const BotStatusContext = createContext<BotStatusContextValue>({
  botStatus: 'online',
  refreshStatus: async () => {},
});

function getStatusEndpoint(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    // When running on shared hosting (e.g. store.dafung.web.id), point to Vercel API
    if (host.includes('dafung.web.id')) {
      return 'https://dafung-hub.vercel.app/api/bot-status';
    }
  }
  return '/api/bot-status';
}

export function BotStatusProvider({
  initialStatus = 'online',
  children,
}: {
  initialStatus?: BotStatus;
  children: React.ReactNode;
}) {
  const [botStatus, setBotStatus] = useState<BotStatus>(initialStatus);

  const fetchLatestStatus = async () => {
    try {
      const endpoint = getStatusEndpoint();
      const res = await fetch(endpoint, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.status === 'online' || data?.status === 'maintenance') {
          setBotStatus(data.status);
        }
      }
    } catch (err) {
      // Ignore background fetch error
    }
  };

  useEffect(() => {
    // 1. Fetch immediately on client mount
    fetchLatestStatus();

    // 2. Polling interval every 10 seconds
    const interval = setInterval(fetchLatestStatus, 10000);

    // 3. Refresh immediately when window/tab is focused
    const handleFocus = () => {
      fetchLatestStatus();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchLatestStatus();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <BotStatusContext.Provider value={{ botStatus, refreshStatus: fetchLatestStatus }}>
      {children}
    </BotStatusContext.Provider>
  );
}

export function useBotStatus(): BotStatusContextValue {
  return useContext(BotStatusContext);
}
