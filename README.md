# dash-cek-sumas

> Dasbor Pemantauan Geolokasi Pemindaian & Manajemen Tag Fisik Produk SUMAS.

Aplikasi manajemen dan pemantauan distribusi tag fisik QR Code verifikasi keaslian produk SUMAS (Material Partisi Cubicle Toilet & Phenolic Board B2B). Platform ini menyediakan visualisasi peta sebaran pemindaian real-time, deteksi indikasi anomali duplikasi pemindaian, pelacakan alokasi proyek konstruksi, serta sistem audit terintegrasi.

---

## Fitur Utama

- **Peta Persebaran Lokasi Pemindaian**: Pemantauan geolokasi pemindaian QR code di seluruh wilayah Indonesia dengan filter status:
  - Valid / Asli (Hijau)
  - Berulang Normal (Kuning)
  - Curiga Anomali / Duplikasi Simultan (Merah)
- **Tren & Aktivitas Pemindaian**: Diagram analitik volume pemindaian berkala (7 hari, 30 hari, dan 12 bulan).
- **Manajemen Batch & Tag Fisik**: Pengelolaan nomor seri tag fisik unik, PIN verifikasi publik, spesifikasi lembar phenolic board, dan status pemakaian.
- **Alokasi Proyek B2B**: Pengelompokan tag ke proyek spesifik (seperti RS Kediri, RS Islam Surabaya, IKN, dan proyek komersial lainnya) beserta masa garansi dan kode produksi.
- **Pusat Notifikasi & Riwayat Perubahan**: Pencatatan riwayat perubahan data spesifikasi batch dan permohonan reset kata sandi pengguna.
- **Manajemen Pengguna & Brand**: Pengelolaan brand dan hak akses pengguna (Administrator & Operator).
- **Desain Flat Modern**: Tampilan antarmuka bersih tanpa bayangan (flat design) serta mendukung mode gelap dan terang.

---

## Teknologi

- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS
- **Peta & Diagram**: Leaflet, Recharts, Lucide Icons
- **Backend API**: Express.js, Node.js
- **Basis Data**: SQLite (better-sqlite3) dengan mode WAL untuk performa tinggi

---

## Menjalankan Proyek Secara Lokal

### Prasyarat
- Node.js versi 20+ atau 22+
- npm

### Langkah Pemasangan

1. **Clone repositori**:
   ```bash
   git clone https://github.com/tarohito/dash-cek-sumas.git
   cd dash-cek-sumas
   ```

2. **Pasang dependensi**:
   ```bash
   npm install
   ```

3. **Jalankan server pengembangan**:
   ```bash
   npm run dev
   ```
   Aplikasi berjalan pada port `3000` di `http://localhost:3000`.

4. **Build untuk Produksi**:
   ```bash
   npm run build
   npm start
   ```

---

## Struktur Direktori

```text
├── database.sqlite       # Database SQLite lokal
├── index.html            # Entry HTML aplikasi
├── package.json          # Definisi dependensi & skrip
├── public/               # Aset statis & logo brand SUMAS
│   └── assets/
│       └── brand/
├── server.ts             # Server Express API & middleware frontend
├── src/
│   ├── components/       # Komponen visual (Peta, Diagram Tren, Tooltip)
│   ├── App.tsx           # Antarmuka dasbor utama & navigasi
│   ├── index.css         # Konfigurasi Tailwind & flat styling
│   └── main.tsx          # Bootstrapper React
├── tsconfig.json         # Konfigurasi TypeScript
└── vite.config.ts        # Konfigurasi bundler
```

---

## Lisensi

Didistribusikan untuk keperluan manajemen tag fisik produk SUMAS.
