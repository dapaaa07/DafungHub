export interface HttpErrorDefinition {
  code: number;
  label: string;
  badge: string;
  title: string;
  description: string;
  tone: 'warning' | 'danger' | 'neutral';
  autoRetrySeconds?: number;
  primaryAction: 'home' | 'login' | 'account' | 'retry';
}

export const HTTP_ERRORS: Record<number, HttpErrorDefinition> = {
  400: {
    code: 400,
    label: 'Bad Request',
    badge: 'Error 400 — Permintaan Tidak Valid',
    title: 'Permintaan tidak dapat diproses',
    description:
      'Format data atau parameter URL yang dikirim tidak valid. Periksa kembali tautan yang Anda buka atau kembali ke beranda.',
    tone: 'warning',
    primaryAction: 'home',
  },
  401: {
    code: 401,
    label: 'Unauthorized',
    badge: 'Error 401 — Autentikasi Diperlukan',
    title: 'Silakan masuk ke akun Anda terlebih dahulu',
    description:
      'Halaman atau layanan ini memerlukan sesi login aktif. Masuk ke akun Dafung Hub Anda untuk melanjutkan.',
    tone: 'warning',
    primaryAction: 'login',
  },
  402: {
    code: 402,
    label: 'Payment Required',
    badge: 'Error 402 — Pembayaran Diperlukan',
    title: 'Pembayaran atau saldo diperlukan',
    description:
      'Akses fitur atau pesanan ini memerlukan penyelesaian pembayaran atau saldo dompet yang mencukupi di akun Anda.',
    tone: 'warning',
    primaryAction: 'account',
  },
  403: {
    code: 403,
    label: 'Forbidden',
    badge: 'Error 403 — Akses Ditolak',
    title: 'Anda tidak memiliki izin mengakses halaman ini',
    description:
      'Sumber daya ini dibatasi untuk keamanan sistem. Jika Anda merasa ini kekeliruan, silakan hubungi tim CS kami.',
    tone: 'danger',
    primaryAction: 'home',
  },
  404: {
    code: 404,
    label: 'Not Found',
    badge: 'Error 404 — Halaman Tidak Ditemukan',
    title: 'Halaman yang Anda cari tidak tersedia',
    description:
      'Tautan mungkin sudah dipindahkan, dihapus, atau alamat URL yang dimasukkan kurang tepat. Silakan kembali ke beranda atau lihat katalog produk kami.',
    tone: 'neutral',
    primaryAction: 'home',
  },
  405: {
    code: 405,
    label: 'Method Not Allowed',
    badge: 'Error 405 — Metode Tidak Diizinkan',
    title: 'Metode permintaan tidak didukung',
    description:
      'Alamat ini tidak menerima metode permintaan yang digunakan browser atau aplikasi Anda. Silakan akses melalui navigasi resmi website.',
    tone: 'warning',
    primaryAction: 'home',
  },
  408: {
    code: 408,
    label: 'Request Timeout',
    badge: 'Error 408 — Waktu Permintaan Habis',
    title: 'Koneksi terlalu lama merespons',
    description:
      'Server menunggu permintaan terlalu lama akibat koneksi tidak stabil. Silakan muat ulang halaman dan coba kembali.',
    tone: 'warning',
    autoRetrySeconds: 15,
    primaryAction: 'retry',
  },
  429: {
    code: 429,
    label: 'Too Many Requests',
    badge: 'Error 429 — Terlalu Banyak Permintaan',
    title: 'Batas permintaan sementara tercapai',
    description:
      'Sistem mendeteksi terlalu banyak permintaan dalam waktu singkat. Mohon tunggu beberapa detik sebelum memuat ulang halaman.',
    tone: 'warning',
    autoRetrySeconds: 20,
    primaryAction: 'retry',
  },
  500: {
    code: 500,
    label: 'Internal Server Error',
    badge: 'Error 500 — Gangguan Server',
    title: 'Terjadi kesalahan saat memproses halaman',
    description:
      'Server mengalami kendala teknis sementara. Tim kami terus memantau layanan — silakan coba muat ulang beberapa saat lagi.',
    tone: 'danger',
    autoRetrySeconds: 15,
    primaryAction: 'retry',
  },
  502: {
    code: 502,
    label: 'Bad Gateway',
    badge: 'Error 502 — Gangguan Gateway',
    title: 'Koneksi ke server aplikasi sedang dipulihkan',
    description:
      'Server perantara menerima respons tidak valid saat menyambung ke layanan utama. Halaman akan mencoba tersambung kembali.',
    tone: 'danger',
    autoRetrySeconds: 15,
    primaryAction: 'retry',
  },
  503: {
    code: 503,
    label: 'Service Unavailable',
    badge: 'Error 503 — Pemulihan Layanan',
    title: 'Website sedang dalam pemulihan singkat',
    description:
      'Server sedang memuat ulang layanan secara otomatis agar performa tetap optimal. Halaman ini akan mencoba tersambung kembali.',
    tone: 'warning',
    autoRetrySeconds: 15,
    primaryAction: 'retry',
  },
  504: {
    code: 504,
    label: 'Gateway Timeout',
    badge: 'Error 504 — Batas Waktu Gateway',
    title: 'Server membutuhkan waktu terlalu lama',
    description:
      'Layanan utama belum merespons dalam batas waktu yang ditentukan. Silakan muat ulang dalam beberapa detik.',
    tone: 'danger',
    autoRetrySeconds: 15,
    primaryAction: 'retry',
  },
};

export const SUPPORTED_ERROR_CODES = Object.keys(HTTP_ERRORS).map(Number);

export function getHttpError(code: number): HttpErrorDefinition {
  if (HTTP_ERRORS[code]) {
    return HTTP_ERRORS[code];
  }
  if (code >= 400 && code < 500) {
    return {
      code,
      label: 'Client Error',
      badge: `Error ${code} — Permintaan Bermasalah`,
      title: 'Permintaan tidak dapat dilanjutkan',
      description:
        'Terjadi kesalahan pada permintaan halaman ini. Silakan kembali ke beranda atau hubungi CS jika membutuhkan bantuan.',
      tone: 'warning',
      primaryAction: 'home',
    };
  }
  return {
    code: code >= 500 && code < 600 ? code : 500,
    label: 'Server Error',
    badge: `Error ${code >= 500 && code < 600 ? code : 500} — Gangguan Server`,
    title: 'Terjadi gangguan sementara pada server',
    description:
      'Layanan sedang mengalami kendala sementara. Silakan muat ulang beberapa saat lagi atau gunakan Bot Telegram resmi kami.',
    tone: 'danger',
    autoRetrySeconds: 15,
    primaryAction: 'retry',
  };
}
