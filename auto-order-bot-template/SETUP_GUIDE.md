# 📖 Panduan Lengkap Instalasi & Setup Bot Auto-Order

Panduan ini ditujukan bagi Anda atau pembeli template bot untuk memasang, mengonfigurasi, dan menjalankan bot auto-order dari awal hingga online siap pakai.

---

## 📌 Bagian 1: Prasyarat Sistem

Sebelum memulai, pastikan perangkat atau server Anda telah terpasang:
1. **Node.js**: Versi 18.0.0 atau lebih baru (disarankan Node.js 20 LTS atau 22 LTS).
2. **PostgreSQL**: Database PostgreSQL lokal atau cloud gratis seperti [Supabase](https://supabase.com), [Neon.tech](https://neon.tech), atau [Railway](https://railway.app).
3. **Akun Telegram**: Akun Telegram aktif untuk membuat bot dan menjadi admin.

---

## 🤖 Bagian 2: Membuat Bot Telegram & Mengambil Token

1. Buka aplikasi Telegram dan cari bot resmi **[@BotFather](https://t.me/BotFather)**.
2. Ketik perintah `/newbot`.
3. Masukkan **Nama Tampilan Bot** (contoh: `Toko Digital Kita`).
4. Masukkan **Username Bot** yang berakhiran `bot` (contoh: `tokodigitalkita_bot`).
5. BotFather akan memberikan **HTTP API Token** (format: `123456789:ABCdefGHIjklMNOpqrSTUvwxYZ`). Simpan token ini!
6. Untuk mengetahui **ID Telegram Anda sendiri** (agar bisa dijadikan Admin):
   - Buka bot **[@userinfobot](https://t.me/userinfobot)** di Telegram.
   - Bot akan membalas dengan menampilkan `Id: 7133868769`. Simpan angka ID ini.

---

## 🗄️ Bagian 3: Konfigurasi Database PostgreSQL

1. **Jika Menggunakan Cloud Database (Supabase / Neon):**
   - Buat proyek baru di [Neon.tech](https://neon.tech) atau [Supabase](https://supabase.com).
   - Salin **Connection String** yang diberikan (format: `postgresql://user:password@host:5432/dbname?sslmode=require`).
2. **Jika Menggunakan PostgreSQL Lokal:**
   - Gunakan format: `postgresql://postgres:password@localhost:5432/auto_order_bot?sslmode=disable`.

---

## ⚙️ Bagian 4: Menyiapkan File Konfigurasi (.env)

Masuk ke folder `auto-order-bot-template`, lalu salin file `.env.example` menjadi `.env`:

```bash
cp .env.example .env
```

Buka file `.env` dan isi variabel berikut:

```env
# Token Bot Telegram dari BotFather
TELEGRAM_BOT_TOKEN="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
TELEGRAM_BOT_USERNAME="tokodigitalkita_bot"

# ID Telegram Anda sebagai Owner / Admin
ADMIN_TELEGRAM_IDS="7133868769"

# URL Database PostgreSQL
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"

# Enkripsi Kredensial (Ketik string acak minimal 32 karakter)
ENCRYPTION_SECRET="kunci-rahasia-enkripsi-akun-anda-32karakter"

# Gateway Pembayaran Pilihan ("shopeepay" atau "sakurupiah" atau "midtrans" atau "manual")
DEFAULT_PAYMENT_GATEWAY="shopeepay"

# ShopeePay API Gateway v3.2
SHOPEEPAY_API_KEY="your_shopeepay_api_key_here"
SHOPEEPAY_API_URL="https://shopee.prastyaaneki.biz.id"
SHOPEEPAY_STATIC_QRIS="00020101021126610016ID.CO.SHOPEE.WWW01189360091800239501700208239501700303UMI51440014ID.CO.QRIS.WWW0215ID10266191349880303UMI5204481453033605802ID5910Dafung Hub6008KARAWANG61054137362070703A016304BBC9"

# Sakurupiah (Alternatif)
SAKURUPIAH_API_ID="SANBOX-xxxxxxxx"
SAKURUPIAH_API_KEY="SANBOX-xxxxxxxxxxxxxxxxxxxx"
SAKURUPIAH_MODE="sandbox" # Ganti ke "production" jika akun live

# Mode Koneksi Bot: "polling" (untuk lokal/VPS tanpa domain) atau "webhook"
BOT_CONNECTION_MODE="polling"
PORT=3000
```

---

## 🎨 Bagian 5: Menyesuaikan Branding Toko & Rumus Harga

Buka file **`config/bot.config.ts`**:

1. **Ubah Identitas Toko:**
   ```ts
   store: {
     name: 'Nama Toko Anda',
     tagline: 'Layanan Akun Digital Premium 24 Jam',
     supportWhatsApp: '081234567890',
     channelUrl: 'https://t.me/ChannelTokoAnda',
   }
   ```

2. **Ubah Rumus Margin / Markup Keuntungan:**
   ```ts
   pricing: {
     defaultFlatMarkup: 5000, // Keuntungan default Rp 5.000 per produk
     roundingInterval: 500,   // Pembulatan ke kelipatan Rp 500 terdekat
     tieredMarkup: [
       { maxModal: 10000, markup: 3000 },  // Modal < 10k: untung Rp 3.000
       { maxModal: 50000, markup: 5000 },  // Modal < 50k: untung Rp 5.000
       { maxModal: 500000, markup: 10000 },// Modal < 500k: untung Rp 10.000
     ],
   }
   ```

---

## 📦 Bagian 6: Inisialisasi Database

Jalankan perintah ini satu kali untuk membuat seluruh tabel dan indeks database secara otomatis:

```bash
npm install
npm run setup:db
```

Output yang berhasil akan menampilkan:
```text
🚀 Running Database Schema Setup...
✅ Database schema and tables created successfully!
📋 Verified Tables in Database:
   - bot_settings
   - orders
   - product_prices
   - products
   - users
```

---

## 🚀 Bagian 7: Menjalankan Bot

### Mode Development / Uji Coba:
```bash
npm run dev
```
Buka bot Anda di Telegram dan ketik `/start`. Menu interaktif akan langsung muncul!

### Menjalankan Automated Test:
```bash
npm test
```
Memverifikasi bahwa kalkulasi margin, enkripsi akun, dan pengaturan konfigurasi 100% lulus uji.

---

## 🌐 Bagian 8: Panduan Deploy ke VPS Produksi

Agar bot berjalan 24 jam nonstop di server VPS:

### Opsi A: Menggunakan PM2 (Rekomendasi Terbaik)
1. Install PM2 di VPS:
   ```bash
   npm install -g pm2
   ```
2. Build bot:
   ```bash
   npm run build
   ```
3. Jalankan bot via PM2:
   ```bash
   pm2 start dist/index.js --name "auto-order-bot"
   pm2 save
   pm2 startup
   ```
4. Untuk melihat log bot:
   ```bash
   pm2 logs auto-order-bot
   ```

### Opsi B: Webhook HTTPS & Domain
Jika Anda ingin menggunakan mode Webhook:
1. Pastikan domain server sudah terpasang SSL (HTTPS), misal via Nginx reverse proxy ke port 3000.
2. Di file `.env`, ubah:
   ```env
   BOT_CONNECTION_MODE="webhook"
   WEBHOOK_URL="https://bot.tokodigital.com"
   ```
3. Daftarkan URL webhook Telegram dengan perintah:
   ```bash
   npm run set-webhook
   ```
4. Di dashboard payment gateway (Sakurupiah / Midtrans), pasang URL Callback:
   - **Sakurupiah:** `https://bot.tokodigital.com/api/webhooks/sakurupiah`
   - **Midtrans:** `https://bot.tokodigital.com/api/webhooks/midtrans`

---

## ❓ FAQ & Troubleshooting

### Q1: Bot tidak membalas ketika saya ketik `/start`?
- Pastikan `TELEGRAM_BOT_TOKEN` di `.env` sudah benar dan tidak ada spasi tambahan.
- Jika bot sebelumnya dipasangi webhook, hapus webhook dengan perintah:
  ```bash
  npm run set-webhook delete
  ```
  lalu jalankan kembali dalam mode `BOT_CONNECTION_MODE="polling"`.

### Q2: Bagaimana cara menambah admin baru?
- Buka `.env` dan tambahkan ID admin baru pada `ADMIN_TELEGRAM_IDS` dipisahkan koma:
  ```env
  ADMIN_TELEGRAM_IDS="7133868769,987654321,1122334455"
  ```

### Q3: Bagaimana cara mengubah harga produk tertentu tanpa mengubah modal?
- Admin cukup mengetik di chat Telegram:
  ```text
  /editprice netflix 35000
  ```
- Untuk mengembalikan ke harga otomatis rumus:
  ```text
  /resetprice netflix
  ```
  atau gunakan tombol `[🔄 Reset Default]` di menu `/admin`.
