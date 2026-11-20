# Sumas Dashboard (`dash-cek-sumas`)

Dasbor pemantauan geolokasi pemindaian, verifikasi keaslian produk, dan manajemen tag fisik QR Code multi-brand untuk kebutuhan distribusi B2B maupun ritel.

---

## Fitur Utama

### 1. Dasbor & Pemantauan Aktivitas Pemindaian
- **Peta Sebaran Geolokasi**: Visualisasi lokasi pemindaian QR Code di seluruh wilayah Indonesia berbasis Leaflet dengan pengelompokan status:
  - **Valid / Asli**: Pemindaian normal dalam batas kewajaran.
  - **Berulang Normal**: Pemindaian ulang pada tag yang masih dalam rentang waspada.
  - **Curiga Anomali**: Indikasi duplikasi tag atau perpindahan lokasi tidak wajar.
- **Grafik Tren Pemindaian**: Analisis volume pemindaian berkala untuk rentang 7 hari, 30 hari, dan 12 bulan.
- **Detail Pemindaian**: Modal inspeksi lengkap mencakup koordinat, kota, perangkat, jumlah pemindaian, kecepatan perpindahan, serta catatan alasan anomali.

### 2. Manajemen Brand, Kategori, dan Produk (SKU)
- **Multi-Brand**: Pengelolaan data brand/merk beserta logo, informasi kategori, dan penautan akun pengelola (mendukung penugasan beberapa brand pada satu akun Admin Brand maupun status brand yang belum ditautkan ke akun).
- **Katalog Produk (SKU)**: Manajemen daftar SKU per brand, halaman pembuatan SKU terpisah, serta manajemen kategori dan spesifikasi produk.

### 3. Manajemen Batch & Tag Fisik QR Code
- **Format Penamaan Batch Terstandar**: Setiap batch menggunakan pola `[KODE_BRAND]-[YYYYMM]-[NNN]` (contoh: `SMS-202610-001`, `SMT-202610-001`, `SKT-202611-001`) agar mudah diidentifikasi dan diurutkan.
- **Mode QR Dinamis & QR Statis**:
  - **QR Dinamis**: Setiap stiker memiliki URL unik yang menyematkan ID Tag dan PIN verifikasi secara langsung.
  - **QR Statis**: Seluruh stiker pada batch mengarah ke URL verifikasi dasar, sementara verifikasi per unit dilakukan melalui pencocokan PIN gosok unik di database.
- **Alokasi Proyek B2B**: Pengelompokan tag tersedia ke proyek tertentu lengkap dengan spesifikasi teknis, kode produksi, dan masa garansi.
- **Pratinjau Tag & QR Code Instan**: Arahkan kursor pada item tag di detail batch untuk melihat pratinjau QR Code asli, ID Tag, PIN, proyek teralokasi, spesifikasi, dan status ketersediaan.
- **Ekspor Cetak & Data**: Pembuatan file PDF stiker gosok siap cetak ukuran A3+ serta ekspor daftar tag ke format CSV.

### 4. Kebijakan Keamanan & Deteksi Anomali
- **Impossible Travel Velocity Check**: Menghitung jarak geografis dan selisih waktu antar-pemindaian pada tag yang sama untuk menandai anomali jika kecepatan perpindahan melebihi batas yang ditentukan (default `300 km/jam`).
- **Ambang Batas & Cooldown**: Pengaturan batas jumlah pemindaian valid, waspada, curiga, serta jeda waktu antar-scan.
- **Kebijakan Lokasi**: Pengaturan akurasi GPS maksimal dan pembatasan wilayah pemindaian khusus Indonesia.
- **Keamanan Server**: Pembatasan laju permintaan (rate limiting), perlindungan SSRF untuk URL eksternal, sanitasi input, header keamanan HTTP, dan otentikasi sesi bertanda tangan HMAC.

### 5. Manajemen Akun Pengguna & Hak Akses (RBAC)
- **Kelola Pengguna**: Penambahan dan penyuntingan akun pengguna mencakup foto profil (optimasi WebP otomatis), nama, email, nomor WhatsApp, peran, status aktif/nonaktif, serta reset kata sandi.
- **Isolasi Peran (RBAC)**:
  - **Super Admin**: Akses penuh terhadap seluruh brand, produk, batch, pengguna, matriks hak akses, pengaturan sistem, dan log audit.
  - **Admin Brand**: Akses baca terbatas hanya pada brand yang dikelola, daftar produk/SKU, batch tag, dan aktivitas pemindaian milik brand tersebut.
