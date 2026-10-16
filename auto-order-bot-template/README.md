# 🤖 Telegram Auto-Order Bot Template (Commercial Edition)

Template bot Telegram komersial siap pakai untuk bisnis penjualan produk digital, akun premium, lisensi software, top-up, dan voucher game dengan sistem **otomatisasi 24 jam nonstop**.

Dilengkapi integrasi payment gateway **QRIS real-time** (Sakurupiah & Midtrans), sistem auto-fulfillment instan ke supplier H2H dengan fallback antrean otomatis (*Smart Queue*), enkripsi kredensial akun, serta panel admin lengkap langsung dari Telegram.

---

## 🌟 Fitur Unggulan

### 🛍️ Untuk Pembeli (Customer Flow)
- **Katalog Interaktif Berbasis Kategori/Platform:** Tampilan tombol navigasi 2 kolom yang rapi dengan paginasi halaman.
- **Penerbitan QRIS Instan:** Invoice pembayaran QRIS dinamis otomatis terbit dalam hitungan detik (support BCA, Mandiri, BRI, BNI, GoPay, OVO, DANA, ShopeePay).
- **Pengiriman Akun Otomatis:** Begitu pembayaran diverifikasi oleh gateway, kredensial akun / lisensi langsung dikirim ke chat Telegram pembeli.
- **Cek Status & Riwayat Order:** Pembeli dapat mengecek status pesanan kapan saja dengan perintah `/status <kode_order>` atau tombol interaktif.

### 👑 Untuk Pemilik Toko (Owner / Admin Panel)
- **Panel Admin Interaktif Langsung di Telegram:** Akses instan via tombol keyboard atau perintah `/admin`.
- **Toggle Mode Maintenance 1-Klik:** Ubah status bot antara `ONLINE` dan `MAINTENANCE` secara real-time tanpa perlu restart server.
- **Kelola & Override Harga Produk:**
  - Ubah harga manual per produk via chat: `/editprice <id_atau_nama> <harga_baru>`.
  - Tombol **1-Klik Reset ke Rumus Default** (`[🔄 Reset Default]` / `/resetprice <id>`) untuk mengembalikan harga ke kalkulasi otomatis dari modal supplier.
- **Smart Fallback Antrean (0 Modal Protection):**
  - Jika saldo supplier mencukupi: Akun langsung dibeli via H2H dan dikirimkan instan ke pembeli.
  - Jika saldo supplier belum mencukupi: Pesanan otomatis masuk mode antrean (*Processing*). Admin mendapatkan notifikasi dengan tombol **1-Klik Eksekusi Supplier** setelah top-up, atau opsi kirim manual via `/kirim <kode_order> <kredensial>`.
- **Enkripsi Kredensial AES-256:** Data akun dan lisensi yang tersimpan di database terenkripsi penuh untuk keamanan privasi pembeli.
- **Proteksi Biaya Gateway (Cost-Plus Protection):** Rumus proteksi margin otomatis agar keuntungan bersih Anda tidak tergerus oleh biaya payment gateway.

---

## 🏗️ Arsitektur & Struktur Proyek

```text
auto-order-bot-template/
├── config/
│   └── bot.config.ts          # Pusat konfigurasi toko, markup, gateway, dan admin
├── src/
│   ├── bot/
│   │   ├── commands/
│   │   │   └── buy.ts         # Flow pembelian & penerbitan invoice QRIS
│   │   ├── menu.ts            # Tampilan menu, katalog kategori, & panel admin
│   │   └── handler.ts         # Router pesan, callback query, & proteksi maintenance
│   ├── core/
│   │   ├── db.ts              # PostgreSQL pool & query runner
│   │   ├── encrypt.ts         # Enkripsi & dekripsi kredensial AES-256
│   │   ├── settings.ts        # Penyimpanan status operasional (Online / Maintenance)
│   │   ├── pricing.ts         # Rumus markup berjenjang & Cost-Plus Gateway Fee
│   │   ├── custom-prices.ts   # Database persistence harga kustom admin
│   │   └── fulfillment.ts     # Engine eksekusi H2H & fallback antrean
│   ├── gateways/
│   │   ├── sakurupiah.ts      # Client gateway Sakurupiah & verifikasi HMAC-SHA256
│   │   ├── midtrans.ts        # Client gateway Midtrans Core & Snap QRIS
│   │   └── manual.ts          # Panduan transfer bank manual / QRIS statis
│   ├── suppliers/
│   │   ├── supplier-api.ts    # Integrasi API supplier H2H & filter produk testing
│   │   └── internal-catalog.ts# Pengelolaan katalog produk internal database
│   └── index.ts               # Entry point utama: HTTP webhook server & bot runner
├── database/
│   └── schema.sql             # Skema DDL PostgreSQL lengkap dengan index
├── scripts/
│   ├── setup-db.ts            # Script otomatis pembuatan tabel database
│   └── set-webhook.ts         # Script 1-klik pasang/hapus webhook Telegram
├── tests/                     # Rangkaian automated unit test
├── .env.example               # Panduan variabel environment lengkap
├── package.json
└── tsconfig.json
```

---

## 🚀 Panduan Memulai Cepat

Untuk panduan instalasi lengkap langkah demi langkah bagi pemula, silakan buka file **[SETUP_GUIDE.md](./SETUP_GUIDE.md)**.

### Ringkasan Langkah:
1. **Clone / Buka Folder:**
   ```bash
   cd auto-order-bot-template
   npm install
   ```
2. **Konfigurasi Environment:**
   ```bash
   cp .env.example .env
   # Buka file .env dan masukkan TELEGRAM_BOT_TOKEN serta DATABASE_URL Anda
   ```
3. **Setup Database:**
   ```bash
   npm run setup:db
   ```
4. **Jalankan Bot:**
   ```bash
   # Mode Development (Polling):
   npm run dev

   # Jalankan Unit Test:
   npm test
   ```

---

## 📋 Daftar Perintah Bot Telegram

| Perintah | Hak Akses | Deskripsi |
| :--- | :--- | :--- |
| `/start` | Publik | Membuka menu interaktif utama toko |
| `/help` | Publik | Panduan bantuan & kontak CS |
| `/status <kode_order>` | Publik | Mengecek status pesanan & membuka kembali invoice QRIS |
| `/admin` | Admin / Owner | Membuka panel kontrol administrasi bot |
| `/kirim <kode> <kredensial>` | Admin / Owner | Mengirim akun pesanan secara manual ke pembeli |
| `/editprice <id> <harga>` | Admin / Owner | Mengubah harga jual suatu produk |
| `/resetprice <id>` | Admin / Owner | Mengembalikan harga ke rumus auto-markup modal supplier |

---

## 📄 Lisensi & Hak Cipta
Template ini dirancang untuk tujuan komersial. Anda bebas memodifikasi nama toko, branding, markup keuntungan, dan mendistribusikannya kepada klien Anda.
