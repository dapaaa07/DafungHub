# Panduan Deploy DaFung Hub di cPanel (Node.js App)

Panduan lengkap untuk menjalankan **Website Storefront, Autentikasi Pelanggan, Webhook Pembayaran, dan Telegram Bot** di cPanel Hosting menggunakan fitur **Setup Node.js App** (CloudLinux Passenger).

---

## 📋 Pra-Syarat di cPanel Hosting
1. Fitur **"Setup Node.js App"** aktif di cPanel Anda.
2. Versi Node.js yang didukung: **Node.js v20.x** (disarankan) atau **v18.x / v22.x**.
3. Akses **File Manager** dan (opsional) **Terminal** di cPanel.

---

## 🚀 Langkah-Langkah Deployment

### 1. Upload & Ekstrak File ZIP
1. Masuk ke **cPanel** $\rightarrow$ Buka **File Manager**.
2. Masuk ke folder home Anda (misalnya `/home/username/`).
3. Buat folder baru bernama `dafung-hub` (di luar `public_html` agar aman, atau di dalam subfolder domain Anda).
4. Upload file `dafung-hub-cpanel-deploy.zip` ke folder `dafung-hub`.
5. Klik kanan file ZIP $\rightarrow$ Pilih **Extract** $\rightarrow$ **Extract Files**.
6. Hapus file ZIP setelah diekstrak untuk menghemat ruang penyimpanan.

---

### 2. Konfigurasi "Setup Node.js App" di cPanel
1. Kembali ke Dashboard utama cPanel $\rightarrow$ Cari menu **"Setup Node.js App"** di bagian Software.
2. Klik tombol **"Create Application"**.
3. Isi kolom konfigurasi berikut:
   * **Node.js version**: Pilih `20.x` (atau versi terdekat yang tersedia).
   * **Application mode**: Pilih `Production`.
   * **Application root**: `dafung-hub` (sesuai nama folder tempat ekstrak).
   * **Application URL**: Pilih domain atau subdomain Anda (misalnya `store.dafunghub.com` atau domain utama).
   * **Application startup file**: `server.js`.
4. Klik tombol **"Create"** di pojok kanan atas.

---

### 3. Konfigurasi File Lingkungan (.env)
1. Di File Manager, buka folder `dafung-hub`.
2. Salin file `.env.example` dan ubah namanya menjadi `.env` (pastikan fitur *Show Hidden Files* aktif di File Manager cPanel).
3. Edit file `.env` dan masukkan kredensial asli Anda:

```env
# Database PostgreSQL Supabase
DATABASE_URL=your_postgresql_supabase_connection_url_here

# Telegram Bot
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
ADMIN_GROUP_CHAT_ID=-1001234567890
ADMIN_TELEGRAM_ID=7133868769

# Enkripsi Kredensial AES-256
AES_SECRET_KEY=your_secret_key_minimum_32_characters_here

# Payment Gateway Aktif (shopeepay / midtrans / sakurupiah)
PAYMENT_GATEWAY=shopeepay
SHOPEEPAY_API_URL=https://shopee.prastyaaneki.biz.id
SHOPEEPAY_API_KEY=your_shopeepay_api_key_here
SHOPEEPAY_STATIC_QRIS=your_shopeepay_static_qris_here

# Google OAuth 2.0 (Untuk Login Pelanggan dengan Akun Google)
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret

# URL Domain Anda
APP_URL=https://your-domain.com
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

> **PENTING untuk Google OAuth:**
> Di Google Cloud Console, tambahkan URL domain cPanel Anda ke **Authorized redirect URIs**:
> `https://your-domain.com/api/auth/google/callback`

---

### 4. Install Dependencies & Jalankan Aplikasi
1. Buka kembali menu **Setup Node.js App** di cPanel $\rightarrow$ Klik aplikasi `dafung-hub`.
2. Klik tombol **"Run NPM Install"** (atau buka cPanel Terminal, salin command virtualenv yang tertera di bagian atas, lalu jalankan `npm install --omit=dev`).
3. Tunggu hingga proses instalasi modul selesai.
4. Klik tombol **"Restart Application"** (ikon panah melingkar hijau).
5. Buka website di browser: `https://your-domain.com`. Website sekarang sudah live dan siap melayani pemesanan!

---

### 5. Setup Webhook Telegram Bot (Opsional)
Agar Telegram Bot dapat merespons interaksi pelanggan secara otomatis di server cPanel Anda:
1. Buka URL ini di browser (ganti `<TOKEN>` dan `<DOMAIN>`):
   `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<DOMAIN>/api/webhooks/telegram`
2. Respon sukses akan menampilkan: `{"ok":true,"result":true,"description":"Webhook was set"}`.