- **Matriks Hak Akses**: Panel konfigurasi terpusat untuk mengatur izin akses setiap peran.

### 6. Pengaturan Sistem, Log Audit, dan Cadangan Data
- **Notifikasi & Peringatan**: Pusat notifikasi internal, pencatatan permohonan reset kata sandi, serta dukungan pengiriman peringatan email via SMTP atau Resend.
- **Log Audit**: Rekam jejak perubahan data spesifikasi batch, pengguna, dan konfigurasi sistem.
- **Cadangan & Pemulihan**: Ekspor cadangan data dalam format JSON maupun skema SQL, serta dukungan pemulihan data.
- **Tema Tampilan**: Antarmuka bersih bergaya flat yang mendukung mode terang dan mode gelap.

---

## Teknologi

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4
- **Visualisasi & Ikon**: Leaflet, Recharts, Lucide React
- **Dokumen & QR**: jsPDF, qrcode
- **Backend**: Node.js, Express.js, Nodemailer
- **Basis Data**: SQLite (`better-sqlite3`) dengan mode WAL

---

## Menjalankan Proyek Secara Lokal

### Prasyarat
- Node.js versi 20 atau lebih baru
- npm

### Langkah Instalasi

1. **Clone repositori**
   ```bash
   git clone https://github.com/tarohito/dash-cek-sumas.git
   cd dash-cek-sumas
   ```

2. **Pasang dependensi**
   ```bash
   npm install
   ```

3. **Siapkan variabel lingkungan**
   Salin file `.env.example` menjadi `.env` lalu sesuaikan nilainya bila diperlukan:
   ```bash
   cp .env.example .env
   ```

4. **Jalankan server pengembangan**
   ```bash
   npm run dev
   ```
   Aplikasi dapat diakses pada `http://localhost:3000`.

5. **Pemeriksaan tipe & build produksi**
   ```bash
   npm run lint
   npm run build
   npm start
   ```

---

## Variabel Lingkungan (`.env`)

| Variabel | Keterangan |
| --- | --- |
| `SESSION_SECRET` | Kunci rahasia untuk penandatanganan token sesi otentikasi |
| `RESEND_API_KEY` | Kunci API Resend untuk pengiriman email notifikasi (opsional) |
| `RESEND_FROM` | Alamat email pengirim Resend (opsional) |
| `SMTP_HOST` | Host server SMTP (opsional) |
| `SMTP_PORT` | Port server SMTP (opsional) |
| `SMTP_SECURE` | Gunakan koneksi TLS/SSL (`true`/`false`) |
| `SMTP_USER` | Nama pengguna akun SMTP |
| `SMTP_PASS` | Kata sandi akun SMTP |
| `SMTP_FROM` | Alamat email pengirim SMTP |
| `TELEGRAM_BOT_TOKEN` | Token bot Telegram (opsional) |
| `WHATSAPP_API_TOKEN` | Token gateway WhatsApp (opsional) |

---

## Struktur Direktori

```text
├── .env.example               # Contoh konfigurasi variabel lingkungan
├── database.sqlite            # Basis data SQLite lokal
├── index.html                 # Entry point HTML aplikasi
├── package.json               # Daftar dependensi dan skrip npm
├── public/                    # Aset statis (logo brand, avatar, aset publik)
├── server.ts                  # Server Express API, autentikasi, verifikasi publik & SQLite
├── src/
│   ├── App.tsx                # Antarmuka utama dasbor, navigasi, dan modal
│   ├── index.css              # Konfigurasi Tailwind CSS dan gaya global
│   ├── main.tsx               # Bootstrapper React
│   ├── seedData.ts            # Data awal pengguna, brand, produk, dan batch
│   ├── components/            # Komponen UI (Peta, Grafik, Login, Matriks RBAC, Pengaturan, SKU)
│   ├── data/                  # Data telemetri aktivitas pemindaian
│   └── utils/                 # Utilitas RBAC, sesi auth, kebijakan keamanan, PDF, optimasi gambar
├── tsconfig.json              # Konfigurasi TypeScript
└── vite.config.ts             # Konfigurasi bundler Vite
```

---

## Lisensi

Digunakan secara internal untuk pengelolaan verifikasi dan pemantauan tag fisik produk SUMAS.
