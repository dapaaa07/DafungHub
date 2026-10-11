# Bot Telegram Auto-Order Produk Digital — PRD & System Blueprint

---

## 1. Executive Summary & Problem Statement

### Latar Belakang & Masalah
Penjualan produk digital (akun premium, lisensi, dll.) masih manual: admin kirim kredensial lewat chat, tidak ada sistem invoice, tidak ada tracking, rawan kehilangan pesan, tidak ada keamanan terhadap kredensial bocor.

### Solusi
Bot Telegram otomatis:
- Buat invoice QRIS via Midtrans.
- Konfirmasi pembayaran lewat webhook.
- Notifikasi admin via grup.
- Admin kirim kredensial via command bot.
- Bot forward ke pembeli.

### Value Proposition
- Fulfillment < 2 menit setelah bayar.
- 95%+ keberhasilan pembayaran.
- Kredensial terenkripsi AES-256.
- Admin kontrol stok/harga via bot.

---

## 2. Target Pengguna & User Persona

### Pembeli
- **Karakter:** Modern, pakai HP, butuh cepat.
- **Pain:** Ribet transfer manual, takut kena tipu.
- **Goal:** Bayar, dapat akun, selesai.

### Admin
- **Karakter:** Kelola banyak akun, butuh efisien.
- **Pain:** Harus monitoring tiap pesanan, copy-paste kredensial.
- **Goal:** Otomatisasi notifikasi, kirim cepat, kelola stok.

---

## 3. User Flows & Key Journey

### Pembeli
1. Klik start di bot → lihat katalog.
2. Pilih produk → dapat QRIS dinamis.
3. Scan QRIS → bayar.
4. Dapat notifikasi “Pembayaran diterima”.
5. Admin kirim kredensial → bot forward ke pembeli.
6. Cek status via `/status`.

### Admin
1. Dapat notifikasi di grup: “Order #XYZ dibayar”.
2. Bot kasih tombol pilih invoice + field username.
3. Admin isi kredensial → kirim.
4. Bot validasi → forward ke pembeli.
5. Kelola stok/harga via command bot.

---

## 4. Spesifikasi Fitur Fungsional

### Modul Pembeli
- `/start`: Lihat katalog produk.
- `/buy <product_id>`: Buat invoice Midtrans.
- Webhook Midtrans → konfirmasi bayar.
- `/status`: Cek status order.
- `/help`: Bantuan komplain.

### Modul Payment Gateway
- Midtrans Core API:
  - Buat transaksi dengan `payment_type: qris`.
  - Simpan `order_id`, `gross_amount`.
- Webhook:
  - Endpoint `/api/webhook/midtrans`.
  - Verifikasi signature key.
  - Update status order.

### Modul Admin & Fulfillment
- Notifikasi ke grup Telegram saat bayar.
- Command:
  ```
  /kirim <order_code> <username>
  ```
  - Bot kasih form isi kredensial.
  - Validasi: order_code valid & belum dikirim.
- Forward kredensial ke pembeli.
- Command kelola stok:
  ```
  /addstock <product_id> <jumlah>
  /editprice <product_id> <harga_baru>
  ```

### Penanganan Garansi/Komplain
- Pembeli kirim `/help` → admin dapat notifikasi.
- Admin bisa refund via Midtrans API.

---

## 5. Spesifikasi Teknis & Skema Basis Data

### Tech Stack
- **Frontend:** Next.js (dashboard admin)
- **Backend:** Next.js API Routes
- **Bot:** node-telegram-bot-api
- **DB:** PostgreSQL
- **Payment:** Midtrans
- **Enkripsi:** crypto-js (AES-256)

### Schema DB

#### `users`
| Kolom       | Tipe     | Deskripsi               |
|-------------|----------|-------------------------|
| id          | UUID     | Primary key             |
| telegram_id | string   | Unique                  |
| role        | enum     | buyer / admin           |
| created_at  | datetime |                         |

#### `products`
| Kolom       | Tipe     | Deskripsi               |
|-------------|----------|-------------------------|
| id          | UUID     | Primary key             |
| name        | string   | Nama produk             |
| price       | integer  | Harga (IDR)             |
| stock       | integer  | Stok tersedia           |
| category_id | UUID     | Foreign key             |
| is_active   | boolean  |                         |

#### `orders`
| Kolom            | Tipe     | Deskripsi                          |
|------------------|----------|------------------------------------|
| id               | UUID     | Primary key                        |
| user_id          | UUID     |                                    |
| product_id       | UUID     |                                    |
| order_code       | string   | Unique                             |
| payment_status   | enum     | unpaid / paid / expired            |
| fulfillment_status | enum   | pending / processing / delivered   |
| invoice_data     | json     | Dari Midtrans                      |
| credential_encrypted | string | AES-256 encrypted                  |
| delivered_at     | datetime |                                    |

---

## 6. Edge Cases & Error Handling

| Kasus                          | Solusi                                     |
|-------------------------------|--------------------------------------------|
| QRIS kedaluwarsa              | Polling tiap 10s, update status expired    |
| Supplier kehabiran stok       | Refund otomatis via Midtrans API           |
| Sintaks salah admin           | Balas: “Format salah. Contoh: /kirim XYZ user123” |
| Webhook gagal                | Retry 3x, log error, notifikasi admin      |
| Kredensial duplikat kirim     | Cek `fulfillment_status == delivered`      |

---

## 7. Desain Arsitektur & Struktur Direktori

```
/app
  /api
    /webhook
      midtrans.ts
    /auth
      [...nextauth].ts
  /bot
    handler.ts
    commands/
      start.ts
      kirim.ts
      addstock.ts
  /lib
    midtrans.ts
    encrypt.ts
    db.ts
  /components
  /pages
    /admin
      index.tsx
```

---

## 8. Roadmap Implementasi Bertahap

### Phase 1: MVP Foundation
- Setup Next.js + Telegram bot.
- Buat invoice QRIS via Midtrans.
- Webhook konfirmasi bayar.
- Command `/kirim`, forward ke pembeli.
- DB schema dasar.

### Phase 2: Core Feature Engine
- Dashboard admin (kelola produk/stok).
- State machine transaksi.
- Komplain & refund.
- Enkripsi kredensial AES-256.

### Phase 3: Polish & Production Ready
- Rate limiting.
- Logging & monitoring.
- Idempotency webhook.
- Uji beban & failover.

--- 

Siap deploy. Mulai dari Phase 1.