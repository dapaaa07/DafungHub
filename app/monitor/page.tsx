'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  HardDrive,
  KeyRound,
  LogOut,
  MemoryStick,
  Pause,
  Play,
  RefreshCw,
  Server,
  ShieldCheck,
} from 'lucide-react';
import Footer from '@/components/Footer';
import type { ServerHealthSnapshot } from '@/lib/server-health';

const ADMIN_KEY_STORAGE = 'dafung_monitor_admin_key';
const MAX_HISTORY_POINTS = 24;

function getBarColor(percent: number): string {
  if (percent >= 85) return 'bg-red-500';
  if (percent >= 70) return 'bg-amber-500';
  return 'bg-emerald-500';
}

export default function ServerMonitorPage() {
  const [adminKey, setAdminKey] = useState<string>('');
  const [keyInput, setKeyInput] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [health, setHealth] = useState<ServerHealthSnapshot | null>(null);
  const [rssHistory, setRssHistory] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const mountedRef = useRef<boolean>(true);

  const fetchHealth = useCallback(async (keyToUse: string, silent = false) => {
    if (!keyToUse) return;
    if (!silent) setIsLoading(true);
    try {
      const res = await fetch('/api/admin/health', {
        headers: {
          'x-admin-key': keyToUse,
          'Cache-Control': 'no-cache',
        },
        cache: 'no-store',
      });
      const data = await res.json();
      if (!mountedRef.current) return;

      if (res.status === 401) {
        setError('Kunci Admin tidak valid. Periksa kembali ADMIN_API_KEY Anda.');
        setIsAuthenticated(false);
        setHealth(null);
        localStorage.removeItem(ADMIN_KEY_STORAGE);
        return;
      }

      if (!res.ok || !data.success || !data.health) {
        setError(data.error || 'Gagal memuat metrik server.');
        return;
      }

      const snap = data.health as ServerHealthSnapshot;
      setHealth(snap);
      setIsAuthenticated(true);
      setError(null);
      setLastUpdated(
        new Date(snap.timestamp).toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
      setRssHistory((prev) => [...prev.slice(-(MAX_HISTORY_POINTS - 1)), snap.process.rssMb]);
    } catch {
      if (mountedRef.current) {
        setError('Tidak dapat terhubung ke server. Periksa koneksi atau status PM2.');
      }
    } finally {
      if (mountedRef.current && !silent) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    try {
      const saved = localStorage.getItem(ADMIN_KEY_STORAGE);
      if (saved) {
        setAdminKey(saved);
        fetchHealth(saved, false);
      }
    } catch {
      // Ignore storage error
    }
    return () => {
      mountedRef.current = false;
    };
  }, [fetchHealth]);

  useEffect(() => {
    if (!isAuthenticated || !adminKey || !autoRefresh) return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchHealth(adminKey, true);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [isAuthenticated, adminKey, autoRefresh, fetchHealth]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    setError(null);
    setAdminKey(trimmed);
    try {
      localStorage.setItem(ADMIN_KEY_STORAGE, trimmed);
    } catch {
      // Ignore
    }
    await fetchHealth(trimmed, false);
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem(ADMIN_KEY_STORAGE);
    } catch {
      // Ignore
    }
    setAdminKey('');
    setKeyInput('');
    setIsAuthenticated(false);
    setHealth(null);
    setRssHistory([]);
    setError(null);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-[calc(100vh-5rem)] bg-[#F8F9FA] text-[#121212] flex flex-col">
        <main className="flex-1 flex items-center justify-center px-4 py-14">
          <div className="w-full max-w-md bg-white rounded-3xl border border-gray-200 shadow-sm p-7 sm:p-9 space-y-6">
            <div className="text-center space-y-2.5">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-[#121212] text-[#FFDE00] flex items-center justify-center shadow-sm">
                <Server className="w-7 h-7" />
              </div>
              <h1 className="text-xl font-black text-[#121212]">Monitor Resource Hosting</h1>
              <p className="text-xs text-gray-500 leading-relaxed">
                Masukkan <code className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-800 font-mono">ADMIN_API_KEY</code> untuk memantau RAM, CPU, Disk, dan Database secara realtime.
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="adminKeyInput" className="block text-xs font-bold text-gray-700">
                  Kunci Admin (ADMIN_API_KEY)
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="adminKeyInput"
                    type="password"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder="Masukkan ADMIN_API_KEY..."
                    required
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:border-[#121212] focus:outline-none text-sm font-mono bg-gray-50 focus:bg-white transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 rounded-xl bg-[#121212] hover:bg-[#252525] disabled:opacity-60 text-white text-xs sm:text-sm font-bold shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-[#FFDE00]" />
                <span>{isLoading ? 'Memverifikasi...' : 'Buka Monitor Server'}</span>
              </button>
            </form>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const maxRssInChart = Math.max(
    health?.process.softLimitMb || 450,
    ...rssHistory,
    100
  );

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-[#F8F9FA] text-[#121212] flex flex-col">
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 sm:py-10 space-y-6">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-[#121212] tracking-tight">
                Monitor Resource Hosting
              </h1>
              {health && (
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wide border ${
                    health.status === 'healthy'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : health.status === 'warning'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-red-50 text-red-700 border-red-200'
                  }`}
                >
                  {health.status === 'healthy'
                    ? 'Normal'
                    : health.status === 'warning'
                      ? 'Waspada'
                      : 'Kritis'}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {health?.statusMessage || 'Memuat telemetri server...'}
              {lastUpdated ? ` • Pembaruan terakhir: ${lastUpdated}` : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAutoRefresh((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                autoRefresh
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
              }`}
            >
              {autoRefresh ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{autoRefresh ? 'Auto 5s: Aktif' : 'Auto 5s: Jeda'}</span>
            </button>

            <button
              type="button"
              onClick={() => fetchHealth(adminKey, false)}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#121212] hover:bg-[#252525] text-white text-xs font-bold transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#FFDE00] ${isLoading ? 'animate-spin' : ''}`} />
              <span>Segarkan</span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-red-50 text-red-600 border border-gray-200 hover:border-red-200 text-xs font-bold transition-colors cursor-pointer"
              title="Keluar dari monitor"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Keluar</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {health && (
          <>
            {/* Top Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Node.js / PM2 Memory Card */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 space-y-4 shadow-2xs">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#121212] text-[#FFDE00] flex items-center justify-center shrink-0">
                      <MemoryStick className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-sm font-extrabold text-[#121212]">RAM Aplikasi (Node.js / PM2)</h2>
                      <p className="text-[11px] text-gray-500">
                        Auto-restart PM2 di {health.process.softLimitMb} MB • V8 Cap 384 MB
                      </p>
                    </div>
                  </div>
                  <span className="text-lg font-black text-[#121212] font-mono">
                    {health.process.rssMb} MB
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="w-full h-3 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${getBarColor(
                        health.process.rssPercentOfSoftLimit
                      )}`}
                      style={{ width: `${Math.min(100, health.process.rssPercentOfSoftLimit)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-semibold text-gray-500">
                    <span>{health.process.rssPercentOfSoftLimit}% dari batas aman {health.process.softLimitMb} MB</span>
                    <span>Heap: {health.process.heapUsedMb} / {health.process.heapTotalMb} MB</span>
                  </div>
                </div>

                {/* Live RSS Trend Bars */}
                <div className="pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                    <span>Tren RAM Live ({rssHistory.length} sampel)</span>
                    <span>Eksternal: {health.process.externalMb} MB</span>
                  </div>
                  <div className="h-14 flex items-end gap-1 bg-gray-50 rounded-xl p-2 border border-gray-100">
                    {rssHistory.map((val, idx) => {
                      const heightPct = Math.max(8, Math.round((val / maxRssInChart) * 100));
                      return (
                        <div
                          key={idx}
                          title={`${val} MB`}
                          className="flex-1 rounded-sm bg-[#121212]/80 hover:bg-[#FFDE00] transition-all"
                          style={{ height: `${heightPct}%` }}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Account Memory Quota Card */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 space-y-4 shadow-2xs">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#FFDE00]/25 text-[#121212] flex items-center justify-center shrink-0">
                      <Activity className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-sm font-extrabold text-[#121212]">
                        {health.accountMemory.source === 'process_estimate'
                          ? 'RAM Proses vs Kuota 1.5 GB'
                          : 'RAM Akun Hosting (cgroup)'}
                      </h2>
                      <p className="text-[11px] text-gray-500">
                        Kuota layanan: {health.accountMemory.limitMb} MB • Host RAM: {health.host.ramPercent}%
                      </p>
                    </div>
                  </div>
                  <span className="text-lg font-black text-[#121212] font-mono">
                    {health.accountMemory.percent}%
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="w-full h-3 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${getBarColor(
                        health.accountMemory.percent
                      )}`}
                      style={{ width: `${Math.min(100, health.accountMemory.percent)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-semibold text-gray-500">
                    <span>Terpakai: {health.accountMemory.usedMb} MB</span>
                    <span>Batas: {health.accountMemory.limitMb} MB</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-gray-100 grid grid-cols-2 gap-3 text-xs">
                  <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-100">
                    <span className="text-[10px] font-bold uppercase text-gray-400 block">Uptime Proses</span>
                    <span className="font-extrabold text-[#121212] flex items-center gap-1.5 mt-0.5">
                      <Clock className="w-3.5 h-3.5 text-[#3AA8E8]" />
                      {health.process.uptimeFormatted}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-100">
                    <span className="text-[10px] font-bold uppercase text-gray-400 block">Runtime</span>
                    <span className="font-extrabold text-[#121212] font-mono mt-0.5 block">
                      {health.process.nodeVersion} (PID {health.process.pid})
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Secondary Metrics Row: CPU, Disk, Database */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* CPU & Load */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Cpu className="w-4 h-4 text-[#3AA8E8]" />
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-700">
                      CPU Load Host
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono font-bold text-gray-500">
                    {health.host.cpuCores} core
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-xl bg-gray-50 border border-gray-100">
                    <span className="text-[10px] text-gray-400 font-bold block">1 Menit</span>
                    <span className="text-sm font-black font-mono text-[#121212]">{health.host.loadAvg1m}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-gray-50 border border-gray-100">
                    <span className="text-[10px] text-gray-400 font-bold block">5 Menit</span>
                    <span className="text-sm font-black font-mono text-[#121212]">{health.host.loadAvg5m}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-gray-50 border border-gray-100">
                    <span className="text-[10px] text-gray-400 font-bold block">15 Menit</span>
                    <span className="text-sm font-black font-mono text-[#121212]">{health.host.loadAvg15m}</span>
                  </div>
                </div>
                <p className="text-[11px] text-gray-400 truncate font-mono">
                  {health.host.hostname} ({health.host.platform})
                </p>
              </div>

              {/* Disk */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <HardDrive className="w-4 h-4 text-amber-600" />
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-700">
                      Penyimpanan Disk
                    </h3>
                  </div>
                  <span className="text-xs font-mono font-black text-[#121212]">
                    {health.disk.available ? `${health.disk.percent}%` : 'N/A'}
                  </span>
                </div>
                {health.disk.available ? (
                  <>
                    <div className="w-full h-2.5 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${getBarColor(
                          health.disk.percent
                        )}`}
                        style={{ width: `${Math.min(100, health.disk.percent)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-semibold text-gray-500">
                      <span>Terpakai: {health.disk.usedGb} GB</span>
                      <span>Sisa: {health.disk.freeGb} GB</span>
                    </div>
                    <p className="text-[11px] text-gray-400">
                      Total partisi: {health.disk.totalGb} GB
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-gray-400">Metrik disk tidak tersedia pada lingkungan ini.</p>
                )}
              </div>

              {/* Database Pool */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Database className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-700">
                      Database Pool
                    </h3>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-extrabold ${
                      health.database.connected ? 'text-emerald-600' : 'text-red-600'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {health.database.connected ? `${health.database.latencyMs} ms` : 'Terputus'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-xl bg-gray-50 border border-gray-100">
                    <span className="text-[10px] text-gray-400 font-bold block">Total</span>
                    <span className="text-sm font-black font-mono text-[#121212]">
                      {health.database.totalConnections}/{health.database.maxConnections}
                    </span>
                  </div>
                  <div className="p-2 rounded-xl bg-gray-50 border border-gray-100">
                    <span className="text-[10px] text-gray-400 font-bold block">Idle</span>
                    <span className="text-sm font-black font-mono text-[#121212]">
                      {health.database.idleConnections}
                    </span>
                  </div>
                  <div className="p-2 rounded-xl bg-gray-50 border border-gray-100">
                    <span className="text-[10px] text-gray-400 font-bold block">Antri</span>
                    <span className="text-sm font-black font-mono text-[#121212]">
                      {health.database.waitingClients}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-gray-400">
                  Supabase Transaction Pooler (maks 5 koneksi/proses)
                </p>
              </div>
            </div>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
