import fs from 'fs';
import os from 'os';
import { pool } from './db';

export interface ServerHealthSnapshot {
  status: 'healthy' | 'warning' | 'critical';
  statusMessage: string;
  timestamp: string;
  process: {
    pid: number;
    nodeVersion: string;
    uptimeSeconds: number;
    uptimeFormatted: string;
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
    externalMb: number;
    softLimitMb: number;
    rssPercentOfSoftLimit: number;
  };
  accountMemory: {
    source: 'cgroup_v2' | 'cgroup_v1' | 'process_estimate';
    usedMb: number;
    limitMb: number;
    percent: number;
  };
  host: {
    hostname: string;
    platform: string;
    cpuCores: number;
    loadAvg1m: number;
    loadAvg5m: number;
    loadAvg15m: number;
    ramTotalMb: number;
    ramUsedMb: number;
    ramFreeMb: number;
    ramPercent: number;
  };
  disk: {
    available: boolean;
    totalGb: number;
    usedGb: number;
    freeGb: number;
    percent: number;
  };
  database: {
    connected: boolean;
    latencyMs: number | null;
    totalConnections: number;
    idleConnections: number;
    waitingClients: number;
    maxConnections: number;
  };
}

const MB = 1024 * 1024;
const GB = 1024 * 1024 * 1024;
const DEFAULT_HOSTING_RAM_LIMIT_MB = Number(process.env.HOSTING_RAM_LIMIT_MB) || 1536;
const PM2_SOFT_LIMIT_MB = 450;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function readNumberFile(filePath: string): number | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw || raw === 'max') return null;
    const val = Number(raw);
    return Number.isFinite(val) && val > 0 ? val : null;
  } catch {
    return null;
  }
}

function readAccountMemory(processRssBytes: number, hostTotalBytes: number): ServerHealthSnapshot['accountMemory'] {
  // 1. Try Linux cgroup v2 (used by modern CloudLinux / containers)
  const v2Used = readNumberFile('/sys/fs/cgroup/memory.current');
  const v2Max = readNumberFile('/sys/fs/cgroup/memory.max');
  if (v2Used !== null && v2Max !== null && v2Max < hostTotalBytes * 0.95) {
    const usedMb = round1(v2Used / MB);
    const limitMb = round1(v2Max / MB);
    return {
      source: 'cgroup_v2',
      usedMb,
      limitMb,
      percent: Math.min(100, round1((usedMb / limitMb) * 100)),
    };
  }

  // 2. Try Linux cgroup v1
  const v1Used = readNumberFile('/sys/fs/cgroup/memory/memory.usage_in_bytes');
  const v1Max = readNumberFile('/sys/fs/cgroup/memory/memory.limit_in_bytes');
  if (v1Used !== null && v1Max !== null && v1Max < hostTotalBytes * 0.95) {
    const usedMb = round1(v1Used / MB);
    const limitMb = round1(v1Max / MB);
    return {
      source: 'cgroup_v1',
      usedMb,
      limitMb,
      percent: Math.min(100, round1((usedMb / limitMb) * 100)),
    };
  }

  // 3. Fallback: compare Node.js RSS against configured hosting quota (default 1536 MB)
  const usedMb = round1(processRssBytes / MB);
  const limitMb = DEFAULT_HOSTING_RAM_LIMIT_MB;
  return {
    source: 'process_estimate',
    usedMb,
    limitMb,
    percent: Math.min(100, round1((usedMb / limitMb) * 100)),
  };
}

function readDiskStats(): ServerHealthSnapshot['disk'] {
  try {
    const stats = fs.statfsSync(process.cwd());
    const totalBytes = stats.blocks * stats.bsize;
    const freeBytes = stats.bavail * stats.bsize;
    const usedBytes = Math.max(0, totalBytes - freeBytes);
    const totalGb = round1(totalBytes / GB);
    const usedGb = round1(usedBytes / GB);
    const freeGb = round1(freeBytes / GB);
    const percent = totalBytes > 0 ? round1((usedBytes / totalBytes) * 100) : 0;
    return { available: true, totalGb, usedGb, freeGb, percent };
  } catch {
    return { available: false, totalGb: 0, usedGb: 0, freeGb: 0, percent: 0 };
  }
}

