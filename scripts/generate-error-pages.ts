import fs from 'fs';
import path from 'path';
import { HTTP_ERRORS, HttpErrorDefinition } from '../lib/http-errors';
import { CS_WHATSAPP_INTL, TELEGRAM_BOT_USERNAME } from '../lib/pricing';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getBadgeColors(tone: HttpErrorDefinition['tone']): { bg: string; border: string; text: string; dot: string } {
  if (tone === 'danger') {
    return { bg: '#FEF2F2', border: '#FECACA', text: '#B91C1C', dot: '#DC2626' };
  }
  if (tone === 'warning') {
    return { bg: '#FFFBEB', border: '#FDE68A', text: '#92400E', dot: '#D97706' };
  }
  return { bg: 'rgba(255, 222, 0, 0.25)', border: '#FFDE00', text: '#121212', dot: '#121212' };
}

function buildPrimaryButtons(def: HttpErrorDefinition): string {
  if (def.primaryAction === 'login') {
    return `
      <a href="/account" class="btn btn-primary">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFDE00" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        <span>Masuk / Buka Akun</span>
      </a>
      <a href="/" class="btn btn-secondary">Kembali ke Beranda</a>
    `;
  }

  if (def.primaryAction === 'account') {
    return `
      <a href="/account" class="btn btn-yellow">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#121212" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
          <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
        </svg>
        <span>Kelola Saldo &amp; Akun</span>
      </a>
      <a href="/orders" class="btn btn-primary">Riwayat Pesanan</a>
    `;
  }

  if (def.primaryAction === 'retry') {
    return `
      <button type="button" class="btn btn-primary" onclick="window.location.reload()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFDE00" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
        </svg>
        <span>Muat Ulang Sekarang</span>
      </button>
      <a href="/" class="btn btn-secondary">Kembali ke Beranda</a>
    `;
  }

  return `
    <a href="/" class="btn btn-primary">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFDE00" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m12 19-7-7 7-7" />
        <path d="M19 12H5" />
      </svg>
      <span>Kembali ke Beranda</span>
    </a>
    <a href="/#katalog" class="btn btn-yellow">Lihat Katalog Produk</a>
  `;
}

