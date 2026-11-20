# ☁️ Panduan Deploy Cloudflare Pages (GitHub Integration)

Repositori ini telah disiapkan dengan arsitektur **Full Cloudflare Native**:
* **Frontend:** React 19 + Vite + Tailwind CSS (`dist/`)
* **Backend API:** Cloudflare Pages Functions (`functions/api/`)
* **Database:** Cloudflare D1 Serverless SQLite (`d1/schema.sql` & `d1/seed.sql`)

---

## 📋 Langkah 1: Buat Database Cloudflare D1

1. Buka dashboard Cloudflare: [dash.cloudflare.com](https://dash.cloudflare.com)
2. Masuk ke menu **Storage & Databases** > **D1 SQL Database**.
3. Klik tombol **Create database**.
4. Beri nama database: `sumas-db` lalu klik **Create**.
5. Buka tab **Console** di database `sumas-db` Anda:
   * Buka file [`d1/schema.sql`](./d1/schema.sql), salin (copy) isinya, lalu tempel (paste) dan klik **Execute**.
   * Buka file [`d1/seed.sql`](./d1/seed.sql), salin (copy) isinya, lalu tempel (paste) dan klik **Execute**.
   *(Semua 3.000 serial tag QR, 15 batch produksi, telemetri scan, brand, dan produk sekarang telah masuk secara dinamis ke D1)*.

---

## 🚀 Langkah 2: Deploy dari GitHub di Cloudflare Pages

1. Masuk ke menu **Workers & Pages** > **Create application** > Tab **Pages**.
2. Pilih **Connect to Git** dan pilih repositori GitHub Anda: `dash-cek-sumas`.
3. Isi konfigurasi build:
   * **Project name:** `dash-cek-sumas`
   * **Production branch:** `main`
   * **Framework preset:** `Vite` (atau `None`)
   * **Build command:** `npm run build`
   * **Build output directory:** `dist`
4. Klik **Save and Deploy**. Cloudflare akan meng-compile frontend dan otomatis mendeteksi folder `functions/`.

---

## 🔗 Langkah 3: Sambungkan D1 Database ke Pages

1. Setelah proyek Pages terbuat, masuk ke:
   **Pages Project** > **Settings** > **Bindings** (atau **Functions** > **D1 database bindings**).
2. Klik **Add binding**:
   * **Variable name:** `DB` *(Wajib huruf kapital persis)*
   * **D1 Database:** Pilih `sumas-db` yang telah Anda buat pada Langkah 1.
3. Klik **Save**.
4. Lakukan **Retry deployment** terakhir (atau push commit baru) agar Pages terhubung ke database.

---

## ✨ Selesai!
Web dashboard dan API telemetri Anda sekarang berjalan **100% di edge Cloudflare** dengan kecepatan global, SSL otomatis, dan database dinamis D1!
