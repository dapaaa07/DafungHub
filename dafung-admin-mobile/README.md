# Dafung Hub Admin — Mobile App (React Native & TypeScript)

Aplikasi mobile khusus Owner dan Administrator **Dafung Hub** untuk mengelola antrean pesanan, pemenuhan kredensial digital (.txt / teks), penambahan produk manual lokal, pemantauan buku kas ShopeePay, serta data pelanggan secara real-time.

Dibangun dengan **React Native + Expo SDK 51 + TypeScript** dengan mengadopsi sistem desain **Venmo Fintech** (`#008CFF` Venmo Blue, kartu gradien, angka tabular `fontVariant: ['tabular-nums']`, dan tombol pill split jangkar).

---

## Fitur Utama

1. **Beranda & Ringkasan Keuangan (Venmo Balance Card)**
   - Menampilkan total pendapatan harian dan keseluruhan omzet dengan angka tabular display.
   - Pemantauan real-time saldo supplier H2H (`prastyaaneki.biz.id`) dan status koneksi gateway ShopeePay.
   - Status operasional bot (Aktif / Pemeliharaan).

2. **Antrean Pesanan & Pemenuhan 1-Tap (Orders Queue)**
   - Filter status: *Semua*, *Perlu Kirim*, *Selesai*, *Belum Bayar*.
   - Pencarian instan berdasarkan kode pesanan, username pembeli, atau produk.
   - Modal pemenuhan cepat:
     - **Teks Kredensial**: Kirim langsung format akun `email|password`.
     - **Upload Dokumen (.txt)**: Pilih berkas kredensial via file picker bawaan ponsel dan kirim otomatis ke Telegram pembeli.

3. **Katalog Produk & Tambah Produk Manual**
   - Menampilkan produk dari API supplier sekaligus produk manual yang tersimpan di database PostgreSQL.
   - Formulir tambah produk lokal: nama produk, harga jual (Rp), stok, deskripsi/garansi, dan opsi wajib email.
   - Pengaturan harga kustom dan toggle aktif/nonaktif produk.

4. **Buku Kas ShopeePay (Sales Ledger)**
   - Mengambil mutasi QRIS real-time dari gateway ShopeePay (`https://shopee.prastyaaneki.biz.id`).
   - Rekonsiliasi otomatis antara mutasi rekening masuk dan kode pesanan pembeli di database.
   - Rekap total transaksi masuk hari ini dan keseluruhan.

5. **Data Pelanggan (Users Directory)**
   - Daftar seluruh pembeli terdaftar lengkap dengan saldo dompet dan status membership (Free / VIP).
   - Riwayat lengkap transaksi tiap pembeli.

6. **Notifikasi Otomatis Pesanan Masuk**
   - Polling background/foreground setiap 10 detik ke endpoint `/api/admin/notifications`.
   - Banner notifikasi langsung muncul di atas layar disertai getaran haptik saat ada pesanan baru yang telah terkonfirmasi lunas.

7. **Studio Siaran Channel**
   - Publikasi pengumuman dan pesan promosi langsung ke channel `@DafungHub`.

---

## Struktur Folder

```
dafung-admin-mobile/
├── App.tsx                   # Root navigasi (Tab & Stack) + Notifikasi
├── index.ts                  # Entrypoint Expo
├── app.json                  # Konfigurasi aplikasi Expo (Android/iOS)
├── package.json
├── tsconfig.json
├── assets/                   # Ikon aplikasi
└── src/
    ├── api/
    │   └── client.ts         # Klien REST API ke Next.js backend
    ├── context/
    │   ├── AuthContext.tsx   # Otentikasi sesi admin & PIN
    │   └── NotificationContext.tsx # Polling notifikasi real-time & haptik
    ├── theme/
    │   ├── colors.ts         # Token warna Venmo (#008CFF, #F7F7F7, #2F3033)
    │   └── typography.ts     # Tipografi tabular-nums dan format rupiah
    ├── components/
    │   ├── VenmoBalanceCard.tsx   # Kartu pendapatan hero
    │   ├── VenmoPayRequestPill.tsx# Tombol split pill jangkar
    │   ├── OrderRow.tsx           # Baris pesanan & tombol kirim 1-tap
    │   ├── ShopeePayRow.tsx       # Baris mutasi buku kas
    │   ├── UserRow.tsx            # Baris data pembeli
    │   ├── FulfillModal.tsx       # Modal pengiriman kredensial/berkas .txt
    │   ├── AddProductModal.tsx    # Modal tambah produk manual
    │   ├── BroadcastModal.tsx     # Modal kirim siaran ke channel
    │   └── NotificationBanner.tsx # Banner pop-up pesanan baru
    └── screens/
        ├── LoginScreen.tsx        # Layar otentikasi PIN admin
        ├── DashboardScreen.tsx    # Tab Beranda
        ├── OrdersScreen.tsx       # Tab Antrean Pesanan
        ├── ProductsScreen.tsx     # Tab Katalog Produk
        ├── UsersScreen.tsx        # Tab Data Pelanggan
        ├── ShopeePayScreen.tsx    # Tab Buku Kas ShopeePay
        └── SettingsScreen.tsx     # Pengaturan endpoint & mode bot
```

---

## Cara Menjalankan

1. **Masuk ke folder aplikasi:**
   ```bash
   cd dafung-admin-mobile
   ```

2. **Jalankan development server Expo:**
   ```bash
   npx expo start -c
   ```

3. **Buka di Ponsel Android / iOS:**
   - Scan QR code menggunakan aplikasi **Expo Go** (tersedia di Google Play Store & Apple App Store).
   - Masukkan PIN admin atau Kunci Rahasia untuk masuk ke panel.