function renderHtml(def: HttpErrorDefinition): string {
  const colors = getBadgeColors(def.tone);
  const waText = encodeURIComponent(
    `Halo CS Dafung Hub, saya mengalami Error ${def.code} (${def.label}) saat mengakses website.`
  );
  const retryBlock = def.autoRetrySeconds
    ? `<p class="retry-note" id="countdownText">Mencoba ulang otomatis dalam ${def.autoRetrySeconds} detik...</p>`
    : '';
  const retryScript = def.autoRetrySeconds
    ? `
  <script>
    (function () {
      var seconds = ${def.autoRetrySeconds};
      var label = document.getElementById('countdownText');
      var timer = setInterval(function () {
        seconds -= 1;
        if (seconds <= 0) {
          clearInterval(timer);
          if (label) label.textContent = 'Memeriksa ketersediaan server...';
          window.location.reload();
        } else if (label) {
          label.textContent = 'Mencoba ulang otomatis dalam ' + seconds + ' detik...';
        }
      }, 1000);
    })();
  </script>`
    : '';

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${def.code} ${escapeHtml(def.label)} — Dafung Hub</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #F8F9FA;
      --surface: #FFFFFF;
      --ink: #121212;
      --muted: #6B7280;
      --border: #E5E7EB;
      --yellow: #FFDE00;
      --yellow-hover: #FFE838;
    }
    body {
      min-height: 100vh;
      background-color: var(--bg);
      color: var(--ink);
      font-family: 'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      -webkit-font-smoothing: antialiased;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
    }
    .card {
      width: 100%;
      max-width: 540px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 24px;
      box-shadow: 0 4px 24px rgba(18, 18, 18, 0.04);
      padding: 36px 28px;
      text-align: center;
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 22px;
      font-weight: 800;
      font-size: 18px;
      letter-spacing: -0.02em;
      color: var(--ink);
      text-decoration: none;
    }
    .brand-mark {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      background: var(--ink);
      color: var(--yellow);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      font-size: 16px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      border-radius: 999px;
      background: ${colors.bg};
      border: 1px solid ${colors.border};
      color: ${colors.text};
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      margin-bottom: 16px;
    }
    .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: ${colors.dot};
      flex-shrink: 0;
    }
    .code {
      font-size: 64px;
      line-height: 1;
      font-weight: 900;
      letter-spacing: -0.04em;
      color: var(--ink);
      margin-bottom: 12px;
    }
    h1 {
      font-size: 22px;
      line-height: 1.3;
      font-weight: 800;
      letter-spacing: -0.02em;
      margin-bottom: 10px;
      color: var(--ink);
    }
    .desc {
      font-size: 14px;
      line-height: 1.6;
      color: var(--muted);
      max-width: 420px;
      margin: 0 auto 24px;
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 10px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      padding: 13px 20px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 700;
      text-decoration: none;
      border: none;
      cursor: pointer;
      transition: transform 0.15s ease, background-color 0.15s ease;
    }
    .btn:active { transform: scale(0.98); }
    .btn-primary { background: var(--ink); color: #FFFFFF; }
    .btn-primary:hover { background: #252525; }
    .btn-secondary { background: #F3F4F6; color: var(--ink); }
    .btn-secondary:hover { background: #E5E7EB; }
    .btn-yellow { background: var(--yellow); color: var(--ink); font-weight: 800; }
    .btn-yellow:hover { background: var(--yellow-hover); }
    .retry-note {
      font-size: 12px;
      color: var(--muted);
      margin-top: 8px;
    }
    .divider {
      margin-top: 22px;
      border-top: 1px solid #F3F4F6;
      padding-top: 20px;
    }
    .alt-title {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #9CA3AF;
      margin-bottom: 12px;
    }
    .alt-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
    }
    @media (min-width: 480px) {
      .card { padding: 42px 36px; }
      .actions { flex-direction: row; }
      .alt-grid { grid-template-columns: 1fr 1fr; }
    }
    .btn-tg { background: #F0F9FF; border: 1px solid #BAE6FD; color: #0C4A6E; }
    .btn-tg:hover { background: #E0F2FE; }
    .btn-wa { background: #ECFDF5; border: 1px solid #A7F3D0; color: #064E3B; }
    .btn-wa:hover { background: #D1FAE5; }
    .footer-note { margin-top: 20px; font-size: 11px; color: #9CA3AF; }
  </style>
</head>
<body>
  <main class="card" role="main">
    <a href="/" class="brand" aria-label="Dafung Hub">
      <span class="brand-mark">D</span>
      <span>Dafung Hub</span>
    </a>

    <div>
      <span class="badge">
        <span class="dot" aria-hidden="true"></span>
        <span>${escapeHtml(def.badge)}</span>
      </span>
    </div>

    <p class="code">${def.code}</p>
    <h1>${escapeHtml(def.title)}</h1>
    <p class="desc">${escapeHtml(def.description)}</p>

    <div class="actions">
      ${buildPrimaryButtons(def)}
    </div>
    ${retryBlock}

    <div class="divider">
      <p class="alt-title">Jalur Bantuan &amp; Order Resmi</p>
      <div class="alt-grid">
        <a href="https://t.me/${TELEGRAM_BOT_USERNAME}" target="_blank" rel="noopener noreferrer" class="btn btn-tg">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3AA8E8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
            <path d="m21.854 2.147-10.94 10.939" />
          </svg>
          <span>Bot Telegram</span>
        </a>
        <a href="https://wa.me/${CS_WHATSAPP_INTL}?text=${waText}" target="_blank" rel="noopener noreferrer" class="btn btn-wa">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#25D366" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
          </svg>
          <span>Chat CS WA</span>
        </a>
      </div>
    </div>
  </main>

  <p class="footer-note">store.dafung.web.id &bull; Layanan Digital Premium</p>
  ${retryScript}
</body>
</html>
`;
}

const outDir = path.join(process.cwd(), 'public', 'errors');
fs.mkdirSync(outDir, { recursive: true });

for (const def of Object.values(HTTP_ERRORS)) {
  const html = renderHtml(def);
  fs.writeFileSync(path.join(outDir, `${def.code}.html`), html, 'utf8');
  if (def.code === 503) {
    // Keep public/503.html synced for backward compatibility
    fs.writeFileSync(path.join(process.cwd(), 'public', '503.html'), html, 'utf8');
  }
}

console.log(`Generated ${Object.keys(HTTP_ERRORS).length} static error pages in public/errors/`);
