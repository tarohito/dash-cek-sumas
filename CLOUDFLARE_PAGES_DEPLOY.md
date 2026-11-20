# ☁️ Panduan Deploy Cloudflare Pages (Fullstack Edge + D1)

Repositori ini telah disiapkan dengan arsitektur **Full Cloudflare Native**:
- **Frontend:** React 19 + Vite + Tailwind CSS (`dist/`)
- **Backend API & Verifikasi QR:** Cloudflare Pages Functions (`functions/api/[[catchall]].ts`, `functions/q/[tagNumber].ts`) dengan dukungan Auth/Session Cookie, RBAC, dan isolasi multi-brand
- **Database:** Cloudflare D1 Serverless SQLite (`d1/schema.sql` & `d1/seed.sql`)

---

## 📋 Langkah 1: Siapkan Database Cloudflare D1

### Opsi A: Via CLI (`wrangler`)
1. Login ke Cloudflare:
   ```bash
   npx wrangler login
   ```
2. Jika belum memiliki database `sumas-db`, buat lalu perbarui `database_id` di `wrangler.jsonc`:
   ```bash
   npx wrangler d1 create sumas-db
   ```
3. Terapkan skema & data awal ke D1 Remote:
   ```bash
   npm run d1:seed:remote
   ```

### Opsi B: Via Dashboard Cloudflare
1. Buka [dash.cloudflare.com](https://dash.cloudflare.com) > **Storage & Databases** > **D1 SQL Database**.
2. Buat/buka database `sumas-db`, lalu buka tab **Console**:
   - Jalankan isi file [`d1/schema.sql`](./d1/schema.sql).
   - Jalankan isi file [`d1/seed.sql`](./d1/seed.sql).

*(Jika ada perubahan data lokal di `database.sqlite`, jalankan `npm run d1:export` untuk memperbarui `d1/schema.sql` dan `d1/seed.sql` secara aman tanpa menyertakan sesi aktif.)*

---

## 🔐 Langkah 2: Konfigurasi Environment / Secrets (Opsional & Direkomendasikan)

Pada **Cloudflare Pages Project** > **Settings** > **Variables and Secrets** (atau via CLI `npx wrangler pages secret put`):
- `SESSION_SECRET`: String acak minimal 32 karakter untuk menandatangani token sesi login (jika tidak diisi, sistem otomatis membuat & menyimpan secret di tabel `server_secrets` D1).
- `RESEND_API_KEY` & `RESEND_FROM`: Untuk pengiriman email peringatan keamanan dan reset kata sandi otomatis melalui Resend API.

---

## 🚀 Langkah 3: Deploy ke Cloudflare Pages

### Opsi A: Langsung dari Terminal (`wrangler`)
1. Pastikan seluruh pengecekan & build lolos:
   ```bash
   npm run cf:check
   ```
2. Uji coba lokal dengan Cloudflare D1 lokal (opsional):
   ```bash
   npm run d1:seed:local
   npm run pages:dev
   ```
3. Deploy ke Cloudflare Pages:
   ```bash
   npm run pages:deploy
   ```

### Opsi B: GitHub Integration (Auto-Deploy)
1. Masuk ke **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
2. Pilih repositori `dash-cek-sumas`, atur:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
3. Pada **Settings** > **Bindings**, tambahkan D1 Binding:
   - **Variable name:** `DB` *(Wajib huruf kapital persis)*
   - **D1 Database:** `sumas-db`
4. Klik **Save** lalu deploy ulang.