export function formatUptime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}h`);
  if (hours > 0) parts.push(`${hours}j`);
  if (mins > 0) parts.push(`${mins}m`);
  if (parts.length === 0) parts.push(`${secs}d`);
  return parts.join(' ');
}

export async function getServerHealth(): Promise<ServerHealthSnapshot> {
  const mem = process.memoryUsage();
  const hostTotal = os.totalmem();
  const hostFree = os.freemem();
  const hostUsed = Math.max(0, hostTotal - hostFree);
  const [load1, load5, load15] = os.loadavg();

  const rssMb = round1(mem.rss / MB);
  const heapUsedMb = round1(mem.heapUsed / MB);
  const heapTotalMb = round1(mem.heapTotal / MB);
  const externalMb = round1(mem.external / MB);
  const rssPercentOfSoftLimit = Math.min(100, round1((rssMb / PM2_SOFT_LIMIT_MB) * 100));

  const accountMemory = readAccountMemory(mem.rss, hostTotal);
  const disk = readDiskStats();

  // Check DB connectivity & latency
  let dbConnected = false;
  let dbLatencyMs: number | null = null;
  try {
    const t0 = Date.now();
    await pool.query('SELECT 1');
    dbLatencyMs = Date.now() - t0;
    dbConnected = true;
  } catch {
    dbConnected = false;
  }

  let status: ServerHealthSnapshot['status'] = 'healthy';
  let statusMessage = 'Seluruh resource berjalan normal dan stabil.';

  if (!dbConnected) {
    status = 'critical';
    statusMessage = 'Koneksi database PostgreSQL terputus.';
  } else if (rssMb >= 400 || accountMemory.percent >= 88) {
    status = 'critical';
    statusMessage = 'Pemakaian RAM mendekati batas kritis — PM2 akan auto-restart jika melewati 450 MB.';
  } else if (rssMb >= 320 || accountMemory.percent >= 72 || (dbLatencyMs !== null && dbLatencyMs > 1500)) {
    status = 'warning';
    statusMessage = 'Beban memori atau latensi database sedang meningkat.';
  }

  return {
    status,
    statusMessage,
    timestamp: new Date().toISOString(),
    process: {
      pid: process.pid,
      nodeVersion: process.version,
      uptimeSeconds: Math.floor(process.uptime()),
      uptimeFormatted: formatUptime(process.uptime()),
      rssMb,
      heapUsedMb,
      heapTotalMb,
      externalMb,
      softLimitMb: PM2_SOFT_LIMIT_MB,
      rssPercentOfSoftLimit,
    },
    accountMemory,
    host: {
      hostname: os.hostname(),
      platform: `${os.type()} ${os.arch()}`,
      cpuCores: os.cpus().length,
      loadAvg1m: round1(load1),
      loadAvg5m: round1(load5),
      loadAvg15m: round1(load15),
      ramTotalMb: round1(hostTotal / MB),
      ramUsedMb: round1(hostUsed / MB),
      ramFreeMb: round1(hostFree / MB),
      ramPercent: hostTotal > 0 ? round1((hostUsed / hostTotal) * 100) : 0,
    },
    disk,
    database: {
      connected: dbConnected,
      latencyMs: dbLatencyMs,
      totalConnections: pool.totalCount,
      idleConnections: pool.idleCount,
      waitingClients: pool.waitingCount,
      maxConnections: 5,
    },
  };
}

function makeBar(percent: number, width = 10): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/**
 * Format server resource telemetry for Telegram Owner (/server)
 */
export function formatTelegramHealthReport(h: ServerHealthSnapshot): string {
  const badge =
    h.status === 'healthy'
      ? '🟢 NORMAL'
      : h.status === 'warning'
        ? '🟡 WASPADA'
        : '🔴 KRITIS';

  const accountLabel =
    h.accountMemory.source === 'process_estimate'
      ? 'RAM Proses vs Kuota 1.5 GB'
      : 'RAM Akun cPanel (cgroup)';

  const diskLine = h.disk.available
    ? `💾 <b>Disk:</b> <code>${h.disk.usedGb} GB / ${h.disk.totalGb} GB</code> (${h.disk.percent}%)\n`
    : '';

  const dbState = h.database.connected
    ? `🟢 Terhubung (${h.database.latencyMs} ms)`
    : '🔴 Terputus';

  return (
    `🖥️ <b>MONITOR RESOURCE DAFUNG HUB</b>\n` +
    `Status: <b>${badge}</b>\n` +
    `<i>${h.statusMessage}</i>\n\n` +
    `⚡ <b>RAM Aplikasi (Node.js / PM2)</b>\n` +
    `<code>[${makeBar(h.process.rssPercentOfSoftLimit)}] ${h.process.rssMb} MB / ${h.process.softLimitMb} MB</code>\n` +
    `• Heap: <code>${h.process.heapUsedMb} / ${h.process.heapTotalMb} MB</code>\n` +
    `• Uptime: <code>${h.process.uptimeFormatted}</code> (PID ${h.process.pid})\n\n` +
    `📦 <b>${accountLabel}</b>\n` +
    `<code>[${makeBar(h.accountMemory.percent)}] ${h.accountMemory.usedMb} MB / ${h.accountMemory.limitMb} MB (${h.accountMemory.percent}%)</code>\n\n` +
    `⚙️ <b>Server Host (${h.host.hostname})</b>\n` +
    `• CPU Load: <code>${h.host.loadAvg1m} / ${h.host.loadAvg5m} / ${h.host.loadAvg15m}</code> (${h.host.cpuCores} core)\n` +
    `• Host RAM: <code>${h.host.ramPercent}%</code>\n` +
    diskLine +
    `\n🗄️ <b>Database Pool</b>\n` +
    `• Status: ${dbState}\n` +
    `• Koneksi: <code>${h.database.totalConnections}/${h.database.maxConnections}</code> (idle: ${h.database.idleConnections}, antri: ${h.database.waitingClients})\n\n` +
    `🌐 Web Monitor: https://store.dafung.web.id/monitor`
  );
}
