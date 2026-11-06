import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import fs from 'fs';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));

// Helper Hashing Password Keamanan Tinggi dengan Salt (scrypt - memory-hard & GPU-resistant)
function hashPassword(password: string): string {
  if (!password || !password.trim()) return '';
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password.trim(), salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !password) return false;
  const parts = storedHash.split(':');
  if (parts.length === 3 && parts[0] === 'scrypt') {
    const [, salt, originalHash] = parts;
    const hash = crypto.scryptSync(password.trim(), salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(originalHash, 'hex'));
  }
  return password === storedHash;
}

// Initialize SQLite database with WAL mode for high performance concurrency
const db = new Database(path.join(__dirname, 'database.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// Create tables with indexes for high-throughput and handling thousands of records
db.exec(`
  CREATE TABLE IF NOT EXISTS batches (
    id TEXT PRIMARY KEY,
    batchId TEXT NOT NULL,
    date TEXT NOT NULL,
    project TEXT,
    sku TEXT NOT NULL,
    brand TEXT NOT NULL,
    qty INTEGER NOT NULL,
    specs TEXT,
    pinLength INTEGER NOT NULL,
    status TEXT NOT NULL,
    isB2B INTEGER NOT NULL,
    tags TEXT,
    redirectUrl TEXT DEFAULT 'https://cek.sumas.id/',
    qrType TEXT DEFAULT 'dynamic',
    requirePin INTEGER DEFAULT 1,
    enableGps INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    batchId TEXT NOT NULL,
    tagNumber TEXT NOT NULL,
    pin TEXT NOT NULL,
    status TEXT NOT NULL,
    project TEXT,
    specs TEXT,
    codeType TEXT,
    warranty TEXT,
    prodCode TEXT,
    note TEXT,
    allocatedAt TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_tags_batchId ON tags(batchId);
  CREATE INDEX IF NOT EXISTS idx_tags_status ON tags(status);
  CREATE INDEX IF NOT EXISTS idx_tags_search ON tags(batchId, status, tagNumber);
  CREATE INDEX IF NOT EXISTS idx_tags_pin ON tags(pin);

  CREATE TABLE IF NOT EXISTS scan_points (
    id TEXT PRIMARY KEY,
    city TEXT NOT NULL,
    province TEXT NOT NULL,
    venue TEXT,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    totalScans INTEGER NOT NULL,
    todayScans INTEGER NOT NULL,
    brand TEXT NOT NULL,
    productType TEXT,
    batchId TEXT,
    latestTagId TEXT,
    latestTime TEXT,
    isB2B INTEGER DEFAULT 0,
    status TEXT DEFAULT 'valid',
    anomalyReason TEXT,
    deviceInfo TEXT,
    createdAt TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_scan_points_status ON scan_points(status);
  CREATE INDEX IF NOT EXISTS idx_scan_points_brand ON scan_points(brand);

  CREATE TABLE IF NOT EXISTS scan_activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rangeType TEXT NOT NULL,
    label TEXT NOT NULL,
    fullDate TEXT NOT NULL,
    scans INTEGER NOT NULL,
    valid INTEGER NOT NULL,
    topBrand TEXT NOT NULL,
    sortOrder INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_scan_activities_range ON scan_activities(rangeType, sortOrder);

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY,
    batchId TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    user TEXT NOT NULL,
    reason TEXT NOT NULL,
    changes TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_audit_logs_batchId ON audit_logs(batchId);

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT,
    email TEXT NOT NULL,
    phone TEXT,
    role TEXT NOT NULL,
    avatar TEXT,
    status TEXT DEFAULT 'Aktif',
    createdAt TEXT
  );

  CREATE TABLE IF NOT EXISTS brands (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    logo TEXT,
    ownerId TEXT NOT NULL,
    ownerName TEXT NOT NULL,
    ownerEmail TEXT,
    ownerRole TEXT,
    description TEXT,
    category TEXT,
    status TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    brandId TEXT,
    brandName TEXT NOT NULL,
    sku TEXT NOT NULL,
    category TEXT,
    isB2B INTEGER DEFAULT 0,
    description TEXT,
    createdAt TEXT,
    skuCode TEXT,
    image TEXT
  );

  CREATE TABLE IF NOT EXISTS password_reset_requests (
    id TEXT PRIMARY KEY,
    userId TEXT,
    userName TEXT NOT NULL,
    userEmail TEXT NOT NULL,
    userRole TEXT NOT NULL,
    avatar TEXT,
    requestedAt TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Menunggu',
    actionNote TEXT,
    isRead INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS read_notifications (
    id TEXT PRIMARY KEY
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parentId TEXT,
    level INTEGER NOT NULL,
    code TEXT,
    description TEXT,
    status TEXT DEFAULT 'Aktif',
    itemCount INTEGER DEFAULT 0,
    orderIndex INTEGER DEFAULT 0,
    createdAt TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parentId);
  CREATE INDEX IF NOT EXISTS idx_categories_level ON categories(level);
`);

// Migrations: Pastikan kolom QR Code Dinamis tersedia di tabel batches
try {
  db.exec("ALTER TABLE batches ADD COLUMN redirectUrl TEXT DEFAULT 'https://cek.sumas.id/'");
} catch (_) {}
try {
  db.exec("ALTER TABLE batches ADD COLUMN qrType TEXT DEFAULT 'dynamic'");
} catch (_) {}
try {
  db.exec("ALTER TABLE batches ADD COLUMN requirePin INTEGER DEFAULT 1");
} catch (_) {}
try {
  db.exec("ALTER TABLE batches ADD COLUMN enableGps INTEGER DEFAULT 1");
} catch (_) {}

// Migration: Update any existing batch redirectUrl to https://cek.sumas.id/
try {
  db.prepare("UPDATE batches SET redirectUrl = 'https://cek.sumas.id/' WHERE redirectUrl LIKE '%verify%' OR redirectUrl LIKE '%maklonkosmetik%' OR redirectUrl IS NULL OR redirectUrl = ''").run();
} catch (_) {}

// Migration: Ensure Sumas brand name has capitalized first letter across tables
try {
  db.prepare("UPDATE brands SET name = 'Sumas' WHERE LOWER(name) = 'sumas'").run();
  db.prepare("UPDATE products SET brandName = 'Sumas' WHERE LOWER(brandName) = 'sumas'").run();
  db.prepare("UPDATE batches SET brand = 'Sumas' WHERE LOWER(brand) = 'sumas'").run();
  db.prepare("UPDATE scan_points SET brand = 'Sumas' WHERE LOWER(brand) = 'sumas'").run();
  db.prepare("UPDATE scan_activities SET topBrand = 'Sumas' WHERE LOWER(topBrand) = 'sumas'").run();
} catch (_) {}

// Migration: Ensure users table has all required columns in existing database
try {
  db.prepare('ALTER TABLE users ADD COLUMN username TEXT').run();
} catch (_) {}
try {
  db.prepare('ALTER TABLE users ADD COLUMN phone TEXT').run();
} catch (_) {}
try {
  db.prepare("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'Aktif'").run();
} catch (_) {}
try {
  db.prepare('ALTER TABLE users ADD COLUMN createdAt TEXT').run();
} catch (_) {}
try {
  db.prepare('ALTER TABLE users ADD COLUMN password TEXT').run();
} catch (_) {}

// Migration: Ensure products table has description and createdAt
try {
  db.prepare('ALTER TABLE products ADD COLUMN description TEXT').run();
} catch (_) {}
try {
  db.prepare('ALTER TABLE products ADD COLUMN skuCode TEXT').run();
} catch (_) {}
try {
  db.prepare('ALTER TABLE products ADD COLUMN createdAt TEXT').run();
} catch (_) {}
try {
  db.prepare('ALTER TABLE products ADD COLUMN image TEXT').run();
} catch (_) {}

// Update existing users with full data matching Tambah Pengguna form
try {
  const updateUserStmt = db.prepare('UPDATE users SET name = ?, username = ?, email = ?, phone = ?, role = ?, avatar = ?, status = ?, createdAt = ? WHERE id = ?');
  updateUserStmt.run('Kalingga Jeandy', 'kalingga.jeandy', 'kalinggajeandy3@gmail.com', '+62 812-8899-1020', 'Administrator', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80', 'Aktif', '28 Okt 2026, 08:30', 'u1');
  updateUserStmt.run('Budi Santoso', 'budi.santoso', 'budi.s@mki.co.id', '+62 813-7722-3344', 'Operator', 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=120&auto=format&fit=crop&q=80', 'Aktif', '28 Okt 2026, 09:15', 'u2');
  updateUserStmt.run('Rina Wijaya', 'rina.wijaya', 'rina.w@mki.co.id', '+62 821-4455-6677', 'Operator', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80', 'Aktif', '28 Okt 2026, 10:00', 'u3');
  updateUserStmt.run('Siti Rahma', 'siti.rahma', 'siti.r@mki.co.id', '+62 811-9988-7766', 'Operator', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80', 'Aktif', '28 Okt 2026, 11:30', 'u4');
} catch (_) {}

// Seed password_reset_requests if empty
const resetRequestsCountRow = db.prepare('SELECT COUNT(*) as count FROM password_reset_requests').get() as { count: number };
if (resetRequestsCountRow && resetRequestsCountRow.count === 0) {
  const insertResetReq = db.prepare(`
    INSERT INTO password_reset_requests (id, userId, userName, userEmail, userRole, avatar, requestedAt, status, actionNote, isRead)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertResetReq.run(
    'pr-1',
    'u3',
    'Budi Santoso',
    'budi.s@mki.co.id',
    'Operator',
    'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=120&auto=format&fit=crop&q=80',
    '15 menit yang lalu',
    'Menunggu',
    'Lupa kata sandi saat mencoba akses dari tablet lapangan proyek RSUD Kediri',
    0
  );
  insertResetReq.run(
    'pr-2',
    'u4',
    'Siti Rahma',
    'siti.r@mki.co.id',
    'Operator',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80',
    '1 jam yang lalu',
    'Menunggu',
    'Permintaan reset PIN dan kata sandi berkala perangkat brand operasional',
    0
  );
  insertResetReq.run(
    'pr-3',
    'u2',
    'admin',
    'admin@mki.co.id',
    'Administrator',
    'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80',
    'Kemarin, 16:40',
    'Disetujui',
    'Tautan reset sandi 1-kali pakai telah dikirim otomatis ke email terdaftar',
    1
  );
}

// Seed initial users if empty
const userCountRow = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
if (userCountRow && userCountRow.count === 0) {
  const insertUser = db.prepare(`
    INSERT INTO users (id, name, username, email, phone, role, avatar, status, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertUser.run('u1', 'Kalingga Jeandy', 'kalingga.jeandy', 'kalinggajeandy3@gmail.com', '+62 812-8899-1020', 'Administrator', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80', 'Aktif', '28 Okt 2026, 08:30');
  insertUser.run('u2', 'Budi Santoso', 'budi.santoso', 'budi.s@mki.co.id', '+62 813-7722-3344', 'Operator', 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=120&auto=format&fit=crop&q=80', 'Aktif', '28 Okt 2026, 09:15');
  insertUser.run('u3', 'Rina Wijaya', 'rina.wijaya', 'rina.w@mki.co.id', '+62 821-4455-6677', 'Operator', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80', 'Aktif', '28 Okt 2026, 10:00');
  insertUser.run('u4', 'Siti Rahma', 'siti.rahma', 'siti.r@mki.co.id', '+62 811-9988-7766', 'Operator', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80', 'Aktif', '28 Okt 2026, 11:30');
}

// Seed initial brands if empty
const brandCountRow = db.prepare('SELECT COUNT(*) as count FROM brands').get() as { count: number };
if (brandCountRow && brandCountRow.count === 0) {
  const insertBrand = db.prepare(`
    INSERT INTO brands (id, name, logo, ownerId, ownerName, ownerEmail, ownerRole, description, category, status, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertBrand.run(
    'br-sumas',
    'Sumas',
    '/assets/brand/logo_horizontal.svg',
    'u1',
    'Kalingga Jeandy',
    'kalinggajeandy3@gmail.com',
    'Administrator',
    'Material partisi cubicle toilet, phenolic board tahan air & benturan untuk proyek rumah sakit, bandara, mall, dan fasilitas komersial.',
    'Material & Konstruksi',
    'Aktif',
    '28 Okt 2026, 09:00'
  );
  insertBrand.run(
    'br-assc',
    'ASSC',
    '/assets/brand/assc_logo.svg',
    'u4',
    'Siti Rahma',
    'siti.r@mki.co.id',
    'Operator',
    'Lini streetwear retail eksklusif dengan sistem verifikasi QR code hologram anti-counterfeit dan PIN verifikasi publik.',
    'Fashion & Streetwear',
    'Aktif',
    '23 Mei 2025, 10:00'
  );
  insertBrand.run(
    'br-blimey',
    'BLIMEY!',
    '/assets/brand/blimey_logo.svg',
    'u3',
    'Budi Santoso',
    'budi.s@mki.co.id',
    'Operator',
    'Koleksi fashion premium & casual lifestyle dengan tag serial unik untuk garansi keaslian pakaian.',
    'Apparel & Lifestyle',
    'Aktif',
    '15 Jun 2025, 14:20'
  );
}

try {
  db.prepare("UPDATE brands SET logo = '/assets/brand/logo_horizontal.svg' WHERE LOWER(name) = 'sumas' OR logo LIKE '%logo_vertikal%' OR logo LIKE '%aistudio%'").run();
  db.prepare("UPDATE brands SET logo = '/assets/brand/assc_logo.svg' WHERE LOWER(name) = 'assc' OR logo LIKE '%unsplash%'").run();
  db.prepare("UPDATE brands SET logo = '/assets/brand/blimey_logo.svg' WHERE LOWER(name) = 'blimey!' OR logo LIKE '%unsplash%'").run();
} catch (_) {}

// Migration: Ensure all users have sharp, local vector avatars
try {
  db.prepare("UPDATE users SET avatar = '/assets/avatars/user_kalingga.svg' WHERE id = 'u1'").run();
  db.prepare("UPDATE users SET avatar = '/assets/avatars/user_budi.svg' WHERE id = 'u2'").run();
  db.prepare("UPDATE users SET avatar = '/assets/avatars/user_rina.svg' WHERE id = 'u3'").run();
  db.prepare("UPDATE users SET avatar = '/assets/avatars/user_siti.svg' WHERE id = 'u4'").run();
  db.prepare("UPDATE password_reset_requests SET avatar = '/assets/avatars/user_budi.svg' WHERE userId = 'u2' OR userName LIKE '%Budi%'").run();
  db.prepare("UPDATE password_reset_requests SET avatar = '/assets/avatars/user_rina.svg' WHERE userId = 'u3' OR userName LIKE '%Rina%'").run();
  db.prepare("UPDATE password_reset_requests SET avatar = '/assets/avatars/user_siti.svg' WHERE userId = 'u4' OR userName LIKE '%Siti%'").run();
} catch (_) {}

// Migration: Ensure products have rich description and creation dates
try {
  db.prepare("UPDATE products SET description = 'Partisi panel pintu phenolic 12mm tahan air dan benturan fasilitas komersial', createdAt = '28 Okt 2026, 09:30' WHERE id = 'p1'").run();
  db.prepare("UPDATE products SET description = 'Lembaran phenolic board high density solid core untuk sekat partisi cubicle', createdAt = '28 Okt 2026, 09:40' WHERE id = 'p2'").run();
  db.prepare("UPDATE products SET description = 'Set engsel gravity, handle indikator, lock set, dan leg support stainless 304', createdAt = '28 Okt 2026, 09:45' WHERE id = 'p3'").run();
  db.prepare("UPDATE products SET description = 'Exclusive collection t-shirt dengan tag hologram keaslian dan verifikasi serial', createdAt = '10 Nov 2026, 14:00' WHERE id = 'p4'").run();
  db.prepare("UPDATE products SET description = 'Heavyweight fleece hoodie dengan cetak sablon rubber premium dan tag pelindung QR', createdAt = '10 Nov 2026, 14:15' WHERE id = 'p5'").run();
  db.prepare("UPDATE products SET description = 'Polo strapback cap katun twill dengan bordir logo ikonik dan tag fisik', createdAt = '10 Nov 2026, 14:20' WHERE id = 'p6'").run();
  db.prepare("UPDATE products SET description = 'Edisi terbatas drop t-shirt bertema tipografi grafis dan label barcode verifikasi', createdAt = '12 Nov 2026, 11:00' WHERE id = 'p7'").run();
  db.prepare("UPDATE products SET description = 'Jacket casual windproof streetwear dengan tag verifikasi digital anti-palsu', createdAt = '12 Nov 2026, 11:30' WHERE id = 'p8'").run();
} catch (_) {}

// Seed initial products / SKUs if empty
const productCountRow = db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number };
if (productCountRow && productCountRow.count === 0) {
  const insertProduct = db.prepare(`
    INSERT INTO products (id, brandId, brandName, sku, category, isB2B)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertProduct.run('p1', 'br-sumas', 'Sumas', 'Pintu Cubicle Toilet', 'Material & Konstruksi', 1);
  insertProduct.run('p2', 'br-sumas', 'Sumas', 'Phenolic Board 12mm Standard', 'Material & Konstruksi', 1);
  insertProduct.run('p3', 'br-sumas', 'Sumas', 'Cubicle Hardware Set', 'Material & Konstruksi', 1);
  insertProduct.run('p4', 'br-assc', 'ASSC', 'Dew Drops', 'Fashion & Streetwear', 0);
  insertProduct.run('p5', 'br-assc', 'ASSC', 'ASSC Classic Hoodie', 'Fashion & Streetwear', 0);
  insertProduct.run('p6', 'br-assc', 'ASSC', 'Overthinking Cap', 'Fashion & Streetwear', 0);
  insertProduct.run('p7', 'br-blimey', 'BLIMEY!', 'A LITTLE CLOSER (BLIMEY!)', 'Apparel & Lifestyle', 0);
  insertProduct.run('p8', 'br-blimey', 'BLIMEY!', 'Oversized Street Jacket', 'Apparel & Lifestyle', 0);
}

// Seed initial 3-level categories if empty
const categoryCountRow = db.prepare('SELECT COUNT(*) as count FROM categories').get() as { count: number };
if (categoryCountRow && categoryCountRow.count === 0) {
  const insertCategory = db.prepare(`
    INSERT INTO categories (id, name, parentId, level, code, description, status, itemCount, orderIndex, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const initialCategories = [
    // === LEVEL 1: KATEGORI UTAMA ===
    { id: 'cat-mat', name: 'Material & Konstruksi', parentId: null, level: 1, code: 'MAT-B2B', description: 'Material partisi toilet, phenolic board tahan air, dan perlengkapan arsitektural komersial Sumas', status: 'Aktif', itemCount: 12, orderIndex: 1, createdAt: '2026-10-01' },
    { id: 'cat-app', name: 'Pakaian & Fashion', parentId: null, level: 1, code: 'APP-RET', description: 'Koleksi fashion retail, streetwear, dan apparel kasual berseri tag keaslian', status: 'Aktif', itemCount: 8, orderIndex: 2, createdAt: '2026-10-02' },
    { id: 'cat-acc', name: 'Aksesoris & Merchandise', parentId: null, level: 1, code: 'ACC-GDS', description: 'Aksesoris pelengkap, tas, topi, dan barang merchandise resmi brand', status: 'Aktif', itemCount: 6, orderIndex: 3, createdAt: '2026-10-03' },

    // === LEVEL 2: SUB-KATEGORI (Parent: Material & Konstruksi) ===
    { id: 'cat-cub', name: 'Partisi Cubicle Toilet', parentId: 'cat-mat', level: 2, code: 'CUB-01', description: 'Sistem partisi kubikal toilet modern untuk fasilitas publik dan rumah sakit', status: 'Aktif', itemCount: 4, orderIndex: 1, createdAt: '2026-10-05' },
    { id: 'cat-hdwr', name: 'Aksesoris & Hardware Cubicle', parentId: 'cat-mat', level: 2, code: 'HDW-02', description: 'Perangkat keras penopang, engsel, handle, dan kunci partisi', status: 'Aktif', itemCount: 3, orderIndex: 2, createdAt: '2026-10-06' },
    { id: 'cat-clad', name: 'Wall Cladding & Plafon', parentId: 'cat-mat', level: 2, code: 'CLD-03', description: 'Panel dinding tahan lembab dan pelapis estetika arsitektur', status: 'Aktif', itemCount: 2, orderIndex: 3, createdAt: '2026-10-07' },

    // === LEVEL 2: SUB-KATEGORI (Parent: Pakaian & Fashion) ===
    { id: 'cat-top', name: 'Atasan & T-Shirt', parentId: 'cat-app', level: 2, code: 'TOP-01', description: 'Kaos grafis oversized, t-shirt kasual katun premium', status: 'Aktif', itemCount: 3, orderIndex: 1, createdAt: '2026-10-08' },
    { id: 'cat-out', name: 'Outerwear & Jaket', parentId: 'cat-app', level: 2, code: 'OUT-02', description: 'Hoodie fleece tebal, jaket denim, dan overshirt', status: 'Aktif', itemCount: 2, orderIndex: 2, createdAt: '2026-10-09' },

    // === LEVEL 2: SUB-KATEGORI (Parent: Aksesoris & Merchandise) ===
    { id: 'cat-hat', name: 'Topi & Headwear', parentId: 'cat-acc', level: 2, code: 'HAT-01', description: 'Topi lengkung bordir dan kupluk rajut', status: 'Aktif', itemCount: 2, orderIndex: 1, createdAt: '2026-10-10' },
    { id: 'cat-bag', name: 'Tas & Pouch', parentId: 'cat-acc', level: 2, code: 'BAG-02', description: 'Tas selempang utility dan tote bag tahan air', status: 'Aktif', itemCount: 2, orderIndex: 2, createdAt: '2026-10-11' },

    // === LEVEL 3: SUB-SUB KATEGORI (Parent: Partisi Cubicle Toilet) ===
    { id: 'cat-phn12', name: 'Phenolic Board 12mm Standard', parentId: 'cat-cub', level: 3, code: 'PHN-12', description: 'Papan phenolic kompak 12mm densitas tinggi tahan air & benturan', status: 'Aktif', itemCount: 5, orderIndex: 1, createdAt: '2026-10-12' },
    { id: 'cat-phn15', name: 'Phenolic Board 15mm Heavy Duty', parentId: 'cat-cub', level: 3, code: 'PHN-15', description: 'Panel ketebalan 15mm untuk area dengan lalu lintas pengguna padat', status: 'Aktif', itemCount: 3, orderIndex: 2, createdAt: '2026-10-13' },
    { id: 'cat-anti', name: 'Antibacterial Board (Medis/RS)', parentId: 'cat-cub', level: 3, code: 'AB-MED', description: 'Lapisan higienis antibakteri khusus ruangan medis dan rumah sakit', status: 'Aktif', itemCount: 2, orderIndex: 3, createdAt: '2026-10-14' },
    { id: 'cat-wood', name: 'Woodgrain Texture Finish', parentId: 'cat-cub', level: 3, code: 'WG-FIN', description: 'Motif serat kayu elegan tahan kelembapan tinggi', status: 'Aktif', itemCount: 2, orderIndex: 4, createdAt: '2026-10-15' },

    // === LEVEL 3: SUB-SUB KATEGORI (Parent: Aksesoris & Hardware Cubicle) ===
    { id: 'cat-nyl', name: 'Nylon Fitting Set Hitam', parentId: 'cat-hdwr', level: 3, code: 'NYL-SET', description: 'Engsel, kaki penopang, dan kunci berbahan nylon tahan karat', status: 'Aktif', itemCount: 4, orderIndex: 1, createdAt: '2026-10-16' },
    { id: 'cat-ss304', name: 'Stainless Steel 304 Luxury', parentId: 'cat-hdwr', level: 3, code: 'SS-304', description: 'Fitting stainless steel SUS 304 anti-korosi premium', status: 'Aktif', itemCount: 3, orderIndex: 2, createdAt: '2026-10-17' },
    { id: 'cat-leg', name: 'Adjustable Leg 10-15cm', parentId: 'cat-hdwr', level: 3, code: 'LEG-ADJ', description: 'Kaki cubicle pengatur ketinggian lantai partisi', status: 'Aktif', itemCount: 2, orderIndex: 3, createdAt: '2026-10-18' },

    // === LEVEL 3: SUB-SUB KATEGORI (Parent: Wall Cladding) ===
    { id: 'cat-ext', name: 'Exterior Architectural Cladding', parentId: 'cat-clad', level: 3, code: 'EXT-CLD', description: 'Panel eksterior tahan cuaca ekstrem dan sinar UV', status: 'Aktif', itemCount: 1, orderIndex: 1, createdAt: '2026-10-19' },
    { id: 'cat-int', name: 'Interior Decorative Panel', parentId: 'cat-clad', level: 3, code: 'INT-DEC', description: 'Panel dinding dekoratif tahan rayap dan air', status: 'Aktif', itemCount: 1, orderIndex: 2, createdAt: '2026-10-20' },

    // === LEVEL 3: SUB-SUB KATEGORI (Parent: Atasan & T-Shirt) ===
    { id: 'cat-ovr', name: 'Oversized Boxy Cut Tee', parentId: 'cat-top', level: 3, code: 'TSH-OVR', description: 'Kaos potongan boxy katun combed 20s gramasi berat', status: 'Aktif', itemCount: 2, orderIndex: 1, createdAt: '2026-10-21' },
    { id: 'cat-reg', name: 'Regular Fit Graphic Tee', parentId: 'cat-top', level: 3, code: 'TSH-REG', description: 'T-shirt standar dengan sablon plastisol tahan cuci', status: 'Aktif', itemCount: 2, orderIndex: 2, createdAt: '2026-10-22' },

    // === LEVEL 3: SUB-SUB KATEGORI (Parent: Outerwear & Jaket) ===
    { id: 'cat-hood', name: 'Heavyweight Fleece Hoodie', parentId: 'cat-out', level: 3, code: 'HD-FLC', description: 'Hoodie katun fleece 330gsm dengan saku kangguru', status: 'Aktif', itemCount: 2, orderIndex: 1, createdAt: '2026-10-23' },
    { id: 'cat-dnm', name: 'Denim Trucker Jacket', parentId: 'cat-out', level: 3, code: 'JKT-DNM', description: 'Jaket denim 14oz raw selvedge', status: 'Aktif', itemCount: 1, orderIndex: 2, createdAt: '2026-10-24' },

    // === LEVEL 3: SUB-SUB KATEGORI (Parent: Topi & Headwear) ===
    { id: 'cat-cap', name: '6-Panel Curved Dad Cap', parentId: 'cat-hat', level: 3, code: 'CAP-06', description: 'Topi katun twill dengan pengait gesper kuningan', status: 'Aktif', itemCount: 2, orderIndex: 1, createdAt: '2026-10-25' },

    // === LEVEL 3: SUB-SUB KATEGORI (Parent: Tas & Pouch) ===
    { id: 'cat-slng', name: 'Utility Cordura Sling Bag', parentId: 'cat-bag', level: 3, code: 'BAG-SLN', description: 'Tas selempang multifungsi bahan cordura tahan percikan air', status: 'Aktif', itemCount: 2, orderIndex: 1, createdAt: '2026-10-26' }
  ];

  const insertAllCats = db.transaction((cats) => {
    for (const c of cats) {
      insertCategory.run(c.id, c.name, c.parentId, c.level, c.code, c.description, c.status, c.itemCount, c.orderIndex, c.createdAt);
    }
  });
  insertAllCats(initialCategories);
}

// Seed real scan locations into database if empty
const scanPointsCountRow = db.prepare('SELECT COUNT(*) as count FROM scan_points').get() as { count: number };
if (scanPointsCountRow && scanPointsCountRow.count === 0) {
  const insertScanPoint = db.prepare(`
    INSERT INTO scan_points (id, city, province, venue, lat, lng, totalScans, todayScans, brand, productType, batchId, latestTagId, latestTime, isB2B, status, anomalyReason, deviceInfo, createdAt)
    VALUES (@id, @city, @province, @venue, @lat, @lng, @totalScans, @todayScans, @brand, @productType, @batchId, @latestTagId, @latestTime, @isB2B, @status, @anomalyReason, @deviceInfo, @createdAt)
  `);

  const initialPoints = [
    {
      id: 'jkt-1',
      city: 'Jakarta Pusat',
      province: 'DKI Jakarta',
      venue: 'Grand Indonesia & Plaza Indonesia Mall',
      lat: -6.1950,
      lng: 106.8230,
      totalScans: 4820,
      todayScans: 184,
      brand: 'ASSC',
      productType: 'Streetwear Apparel Hoodie & Cap',
      batchId: 'BATCH-ASSC-082',
      latestTagId: 'ASSC-84920',
      latestTime: '2 menit yang lalu',
      isB2B: 0,
      status: 'valid',
      anomalyReason: null,
      deviceInfo: 'iPhone 15 Pro • Safari Mobile iOS 17.5',
      createdAt: '2026-10-20'
    },
    {
      id: 'jkt-2',
      city: 'Jakarta Utara',
      province: 'DKI Jakarta',
      venue: 'PIK 2 Central Market & Commercial Hub',
      lat: -6.1025,
      lng: 106.7212,
      totalScans: 2150,
      todayScans: 92,
      brand: 'SUMAS',
      productType: 'Cubicle Toilet Phenolic 12mm B2B',
      batchId: 'BATCH-SUM-001',
      latestTagId: 'SUMAS-B2B-1049',
      latestTime: '4 menit yang lalu',
      isB2B: 1,
      status: 'suspicious',
      anomalyReason: 'Duplikasi scan simultan dengan Surabaya (selisih 4 mnt)',
      deviceInfo: 'Samsung Galaxy S24 • Chrome Mobile v124',
      createdAt: '2026-10-21'
    },
    {
      id: 'sby-1',
      city: 'Surabaya',
      province: 'Jawa Timur',
      venue: 'Tunjungan Plaza 6 & Pakuwon Mall',
      lat: -7.2625,
      lng: 112.7381,
      totalScans: 3420,
      todayScans: 142,
      brand: 'SUMAS',
      productType: 'Cubicle Toilet Phenolic 12mm B2B',
      batchId: 'BATCH-SUM-001',
      latestTagId: 'SUMAS-B2B-1049',
      latestTime: '8 menit yang lalu',
      isB2B: 1,
      status: 'suspicious',
      anomalyReason: 'Duplikasi scan lokasi terpisah 780 km dengan Jakarta',
      deviceInfo: 'Xiaomi Redmi Note 13 • Mi Browser',
      createdAt: '2026-10-22'
    },
    {
      id: 'bdg-1',
      city: 'Bandung',
      province: 'Jawa Barat',
      venue: 'Paris Van Java & Jalan Dago Store',
      lat: -6.8893,
      lng: 107.5960,
      totalScans: 2890,
      todayScans: 110,
      brand: 'ASSC',
      productType: 'Graphic Tee Oversized & Accessories',
      batchId: 'BATCH-ASSC-082',
      latestTagId: 'ASSC-77319',
      latestTime: '24 menit yang lalu',
      isB2B: 0,
      status: 'repeated',
      anomalyReason: 'Scan Berulang Normal: Konsumen melakukan verifikasi keaslian ke-4 kalinya pada item yang sama.',
      deviceInfo: 'iPhone 14 • Safari iOS 17.2',
      createdAt: '2026-10-23'
    },
    {
      id: 'dps-1',
      city: 'Denpasar & Badung',
      province: 'Bali',
      venue: 'Seminyak Square & Canggu Coastal Hub',
      lat: -8.6882,
      lng: 115.1565,
      totalScans: 2340,
      todayScans: 98,
      brand: 'BLIMEY!',
      productType: 'Chino & Denim Jacket Collection',
      batchId: 'BATCH-BLM-041',
      latestTagId: 'BLM-92814',
      latestTime: '15 menit yang lalu',
      isB2B: 0,
      status: 'valid',
      anomalyReason: null,
      deviceInfo: 'Google Pixel 8 • Chrome Mobile',
      createdAt: '2026-10-24'
    },
    {
      id: 'ikn-1',
      city: 'Penajam Paser / IKN',
      province: 'Kalimantan Timur',
      venue: 'Proyek Gedung Kemenko & Rumah Susun ASN',
      lat: -0.9610,
      lng: 116.7020,
      totalScans: 1980,
      todayScans: 76,
      brand: 'SUMAS',
      productType: 'High Moisture Resistant Phenolic Partition',
      batchId: 'BATCH-SUM-002',
      latestTagId: 'SUMAS-IKN-0042',
      latestTime: '31 menit yang lalu',
      isB2B: 1,
      status: 'valid',
      anomalyReason: null,
      deviceInfo: 'iPad Air (5th gen) • Chrome iOS',
      createdAt: '2026-10-25'
    },
    {
      id: 'mdn-1',
      city: 'Medan',
      province: 'Sumatera Utara',
      venue: 'Sun Plaza & Podomoro City Deli Park',
      lat: 3.5852,
      lng: 98.6750,
      totalScans: 1750,
      todayScans: 65,
      brand: 'SUMAS',
      productType: 'Interior Architectural Wall Cladding',
      batchId: 'BATCH-SUM-003',
      latestTagId: 'SUMAS-MDN-081',
      latestTime: '45 menit yang lalu',
      isB2B: 1,
      status: 'repeated',
      anomalyReason: 'Pengecekan Ulang Proyek: Tim kontraktor melakukan audit checklist berkala untuk material terpasang.',
      deviceInfo: 'Samsung Tab S9 • Edge Mobile',
      createdAt: '2026-10-25'
    },
    {
      id: 'smg-1',
      city: 'Semarang',
      province: 'Jawa Tengah',
      venue: 'Kawasan Industri Candi & Simpang Lima',
      lat: -6.9932,
      lng: 110.4203,
      totalScans: 1180,
      todayScans: 43,
      brand: 'BLIMEY!',
      productType: 'Signature Denim Overshirt',
      batchId: 'BATCH-BLM-041',
      latestTagId: 'BLM-11938',
      latestTime: '1 jam yang lalu',
      isB2B: 0,
      status: 'suspicious',
      anomalyReason: 'Percobaan PIN salah 7x dalam 10 menit',
      deviceInfo: 'Unknown Device (Proxy IP Terdeteksi)',
      createdAt: '2026-10-26'
    },
    {
      id: 'mks-1',
      city: 'Makassar',
      province: 'Sulawesi Selatan',
      venue: 'Trans Studio Mall & Mall Panakkukang',
      lat: -5.1477,
      lng: 119.4327,
      totalScans: 1420,
      todayScans: 54,
      brand: 'ASSC',
      productType: 'Capsule Collection Hoodie',
      batchId: 'BATCH-ASSC-082',
      latestTagId: 'ASSC-55201',
      latestTime: '1 jam yang lalu',
      isB2B: 0,
      status: 'valid',
      anomalyReason: null,
      deviceInfo: 'Oppo Find N3 • Chrome Mobile',
      createdAt: '2026-10-26'
    },
    {
      id: 'ygy-1',
      city: 'Yogyakarta',
      province: 'DI Yogyakarta',
      venue: 'Ambarrukmo Plaza & RS Siloam',
      lat: -7.7828,
      lng: 110.4011,
      totalScans: 1290,
      todayScans: 51,
      brand: 'SUMAS',
      productType: 'Hospital Partition Board Antibacterial',
      batchId: 'BATCH-SUM-004',
      latestTagId: 'SUMAS-YGY-119',
      latestTime: '2 jam yang lalu',
      isB2B: 1,
      status: 'valid',
      anomalyReason: null,
      deviceInfo: 'iPhone 13 • Safari iOS',
      createdAt: '2026-10-27'
    },
    {
      id: 'kdr-1',
      city: 'Kediri',
      province: 'Jawa Timur',
      venue: 'RSUD Gambiran & Proyek RS Kediri',
      lat: -7.8228,
      lng: 112.0118,
      totalScans: 890,
      todayScans: 38,
      brand: 'SUMAS',
      productType: 'Pintu Cubicle Toilet Phenolic 12mm',
      batchId: 'SUMAS-BATCH-0001-10',
      latestTagId: 'SUMAS-TAG-00001',
      latestTime: '10 menit yang lalu',
      isB2B: 1,
      status: 'valid',
      anomalyReason: null,
      deviceInfo: 'Samsung Galaxy A54 • Chrome Mobile',
      createdAt: '2026-10-28'
    },
    {
      id: 'plm-1',
      city: 'Palembang',
      province: 'Sumatera Selatan',
      venue: 'Palembang Icon & Bandara Sultan Mahmud Badaruddin II',
      lat: -2.9761,
      lng: 104.7754,
      totalScans: 960,
      todayScans: 35,
      brand: 'BLIMEY!',
      productType: 'Lifestyle Apparel',
      batchId: 'BATCH-BLM-041',
      latestTagId: 'BLM-44219',
      latestTime: '3 jam yang lalu',
      isB2B: 0,
      status: 'valid',
      anomalyReason: null,
      deviceInfo: 'Vivo V29 • Chrome Mobile',
      createdAt: '2026-10-28'
    }
  ];

  const insertAllPoints = db.transaction((points) => {
    for (const p of points) {
      insertScanPoint.run(p);
    }
  });
  insertAllPoints(initialPoints);
}

// Seed real scan activities into database if empty
const scanActivitiesCountRow = db.prepare('SELECT COUNT(*) as count FROM scan_activities').get() as { count: number };
if (scanActivitiesCountRow && scanActivitiesCountRow.count === 0) {
  const insertActivity = db.prepare(`
    INSERT INTO scan_activities (rangeType, label, fullDate, scans, valid, topBrand, sortOrder)
    VALUES (@rangeType, @label, @fullDate, @scans, @valid, @topBrand, @sortOrder)
  `);

  const initialActivities = [
    // 7 Days
    { rangeType: '7d', label: 'Sen (26/10)', fullDate: '26 Okt 2026', scans: 520, valid: 519, topBrand: 'SUMAS', sortOrder: 1 },
    { rangeType: '7d', label: 'Sel (27/10)', fullDate: '27 Okt 2026', scans: 680, valid: 679, topBrand: 'ASSC', sortOrder: 2 },
    { rangeType: '7d', label: 'Rab (28/10)', fullDate: '28 Okt 2026', scans: 610, valid: 608, topBrand: 'BLIMEY!', sortOrder: 3 },
    { rangeType: '7d', label: 'Kam (29/10)', fullDate: '29 Okt 2026', scans: 790, valid: 788, topBrand: 'SUMAS', sortOrder: 4 },
    { rangeType: '7d', label: 'Jum (30/10)', fullDate: '30 Okt 2026', scans: 940, valid: 938, topBrand: 'ASSC', sortOrder: 5 },
    { rangeType: '7d', label: 'Sab (31/10)', fullDate: '31 Okt 2026', scans: 1120, valid: 1118, topBrand: 'ASSC', sortOrder: 6 },
    { rangeType: '7d', label: 'Min (01/11)', fullDate: '01 Nov 2026', scans: 860, valid: 859, topBrand: 'BLIMEY!', sortOrder: 7 },

    // 30 Days
    { rangeType: '30d', label: 'Minggu 1', fullDate: '01 - 07 Okt 2026', scans: 3450, valid: 3442, topBrand: 'SUMAS', sortOrder: 1 },
    { rangeType: '30d', label: 'Minggu 2', fullDate: '08 - 14 Okt 2026', scans: 4120, valid: 4110, topBrand: 'ASSC', sortOrder: 2 },
    { rangeType: '30d', label: 'Minggu 3', fullDate: '15 - 21 Okt 2026', scans: 4890, valid: 4881, topBrand: 'SUMAS', sortOrder: 3 },
    { rangeType: '30d', label: 'Minggu 4', fullDate: '22 - 28 Okt 2026', scans: 5410, valid: 5402, topBrand: 'BLIMEY!', sortOrder: 4 },
    { rangeType: '30d', label: 'Minggu 5', fullDate: '29 Okt - 01 Nov', scans: 2920, valid: 2915, topBrand: 'ASSC', sortOrder: 5 },

    // 12 Months
    { rangeType: '12m', label: 'Jan', fullDate: 'Januari 2026', scans: 8900, valid: 8880, topBrand: 'SUMAS', sortOrder: 1 },
    { rangeType: '12m', label: 'Feb', fullDate: 'Februari 2026', scans: 10400, valid: 10380, topBrand: 'SUMAS', sortOrder: 2 },
    { rangeType: '12m', label: 'Mar', fullDate: 'Maret 2026', scans: 12100, valid: 12075, topBrand: 'ASSC', sortOrder: 3 },
    { rangeType: '12m', label: 'Apr', fullDate: 'April 2026', scans: 11800, valid: 11770, topBrand: 'BLIMEY!', sortOrder: 4 },
    { rangeType: '12m', label: 'Mei', fullDate: 'Mei 2026', scans: 13900, valid: 13865, topBrand: 'SUMAS', sortOrder: 5 },
    { rangeType: '12m', label: 'Jun', fullDate: 'Juni 2026', scans: 14500, valid: 14470, topBrand: 'ASSC', sortOrder: 6 },
    { rangeType: '12m', label: 'Jul', fullDate: 'Juli 2026', scans: 15800, valid: 15760, topBrand: 'BLIMEY!', sortOrder: 7 },
    { rangeType: '12m', label: 'Agt', fullDate: 'Agustus 2026', scans: 17200, valid: 17160, topBrand: 'SUMAS', sortOrder: 8 },
    { rangeType: '12m', label: 'Sep', fullDate: 'September 2026', scans: 16900, valid: 16860, topBrand: 'ASSC', sortOrder: 9 },
    { rangeType: '12m', label: 'Okt', fullDate: 'Oktober 2026', scans: 18492, valid: 18450, topBrand: 'SUMAS', sortOrder: 10 },
    { rangeType: '12m', label: 'Nov', fullDate: 'November 2026', scans: 4820, valid: 4812, topBrand: 'ASSC', sortOrder: 11 }
  ];

  const insertAllActivities = db.transaction((activities) => {
    for (const a of activities) {
      insertActivity.run(a);
    }
  });
  insertAllActivities(initialActivities);
}

// Generate permanent tags helper: ID format campuran angka dan huruf (8 karakter alfanumerik unik) & PIN angka saja (default 8 digit)
function generateTagsForBatch(batchId: string, brand: string, count: number, pinLen = 8, allocatedCount = 0, projectName = '', specs = 'Phenolic Board 12mm') {
  const pinDigits = '0123456789';
  const idChars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const tags = [];
  const usedTagNumbers = new Set<string>();
  const targetPinLen = Math.min(12, Math.max(4, Number(pinLen) || 8));

  // Ambil tagNumber yang sudah ada di database untuk mencegah tabrakan ID
  try {
    const existing = db.prepare('SELECT tagNumber FROM tags').all() as { tagNumber: string }[];
    for (const row of existing) {
      if (row.tagNumber) usedTagNumbers.add(row.tagNumber);
    }
  } catch (_) {}

  for (let i = 1; i <= count; i++) {
    // Format PIN: HANYA ANGKA SAJA (0-9)
    let pin = '';
    for (let p = 0; p < targetPinLen; p++) {
      pin += pinDigits.charAt(Math.floor(Math.random() * pinDigits.length));
    }
    const isAllocated = i <= allocatedCount;

    // Format ID Tag: CAMPURAN ANGKA DAN HURUF (8 Karakter Alfanumerik Unik)
    let tagNumber = '';
    do {
      let cand = '';
      for (let c = 0; c < 8; c++) {
        cand += idChars.charAt(Math.floor(Math.random() * idChars.length));
      }
      // Pastikan ada campuran huruf kapital dan angka
      if (/[A-Z]/.test(cand) && /[0-9]/.test(cand)) {
        tagNumber = cand;
      }
    } while (!tagNumber || usedTagNumbers.has(tagNumber));
    usedTagNumbers.add(tagNumber);

    tags.push({
      id: `tag-${batchId}-${tagNumber}`,
      batchId,
      tagNumber,
      pin,
      status: isAllocated ? 'Telah Digunakan' : 'Tersedia',
      project: isAllocated ? projectName : null,
      specs: isAllocated ? specs : '-',
      codeType: isAllocated ? `${brand}-CUB-2026` : '-',
      warranty: isAllocated ? '5 Tahun' : '-',
      prodCode: isAllocated ? 'PRD-KDR-001' : '-',
      note: isAllocated ? 'Pemasangan lantai 2 & 3 RS Kediri' : '-',
      allocatedAt: isAllocated ? '28 Okt 2026, 09:30' : null
    });
  }
  return tags;
}

// Insert tags in batch transaction into database
const insertTagStmt = db.prepare(`
  INSERT OR REPLACE INTO tags (id, batchId, tagNumber, pin, status, project, specs, codeType, warranty, prodCode, note, allocatedAt)
  VALUES (@id, @batchId, @tagNumber, @pin, @status, @project, @specs, @codeType, @warranty, @prodCode, @note, @allocatedAt)
`);
const insertBatchTags = db.transaction((tags) => {
  for (const t of tags) {
    insertTagStmt.run(t);
  }
});

// Seed batches and tags in SQLite
const batchCountRow = db.prepare('SELECT COUNT(*) as count FROM batches').get() as { count: number };
if (batchCountRow && batchCountRow.count === 0) {
  const insertBatch = db.prepare(`
    INSERT INTO batches (id, batchId, date, project, sku, brand, qty, specs, pinLength, status, isB2B, tags)
    VALUES (@id, @batchId, @date, @project, @sku, @brand, @qty, @specs, @pinLength, @status, @isB2B, @tags)
  `);

  insertBatch.run({
    id: 'b1',
    batchId: 'SUMAS-BATCH-0001-10',
    date: '28 Okt 2026, 09:15',
    project: 'RS Kediri',
    sku: 'Pintu Cubicle Toilet',
    brand: 'SUMAS',
    qty: 10,
    specs: 'Phenolic Board 12mm',
    pinLength: 6,
    status: 'Aktif',
    isB2B: 1,
    tags: null
  });

  const sumasTags = generateTagsForBatch('b1', 'SUMAS', 10, 6, 5, 'RS Kediri', 'Phenolic Board 12mm');
  insertBatchTags(sumasTags);

  insertBatch.run({
    id: 'b2',
    batchId: 'LEGACY-BATCH-0006-07',
    date: '23 Mei 2025, 11:27',
    project: null,
    sku: 'Dew Drops',
    brand: 'ASSC',
    qty: 1000,
    specs: '-',
    pinLength: 7,
    status: 'Aktif',
    isB2B: 0,
    tags: null
  });

  const asscTags = generateTagsForBatch('b2', 'ASSC', 1000, 7, 0, '');
  insertBatchTags(asscTags);

  const insertLog = db.prepare(`
    INSERT INTO audit_logs (id, batchId, timestamp, user, reason, changes)
    VALUES (@id, @batchId, @timestamp, @user, @reason, @changes)
  `);

  insertLog.run({
    id: 1730260800000,
    batchId: 'SUMAS-BATCH-0001-10',
    timestamp: '29 Okt 2026, 10:20',
    user: 'Administrator',
    reason: 'Klien meminta penyesuaian ketebalan material karena standar kelembaban ruangan RS berubah.',
    changes: JSON.stringify([
      { field: 'Spesifikasi', old: 'Phenolic Board 10mm', new: 'Phenolic Board 12mm' }
    ])
  });
} else {
  // Ensure tags table has rows for any existing batches that may have tags in batches.tags column
  const existingBatches = db.prepare('SELECT id, batchId, brand, qty, pinLength, isB2B, project, specs, tags FROM batches').all() as any[];
  for (const b of existingBatches) {
    const tagCount = db.prepare('SELECT COUNT(*) as count FROM tags WHERE batchId = ?').get(b.id) as { count: number };
    if (!tagCount || tagCount.count === 0) {
      if (b.tags) {
        try {
          const parsed = JSON.parse(b.tags);
          if (Array.isArray(parsed) && parsed.length > 0) {
            insertBatchTags(parsed.map((t: any) => ({
              ...t,
              batchId: b.id,
              status: t.status || 'Tersedia'
            })));
            continue;
          }
        } catch (_) {}
      }
      // Otherwise generate on the fly
      const generated = generateTagsForBatch(b.id, b.brand, b.qty, b.pinLength || 6, b.project ? Math.floor(b.qty / 2) : 0, b.project || '', b.specs || '-');
      insertBatchTags(generated);
    }
  }
}

// Ensure b1 tags have clean project allocations (RS Kediri and RS Islam Surabaya separated)
try {
  const lumpedRow = db.prepare("SELECT COUNT(*) as count FROM tags WHERE batchId = 'b1' AND project LIKE '%,%'").get() as { count: number };
  if (lumpedRow && lumpedRow.count > 0) {
    db.prepare(`
      UPDATE tags 
      SET project = 'RS Kediri', 
          specs = 'Phenolic Board 12mm', 
          codeType = 'SUMAS-CUB-2026', 
          warranty = '5 Tahun', 
          prodCode = 'PRD-KDR-001', 
          note = 'Pemasangan lantai 2 & 3 RS Kediri',
          allocatedAt = '28 Okt 2026, 09:30'
      WHERE batchId = 'b1' AND id IN ('tag-b1-1', 'tag-b1-2', 'tag-b1-3')
    `).run();

    db.prepare(`
      UPDATE tags 
      SET project = 'RS Islam Surabaya', 
          specs = 'Phenolic Board 12mm', 
          codeType = 'SUMAS-CUB-2026', 
          warranty = '5 Tahun', 
          prodCode = 'PRD-SBY-002', 
          note = 'Gedung Rawat Inap Baru Lt 4',
          allocatedAt = '29 Okt 2026, 14:10'
      WHERE batchId = 'b1' AND id IN ('tag-b1-4', 'tag-b1-5')
    `).run();

    db.prepare("UPDATE batches SET project = 'RS Kediri, RS Islam Surabaya' WHERE id = 'b1'").run();
  }
} catch (e) {
  console.error('Migration notice:', e);
}

// Migration: Ensure all tags across all batches have alphanumeric format ID (mixture of letters & numbers) and numeric-only PIN
try {
  const existingTags = db.prepare('SELECT rowid, id, batchId, tagNumber, pin FROM tags').all() as any[];
  const idChars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const usedNumbers = new Set<string>();

  for (const t of existingTags) {
    if (/[A-Z]/.test(t.tagNumber) && /[0-9]/.test(t.tagNumber)) {
      usedNumbers.add(t.tagNumber);
    }
  }

  const updateTagFormatStmt = db.prepare('UPDATE tags SET tagNumber = ?, id = ?, pin = ? WHERE rowid = ?');
  const runMigration = db.transaction(() => {
    for (const t of existingTags) {
      let changed = false;
      let newTagNumber = t.tagNumber;
      // If tagNumber doesn't have both letters and digits or length !== 8, generate an 8-character alphanumeric ID
      if (!/[A-Z]/.test(t.tagNumber) || !/[0-9]/.test(t.tagNumber) || t.tagNumber.length !== 8) {
        do {
          let cand = '';
          for (let c = 0; c < 8; c++) {
            cand += idChars.charAt(Math.floor(Math.random() * idChars.length));
          }
          if (/[A-Z]/.test(cand) && /[0-9]/.test(cand)) {
            newTagNumber = cand;
          }
        } while (!newTagNumber || usedNumbers.has(newTagNumber));
        usedNumbers.add(newTagNumber);
        changed = true;
      }

      // Ensure PIN is strictly digits (0-9)
      let cleanPin = String(t.pin).replace(/[^0-9]/g, '');
      if (cleanPin.length < 4) cleanPin = (cleanPin + '12345678').slice(0, 8);
      if (cleanPin !== t.pin) changed = true;

      if (changed) {
        const newId = `tag-${t.batchId}-${newTagNumber}`;
        updateTagFormatStmt.run(newTagNumber, newId, cleanPin, t.rowid);
      }
    }
  });
  runMigration();
} catch (err) {
  console.warn('Migration for alphanumeric tag numbers error:', err);
}

// ==========================================
// REST API ENDPOINTS: SCAN LOCATIONS & TELEMETRY
// ==========================================

// Get all real scan locations from SQLite
app.get('/api/scans/locations', (_req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM scan_points ORDER BY totalScans DESC').all() as any[];
    const result = rows.map((r) => ({
      ...r,
      isB2B: Boolean(r.isB2B)
    }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Get scan telemetry summary stats from SQLite
app.get('/api/scans/stats', (_req, res) => {
  try {
    const totalPoints = db.prepare('SELECT COUNT(*) as count FROM scan_points').get() as { count: number };
    const validCount = db.prepare("SELECT COUNT(*) as count FROM scan_points WHERE status = 'valid'").get() as { count: number };
    const repeatedCount = db.prepare("SELECT COUNT(*) as count FROM scan_points WHERE status = 'repeated'").get() as { count: number };
    const suspiciousCount = db.prepare("SELECT COUNT(*) as count FROM scan_points WHERE status = 'suspicious'").get() as { count: number };
    const scanSums = db.prepare('SELECT COALESCE(SUM(totalScans), 0) as totalScans, COALESCE(SUM(todayScans), 0) as todayScans FROM scan_points').get() as { totalScans: number; todayScans: number };

    res.json({
      totalLocations: totalPoints.count,
      totalScans: scanSums.totalScans,
      todayScans: scanSums.todayScans,
      valid: validCount.count,
      repeated: repeatedCount.count,
      suspicious: suspiciousCount.count
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Get scan activity chart data by range from SQLite
app.get('/api/scans/activity', (req, res) => {
  try {
    const range = (req.query.range as string) || '7d';
    const rows = db.prepare('SELECT * FROM scan_activities WHERE rangeType = ? ORDER BY sortOrder ASC').all(range);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Record a new scan event into SQLite
app.post('/api/scans/record', (req, res) => {
  try {
    const s = req.body;
    const stmt = db.prepare(`
      INSERT INTO scan_points (id, city, province, venue, lat, lng, totalScans, todayScans, brand, productType, batchId, latestTagId, latestTime, isB2B, status, anomalyReason, deviceInfo, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const newId = s.id || `scan-${Date.now()}`;
    stmt.run(
      newId,
      s.city,
      s.province || '',
      s.venue || '',
      s.lat,
      s.lng,
      s.totalScans || 1,
      s.todayScans || 1,
      s.brand,
      s.productType || '',
      s.batchId || '',
      s.latestTagId || '',
      s.latestTime || 'Baru saja',
      s.isB2B ? 1 : 0,
      s.status || 'valid',
      s.anomalyReason || null,
      s.deviceInfo || 'Mobile Web Scanner',
      new Date().toISOString().split('T')[0]
    );
    res.json({ success: true, id: newId });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ==============================================================
// REST API ENDPOINTS: BATCHES & ULTRA-LIGHTWEIGHT PAGINATED TAGS
// ==============================================================

// Get batches metadata (LIGHTWEIGHT - without transmitting giant tag arrays)
app.get('/api/batches', (_req, res) => {
  try {
    const query = `
      SELECT 
        b.id,
        b.batchId,
        b.date,
        b.project,
        b.sku,
        b.brand,
        b.qty,
        b.specs,
        b.pinLength,
        b.status,
        b.isB2B,
        b.redirectUrl,
        b.qrType,
        b.requirePin,
        b.enableGps,
        COALESCE(tc.totalCount, b.qty) as actualTagCount,
        COALESCE(tc.availableCount, b.qty) as availableCount,
        COALESCE(tc.usedCount, 0) as usedCount
      FROM batches b
      LEFT JOIN (
        SELECT 
          batchId, 
          COUNT(*) as totalCount,
          SUM(CASE WHEN status = 'Tersedia' THEN 1 ELSE 0 END) as availableCount,
          SUM(CASE WHEN status = 'Telah Digunakan' THEN 1 ELSE 0 END) as usedCount
        FROM tags
        GROUP BY batchId
      ) tc ON tc.batchId = b.id
      ORDER BY b.rowid DESC
    `;
    const rows = db.prepare(query).all() as any[];
    const result = rows.map((row) => ({
      ...row,
      isB2B: Boolean(row.isB2B),
      redirectUrl: row.redirectUrl || 'https://cek.sumas.id/',
      qrType: row.qrType || 'dynamic',
      requirePin: row.requirePin === null || row.requirePin === undefined ? true : Boolean(row.requirePin),
      enableGps: row.enableGps === null || row.enableGps === undefined ? true : Boolean(row.enableGps),
      tags: null // Clean, lightweight response
    }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Get paginated tags for a specific batch (Accommodates 10,000+ tags with sub-millisecond response)
app.get('/api/batches/:id/tags', (req, res) => {
  try {
    const { id } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(500, Math.max(10, parseInt(req.query.limit as string) || 96));
    const offset = (page - 1) * limit;
    const search = ((req.query.search as string) || '').trim().toLowerCase();
    const status = (req.query.status as string) || 'all';
    const project = (req.query.project as string) || 'all';

    let countQuery = 'SELECT COUNT(*) as count FROM tags WHERE batchId = ?';
    let dataQuery = 'SELECT * FROM tags WHERE batchId = ?';
    const params: any[] = [id];

    if (search) {
      const searchClause = ' AND (LOWER(pin) LIKE ? OR LOWER(tagNumber) LIKE ? OR LOWER(COALESCE(project, "")) LIKE ?)';
      countQuery += searchClause;
      dataQuery += searchClause;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (status !== 'all') {
      const statusClause = ' AND status = ?';
      countQuery += statusClause;
      dataQuery += statusClause;
      params.push(status);
    }

    if (project !== 'all') {
      if (project === 'unallocated') {
        const projClause = ' AND (project IS NULL OR project = "")';
        countQuery += projClause;
        dataQuery += projClause;
      } else {
        const projClause = ' AND project = ?';
        countQuery += projClause;
        dataQuery += projClause;
        params.push(project);
      }
    }

    dataQuery += ' ORDER BY rowid ASC LIMIT ? OFFSET ?';
    const dataParams = [...params, limit, offset];

    const totalCountRow = db.prepare(countQuery).get(...params) as { count: number };
    const totalCount = totalCountRow ? totalCountRow.count : 0;
    const tags = db.prepare(dataQuery).all(...dataParams);

    // Also get fast overall batch counts
    const batchSummary = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'Tersedia' THEN 1 ELSE 0 END) as available,
        SUM(CASE WHEN status = 'Telah Digunakan' THEN 1 ELSE 0 END) as used
      FROM tags WHERE batchId = ?
    `).get(id) as { total: number; available: number; used: number };

    res.json({
      tags,
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit) || 1,
      batchSummary: {
        total: batchSummary?.total || 0,
        available: batchSummary?.available || 0,
        used: batchSummary?.used || 0
      }
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Endpoint untuk mengambil seluruh tag batch (untuk render PDF A3+ dan ekspor data)
app.get('/api/batches/:id/all-tags', (req, res) => {
  try {
    const { id } = req.params;
    const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(id) as any;
    if (!batch) {
      return res.status(404).json({ error: 'Batch tidak ditemukan' });
    }
    const tags = db.prepare('SELECT id, batchId, tagNumber, pin, status, project, specs FROM tags WHERE batchId = ? ORDER BY rowid ASC').all(id);
    res.json({
      batch,
      tags,
      total: tags.length
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Get batch summary and project allocations
app.get('/api/batches/:id/summary', (req, res) => {
  try {
    const { id } = req.params;
    const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(id) as any;
    if (!batch) {
      return res.status(404).json({ error: 'Batch tidak ditemukan' });
    }

    const tagStats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'Tersedia' THEN 1 ELSE 0 END) as available,
        SUM(CASE WHEN status = 'Telah Digunakan' THEN 1 ELSE 0 END) as used
      FROM tags WHERE batchId = ?
    `).get(id) as { total: number; available: number; used: number };

    const projectAllocations = db.prepare(`
      SELECT 
        project as name, 
        COUNT(*) as count, 
        specs, 
        warranty, 
        codeType, 
        prodCode, 
        note, 
        MAX(allocatedAt) as date
      FROM tags 
      WHERE batchId = ? AND project IS NOT NULL AND status = 'Telah Digunakan'
      GROUP BY project
    `).all(id);

    res.json({
      batch: { ...batch, isB2B: Boolean(batch.isB2B) },
      totalTags: tagStats?.total || batch.qty,
      availableCount: tagStats?.available || 0,
      usedCount: tagStats?.used || 0,
      projects: projectAllocations
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Create batch with high-speed transaction for thousands of tags
app.post('/api/batches', (req, res) => {
  try {
    const b = req.body;
    const qty = Math.max(1, parseInt(b.qty) || 1);
    const pinLength = Math.min(12, Math.max(4, parseInt(b.pinLength) || 8)); // Default 8 digit, mendukung opsi 4, 5, 6, 7, 8 digit
    const isB2B = b.isB2B ? 1 : 0;
    const redirectUrl = (b.redirectUrl && b.redirectUrl.trim()) || 'https://cek.sumas.id/';
    const qrType = b.qrType || 'dynamic';
    const requirePin = b.requirePin === false || b.requirePin === 0 ? 0 : 1;
    const enableGps = b.enableGps === false || b.enableGps === 0 ? 0 : 1;

    const stmt = db.prepare(`
      INSERT INTO batches (id, batchId, date, project, sku, brand, qty, specs, pinLength, status, isB2B, tags, redirectUrl, qrType, requirePin, enableGps)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
    `);

    stmt.run(
      b.id,
      b.batchId,
      b.date,
      b.project || null,
      b.sku,
      b.brand,
      qty,
      b.specs || '-',
      pinLength,
      b.status || 'Aktif',
      isB2B,
      redirectUrl,
      qrType,
      requirePin,
      enableGps
    );

    // High performance bulk insertion of tags in single SQLite transaction
    const generatedTags = generateTagsForBatch(b.id, b.brand, qty, pinLength, 0, '');
    insertBatchTags(generatedTags);

    res.json({
      ...b,
      qty,
      pinLength,
      isB2B: Boolean(isB2B),
      redirectUrl,
      qrType,
      requirePin: Boolean(requirePin),
      enableGps: Boolean(enableGps),
      actualTagCount: qty,
      availableCount: qty,
      usedCount: 0
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Update dynamic QR redirect URL & security settings for an existing batch
app.patch('/api/batches/:id/redirect-url', (req, res) => {
  try {
    const { id } = req.params;
    const { redirectUrl, qrType, requirePin, enableGps } = req.body;
    const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(id) as any;
    if (!batch) {
      return res.status(404).json({ error: 'Batch tidak ditemukan' });
    }

    const newUrl = redirectUrl !== undefined ? redirectUrl.trim() : (batch.redirectUrl || 'https://cek.sumas.id/');
    const newQrType = qrType || batch.qrType || 'dynamic';
    const newRequirePin = requirePin !== undefined ? (requirePin ? 1 : 0) : (batch.requirePin ?? 1);
    const newEnableGps = enableGps !== undefined ? (enableGps ? 1 : 0) : (batch.enableGps ?? 1);

    db.prepare(`
      UPDATE batches 
      SET redirectUrl = ?, qrType = ?, requirePin = ?, enableGps = ?
      WHERE id = ?
    `).run(newUrl, newQrType, newRequirePin, newEnableGps, id);

    // Audit log
    const logId = Date.now();
    const timestamp = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
    db.prepare(`
      INSERT INTO audit_logs (id, batchId, timestamp, user, reason, changes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      logId,
      batch.batchId,
      timestamp,
      'Super Admin',
      'Pembaruan URL Pengalihan QR Dinamis',
      JSON.stringify([
        { field: 'URL Pengalihan Dinamis', old: batch.redirectUrl || '-', new: newUrl },
        { field: 'Mode QR', old: batch.qrType || 'dynamic', new: newQrType }
      ])
    );

    res.json({
      success: true,
      id,
      redirectUrl: newUrl,
      qrType: newQrType,
      requirePin: Boolean(newRequirePin),
      enableGps: Boolean(newEnableGps)
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Dynamic QR Code Resolver Endpoint: /q/:tagNumber
app.get('/q/:tagNumber', (req, res) => {
  try {
    const { tagNumber } = req.params;
    const tag = db.prepare('SELECT * FROM tags WHERE tagNumber = ?').get(tagNumber) as any;
    if (!tag) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="id">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Tag Tidak Ditemukan - Sistem Verifikasi MKI</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
              .card { background: #1e293b; border: 1px solid #334155; border-radius: 20px; padding: 32px 24px; max-width: 420px; width: 100%; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.4); }
              h2 { color: #f43f5e; margin: 0 0 12px; font-size: 20px; }
              p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 20px; }
              .badge { display: inline-block; padding: 6px 14px; border-radius: 999px; background: rgba(244, 63, 94, 0.15); color: #fb7185; font-family: monospace; font-size: 13px; font-weight: bold; border: 1px solid rgba(244, 63, 94, 0.3); }
            </style>
          </head>
          <body>
            <div class="card">
              <h2>Tag Tidak Terdaftar</h2>
              <p>Nomor tag fisik berikut tidak terdata pada sistem keamanan MKI:</p>
              <div class="badge">${tagNumber}</div>
            </div>
          </body>
        </html>
      `);
    }

    const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(tag.batchId) as any;
    const targetUrl = (batch && batch.redirectUrl && batch.redirectUrl.trim()) 
      ? batch.redirectUrl.trim() 
      : 'https://cek.sumas.id/';

    // Log the scan point
    try {
      const nowStr = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
      db.prepare(`
        INSERT INTO scan_points (id, city, province, venue, lat, lng, totalScans, todayScans, brand, productType, batchId, latestTagId, latestTime, isB2B, status, anomalyReason, deviceInfo, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
      `).run(
        `scan-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        'Jakarta',
        'DKI Jakarta',
        'Mobile Consumer QR Scan',
        -6.2088,
        106.8456,
        batch?.brand || 'MKI',
        batch?.sku || 'Material MKI',
        batch?.batchId || tag.batchId,
        tag.tagNumber,
        nowStr,
        batch?.isB2B ? 1 : 0,
        batch?.status === 'Disuspend' ? 'disuspend' : 'valid',
        req.headers['user-agent']?.includes('Mobile') ? 'Mobile Phone' : 'Desktop Browser',
        new Date().toISOString()
      );
    } catch (_) {}

    // Redirect ke targetUrl dengan parameter verifikasi
    const sep = targetUrl.includes('?') ? '&' : '?';
    const redirectTarget = `${targetUrl}${sep}tag=${encodeURIComponent(tag.tagNumber)}&pin=${encodeURIComponent(tag.pin)}&batch=${encodeURIComponent(batch?.batchId || '')}&sku=${encodeURIComponent(batch?.sku || '')}&brand=${encodeURIComponent(batch?.brand || '')}`;

    res.redirect(302, redirectTarget);
  } catch (error) {
    res.status(500).send('Terjadi kesalahan saat mengalihkan QR Code Dinamis.');
  }
});

// Allocate selected tags to a project in a fast transaction
app.post('/api/batches/:id/allocate', (req, res) => {
  try {
    const { id } = req.params;
    const { tagIds, project, specs, codeType, warranty, prodCode, note } = req.body;

    if (!Array.isArray(tagIds) || tagIds.length === 0) {
      return res.status(400).json({ error: 'Tidak ada tag yang dipilih' });
    }

    const allocatedAt = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

    const updateTagStmt = db.prepare(`
      UPDATE tags 
      SET status = 'Telah Digunakan', project = ?, specs = ?, codeType = ?, warranty = ?, prodCode = ?, note = ?, allocatedAt = ?
      WHERE id = ? AND batchId = ?
    `);

    const runAllocation = db.transaction((ids) => {
      for (const tagId of ids) {
        updateTagStmt.run(project, specs || '-', codeType || '-', warranty || '-', prodCode || '-', note || '-', allocatedAt, tagId, id);
      }
    });

    runAllocation(tagIds);

    // Update batch distinct projects
    const distinctProjectsRows = db.prepare(`
      SELECT DISTINCT project FROM tags WHERE batchId = ? AND project IS NOT NULL AND status = 'Telah Digunakan'
    `).all(id) as { project: string }[];
    const distinctProjects = distinctProjectsRows.map(r => r.project).join(', ');

    db.prepare('UPDATE batches SET project = ? WHERE id = ?').run(distinctProjects || null, id);

    res.json({ success: true, allocatedCount: tagIds.length, project, allocatedAt });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Deallocate tags for a project
app.post('/api/batches/:id/deallocate', (req, res) => {
  try {
    const { id } = req.params;
    const { project } = req.body;

    db.prepare(`
      UPDATE tags
      SET status = 'Tersedia', project = NULL, specs = '-', codeType = '-', warranty = '-', prodCode = '-', note = '-', allocatedAt = NULL
      WHERE batchId = ? AND project = ?
    `).run(id, project);

    // Update batch distinct projects
    const distinctProjectsRows = db.prepare(`
      SELECT DISTINCT project FROM tags WHERE batchId = ? AND project IS NOT NULL AND status = 'Telah Digunakan'
    `).all(id) as { project: string }[];
    const distinctProjects = distinctProjectsRows.map(r => r.project).join(', ');

    db.prepare('UPDATE batches SET project = ? WHERE id = ?').run(distinctProjects || null, id);

    res.json({ success: true, deallocatedProject: project });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Update project data within batch (from Alokasi Proyek page)
app.put('/api/batches/:id/projects', (req, res) => {
  try {
    const { id } = req.params;
    const { oldProjectName, newProjectName, specs, codeType, warranty, prodCode, note } = req.body;

    if (!oldProjectName || !newProjectName) {
      return res.status(400).json({ error: 'Nama proyek lama dan baru wajib diisi' });
    }

    const trimmedOld = String(oldProjectName).trim();
    const trimmedNew = String(newProjectName).trim();

    // Update tags for this project
    db.prepare(`
      UPDATE tags
      SET project = ?,
          specs = ?,
          codeType = ?,
          warranty = ?,
          prodCode = ?,
          note = ?
      WHERE batchId = ? AND project = ?
    `).run(
      trimmedNew,
      specs || '-',
      codeType || '-',
      warranty || '-',
      prodCode || '-',
      note || '-',
      id,
      trimmedOld
    );

    // Update batch distinct projects
    const distinctProjectsRows = db.prepare(`
      SELECT DISTINCT project FROM tags WHERE batchId = ? AND project IS NOT NULL AND status = 'Telah Digunakan'
    `).all(id) as { project: string }[];
    const distinctProjects = distinctProjectsRows.map(r => r.project).join(', ');

    db.prepare('UPDATE batches SET project = ? WHERE id = ?').run(distinctProjects || null, id);

    res.json({ success: true, updatedProject: trimmedNew });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});


app.put('/api/batches/:id', (req, res) => {
  try {
    const { id } = req.params;
    const b = req.body;
    
    const existing = db.prepare('SELECT * FROM batches WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    const updated = {
      project: b.project !== undefined ? b.project : existing.project,
      specs: b.specs !== undefined ? b.specs : existing.specs,
      status: b.status !== undefined ? b.status : existing.status,
    };

    db.prepare(`
      UPDATE batches 
      SET project = ?, specs = ?, status = ?
      WHERE id = ?
    `).run(updated.project, updated.specs, updated.status, id);

    const result = db.prepare('SELECT * FROM batches WHERE id = ?').get(id) as any;
    res.json({
      ...result,
      isB2B: Boolean(result.isB2B),
      tags: null
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.delete('/api/batches/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM batches WHERE id = ?').get(id) as any;
    if (existing) {
      db.prepare('DELETE FROM batches WHERE id = ?').run(id);
      db.prepare('DELETE FROM tags WHERE batchId = ?').run(id);
      db.prepare('DELETE FROM audit_logs WHERE batchId = ?').run(existing.batchId);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Audit logs
app.get('/api/audit-logs', (_req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 200').all() as any[];
    const result = rows.map((row) => ({
      ...row,
      changes: JSON.parse(row.changes),
    }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post('/api/audit-logs', (req, res) => {
  try {
    const log = req.body;
    db.prepare(`
      INSERT INTO audit_logs (id, batchId, timestamp, user, reason, changes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      log.id,
      log.batchId,
      log.timestamp,
      log.user,
      log.reason,
      JSON.stringify(log.changes)
    );
    res.json(log);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Live Dashboard Stats from SQLite
app.get('/api/dashboard/stats', (_req, res) => {
  try {
    const totalBatches = db.prepare('SELECT COUNT(*) as count FROM batches').get() as { count: number };
    const activeBatches = db.prepare("SELECT COUNT(*) as count FROM batches WHERE status != 'Disuspend'").get() as { count: number };
    const suspendedBatches = db.prepare("SELECT COUNT(*) as count FROM batches WHERE status = 'Disuspend'").get() as { count: number };
    const totalTags = db.prepare('SELECT COALESCE(SUM(qty), 0) as total FROM batches').get() as { total: number };
    const b2bBatches = db.prepare('SELECT COUNT(*) as count FROM batches WHERE isB2B = 1').get() as { count: number };
    const retailBatches = db.prepare('SELECT COUNT(*) as count FROM batches WHERE isB2B = 0').get() as { count: number };
    const totalLogs = db.prepare('SELECT COUNT(*) as count FROM audit_logs').get() as { count: number };
    
    // Per brand stats
    const brandStats = db.prepare('SELECT brand, COUNT(*) as batchCount, COALESCE(SUM(qty), 0) as totalQty FROM batches GROUP BY brand').all();

    // Recent 5 audit logs
    const recentLogsRaw = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 5').all() as any[];
    const recentLogs = recentLogsRaw.map(row => ({
      ...row,
      changes: JSON.parse(row.changes)
    }));

    // Recent 5 batches
    const recentBatchesRaw = db.prepare('SELECT * FROM batches ORDER BY rowid DESC LIMIT 5').all() as any[];
    const recentBatches = recentBatchesRaw.map(row => ({
      ...row,
      isB2B: Boolean(row.isB2B),
      tags: null
    }));

    res.json({
      totalBatches: totalBatches.count,
      activeBatches: activeBatches.count,
      suspendedBatches: suspendedBatches.count,
      totalTags: totalTags.total,
      b2bBatches: b2bBatches.count,
      retailBatches: retailBatches.count,
      totalLogs: totalLogs.count,
      brandStats,
      recentLogs,
      recentBatches,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ==========================================
// REST API ENDPOINTS: USERS & BRANDS (CRUD)
// ==========================================

// Get all users (terbaru di paling atas, tanpa mengekspos hash kata sandi)
app.get('/api/users', (_req, res) => {
  try {
    const rows = db.prepare('SELECT id, name, username, email, phone, role, avatar, status, createdAt FROM users ORDER BY rowid DESC').all();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// Create user
app.post('/api/users', (req, res) => {
  try {
    const u = req.body;
    if (!u.email || typeof u.email !== 'string' || !EMAIL_REGEX.test(u.email.trim())) {
      return res.status(400).json({ error: 'Format email tidak valid. Masukkan format yang benar (contoh: nama@perusahaan.com).' });
    }
    const now = new Date().toISOString();
    const hashedPassword = (u.password && typeof u.password === 'string' && u.password.trim().length > 0)
      ? hashPassword(u.password)
      : null;

    db.prepare(`
      INSERT INTO users (id, name, username, email, phone, role, avatar, status, createdAt, password)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      u.id,
      u.name,
      u.username || null,
      u.email.trim(),
      u.phone || null,
      u.role || 'Operator',
      u.avatar || null,
      u.status || 'Aktif',
      u.createdAt || now,
      hashedPassword
    );
    const created = db.prepare('SELECT id, name, username, email, phone, role, avatar, status, createdAt FROM users WHERE id = ?').get(u.id);
    res.json(created || u);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Update user
app.put('/api/users/:id', (req, res) => {
  try {
    const { id } = req.params;
    const u = req.body;
    if (u.email !== undefined && (typeof u.email !== 'string' || !EMAIL_REGEX.test(u.email.trim()))) {
      return res.status(400).json({ error: 'Format email tidak valid. Masukkan format yang benar (contoh: nama@perusahaan.com).' });
    }
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: 'User tidak ditemukan' });
    }
    const updated = {
      name: u.name !== undefined ? u.name : existing.name,
      username: u.username !== undefined ? u.username : existing.username,
      email: u.email !== undefined ? u.email.trim() : existing.email,
      phone: u.phone !== undefined ? u.phone : existing.phone,
      role: u.role !== undefined ? u.role : existing.role,
      avatar: u.avatar !== undefined ? u.avatar : existing.avatar,
      status: u.status !== undefined ? u.status : (existing.status || 'Aktif'),
      createdAt: existing.createdAt || new Date().toISOString()
    };
    db.prepare(`
      UPDATE users 
      SET name = ?, username = ?, email = ?, phone = ?, role = ?, avatar = ?, status = ? 
      WHERE id = ?
    `).run(
      updated.name,
      updated.username,
      updated.email,
      updated.phone,
      updated.role,
      updated.avatar,
      updated.status,
      id
    );

    // Update password with scrypt + salt if provided in request
    if (u.password && typeof u.password === 'string' && u.password.trim().length > 0) {
      const hashedPassword = hashPassword(u.password);
      db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, id);
    }

    // Keep brand owner info synchronized
    db.prepare(`
      UPDATE brands SET ownerName = ?, ownerEmail = ?, ownerRole = ? WHERE ownerId = ?
    `).run(updated.name, updated.email, updated.role, id);

    const result = db.prepare('SELECT id, name, username, email, phone, role, avatar, status, createdAt FROM users WHERE id = ?').get(id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Delete user
app.delete('/api/users/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM users WHERE id = ?').run(id);

    // Reassign brand ownership if any
    const fallbackUser = db.prepare('SELECT * FROM users ORDER BY rowid ASC LIMIT 1').get() as any;
    if (fallbackUser) {
      db.prepare(`
        UPDATE brands 
        SET ownerId = ?, ownerName = ?, ownerEmail = ?, ownerRole = ? 
        WHERE ownerId = ?
      `).run(fallbackUser.id, fallbackUser.name, fallbackUser.email, fallbackUser.role, id);
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Get all brands (terbaru di paling atas)
app.get('/api/brands', (_req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM brands ORDER BY rowid DESC').all() as any[];
    const usersRows = db.prepare('SELECT id, name, email, role FROM users').all() as any[];
    const userMap = new Map(usersRows.map(u => [u.id, u]));

    const syncedBrands = rows.map(b => {
      const u = userMap.get(b.ownerId);
      if (u) {
        return {
          ...b,
          ownerName: u.name,
          ownerEmail: u.email,
          ownerRole: u.role
        };
      }
      return b;
    });

    res.json(syncedBrands);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Create brand
app.post('/api/brands', (req, res) => {
  try {
    const b = req.body;
    let ownerName = b.ownerName || '';
    let ownerEmail = b.ownerEmail || null;
    let ownerRole = b.ownerRole || null;

    if (b.ownerId) {
      const u = db.prepare('SELECT * FROM users WHERE id = ?').get(b.ownerId) as any;
      if (u) {
        ownerName = u.name;
        ownerEmail = u.email;
        ownerRole = u.role;
      }
    }

    const stmt = db.prepare(`
      INSERT INTO brands (id, name, logo, ownerId, ownerName, ownerEmail, ownerRole, description, category, status, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      b.id,
      b.name,
      b.logo || null,
      b.ownerId,
      ownerName,
      ownerEmail,
      ownerRole,
      b.description || '',
      b.category || 'Umum',
      b.status || 'Aktif',
      b.createdAt || new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
    );

    res.json({
      ...b,
      ownerName,
      ownerEmail,
      ownerRole
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Update brand
app.put('/api/brands/:id', (req, res) => {
  try {
    const { id } = req.params;
    const b = req.body;
    const existing = db.prepare('SELECT * FROM brands WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: 'Brand tidak ditemukan' });
    }

    const targetOwnerId = b.ownerId !== undefined ? b.ownerId : existing.ownerId;
    let ownerName = b.ownerName !== undefined ? b.ownerName : existing.ownerName;
    let ownerEmail = b.ownerEmail !== undefined ? b.ownerEmail : existing.ownerEmail;
    let ownerRole = b.ownerRole !== undefined ? b.ownerRole : existing.ownerRole;

    if (targetOwnerId) {
      const u = db.prepare('SELECT * FROM users WHERE id = ?').get(targetOwnerId) as any;
      if (u) {
        ownerName = u.name;
        ownerEmail = u.email;
        ownerRole = u.role;
      }
    }

    const updated = {
      name: b.name !== undefined ? b.name : existing.name,
      logo: b.logo !== undefined ? b.logo : existing.logo,
      ownerId: targetOwnerId,
      ownerName,
      ownerEmail,
      ownerRole,
      description: b.description !== undefined ? b.description : existing.description,
      category: b.category !== undefined ? b.category : existing.category,
      status: b.status !== undefined ? b.status : existing.status,
    };

    db.prepare(`
      UPDATE brands 
      SET name = ?, logo = ?, ownerId = ?, ownerName = ?, ownerEmail = ?, ownerRole = ?, description = ?, category = ?, status = ?
      WHERE id = ?
    `).run(
      updated.name,
      updated.logo,
      updated.ownerId,
      updated.ownerName,
      updated.ownerEmail,
      updated.ownerRole,
      updated.description,
      updated.category,
      updated.status,
      id
    );

    const result = db.prepare('SELECT * FROM brands WHERE id = ?').get(id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Delete brand
app.delete('/api/brands/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM brands WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Products / SKUs
app.get('/api/products', (_req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM products ORDER BY brandName ASC, sku ASC').all() as any[];
    const result = rows.map((p) => ({
      ...p,
      isB2B: Boolean(p.isB2B)
    }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post('/api/products', (req, res) => {
  try {
    const p = req.body;
    const createdAt = p.createdAt || new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
    const skuCode = p.skuCode || `SKU-${Date.now().toString().slice(-4)}`;
    db.prepare(`
      INSERT INTO products (id, brandId, brandName, sku, skuCode, category, isB2B, description, createdAt, image)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(p.id, p.brandId, p.brandName, p.sku, skuCode, p.category || 'Umum', p.isB2B ? 1 : 0, p.description || null, createdAt, p.image || null);
    res.json({ ...p, skuCode, createdAt, isB2B: Boolean(p.isB2B), image: p.image || null });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.put('/api/products/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: 'Product tidak ditemukan' });
    }
    const p = req.body;
    const brandId = p.brandId !== undefined ? p.brandId : existing.brandId;
    const brandName = p.brandName !== undefined ? p.brandName : existing.brandName;
    const sku = p.sku !== undefined ? p.sku : existing.sku;
    const skuCode = p.skuCode !== undefined ? p.skuCode : (existing.skuCode || `SKU-${id.toUpperCase()}`);
    const category = p.category !== undefined ? p.category : existing.category;
    const isB2B = p.isB2B !== undefined ? (p.isB2B ? 1 : 0) : existing.isB2B;
    const description = p.description !== undefined ? p.description : existing.description;
    const image = p.image !== undefined ? p.image : existing.image;

    db.prepare(`
      UPDATE products 
      SET brandId = ?, brandName = ?, sku = ?, skuCode = ?, category = ?, isB2B = ?, description = ?, image = ?
      WHERE id = ?
    `).run(brandId, brandName, sku, skuCode, category, isB2B, description, image, id);

    res.json({
      id,
      brandId,
      brandName,
      sku,
      skuCode,
      category,
      isB2B: Boolean(isB2B),
      description,
      image,
      createdAt: existing.createdAt
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.delete('/api/products/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ==========================================
// REST API ENDPOINTS: NOTIFIKASI SISTEM & AKTIVITAS
// ==========================================

// Get aggregated notifications (Scan, Pengeditan User, dan Reset Password)
app.get('/api/notifications', (_req, res) => {
  try {
    const readIdsRows = db.prepare('SELECT id FROM read_notifications').all() as { id: string }[];
    const readIds = new Set(readIdsRows.map(r => r.id));

    // 1. Aktivitas Scan Terbaru
    const scanRows = db.prepare('SELECT * FROM scan_points ORDER BY rowid DESC LIMIT 12').all() as any[];
    const scanItems = scanRows.map(s => {
      const notifId = `notif-scan-${s.id}`;
      return {
        id: notifId,
        sourceId: s.id,
        category: 'scan',
        title: s.status === 'suspicious' ? 'Peringatan Anomali Scan Tag' : 'Aktivitas Scan Tag Berhasil',
        subtitle: `${s.venue ? s.venue + ' · ' : ''}${s.city}, ${s.province}`,
        description: `Tag ${s.latestTagId || '-'} dipindai untuk produk ${s.productType || s.brand} (${s.todayScans} scan hari ini)`,
        timestamp: s.createdAt || 'Hari ini',
        timeAgo: s.latestTime || 'Baru saja',
        status: s.status || 'valid',
        isRead: readIds.has(notifId),
        deviceInfo: s.deviceInfo,
        brand: s.brand,
        tagNumber: s.latestTagId,
        city: s.city,
        venue: s.venue,
        anomalyReason: s.anomalyReason
      };
    });

    // 2. Aktivitas Pengeditan Data (Audit Logs)
    const auditRows = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 15').all() as any[];
    const editItems = auditRows.map(a => {
      const notifId = `notif-edit-${a.id}`;
      let parsedChanges: any[] = [];
      try {
        parsedChanges = JSON.parse(a.changes);
      } catch (_) {}

      const fieldSummary = parsedChanges.map((c: any) => `${c.field}: "${c.old}" → "${c.new}"`).join(', ');

      return {
        id: notifId,
        sourceId: String(a.id),
        category: 'edit',
        title: `Pengeditan Data: ${a.batchId}`,
        subtitle: `Dilakukan oleh ${a.user}`,
        description: a.reason ? `${a.reason}${fieldSummary ? ` (${fieldSummary})` : ''}` : fieldSummary || 'Pembaruan data batch',
        timestamp: a.timestamp,
        timeAgo: a.timestamp,
        status: 'edited',
        isRead: readIds.has(notifId),
        user: a.user,
        batchId: a.batchId,
        changes: parsedChanges
      };
    });

    // 3. User Request Reset Password / Lupa Password
    const resetRows = db.prepare('SELECT * FROM password_reset_requests ORDER BY rowid DESC').all() as any[];
    const resetItems = resetRows.map(r => {
      const notifId = `notif-reset-${r.id}`;
      const isActuallyRead = readIds.has(notifId) || Boolean(r.isRead) || r.status !== 'Menunggu';
      return {
        id: notifId,
        sourceId: r.id,
        category: 'password_reset',
        title: `Permintaan Reset Password: ${r.userName}`,
        subtitle: `${r.userEmail} · ${r.userRole}`,
        description: r.actionNote || 'Pengguna mengajukan permohonan pemulihan/reset kata sandi akun',
        timestamp: r.requestedAt,
        timeAgo: r.requestedAt,
        status: r.status, // 'Menunggu', 'Disetujui', 'Ditolak'
        isRead: isActuallyRead,
        user: {
          id: r.userId,
          name: r.userName,
          email: r.userEmail,
          role: r.userRole,
          avatar: r.avatar
        }
      };
    });

    // Merge all notifications
    const allItems = [...resetItems, ...editItems, ...scanItems];
    const unreadCount = allItems.filter(item => !item.isRead).length;
    const pendingResetCount = resetItems.filter(r => r.status === 'Menunggu').length;

    res.json({
      unreadCount,
      pendingResetCount,
      counts: {
        all: allItems.length,
        scan: scanItems.length,
        edit: editItems.length,
        reset: resetItems.length
      },
      notifications: allItems
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Mark notification(s) as read
app.post('/api/notifications/mark-read', (req, res) => {
  try {
    const { id, all, ids } = req.body;
    const insertRead = db.prepare('INSERT OR IGNORE INTO read_notifications (id) VALUES (?)');

    if (all) {
      // Mark all scan and edit IDs as read, and update password_reset_requests
      const scanRows = db.prepare('SELECT id FROM scan_points').all() as { id: string }[];
      const auditRows = db.prepare('SELECT id FROM audit_logs').all() as { id: number }[];
      const resetRows = db.prepare('SELECT id FROM password_reset_requests').all() as { id: string }[];

      const markAllTx = db.transaction(() => {
        for (const s of scanRows) insertRead.run(`notif-scan-${s.id}`);
        for (const a of auditRows) insertRead.run(`notif-edit-${a.id}`);
        for (const r of resetRows) insertRead.run(`notif-reset-${r.id}`);
        db.prepare('UPDATE password_reset_requests SET isRead = 1').run();
      });
      markAllTx();
    } else if (Array.isArray(ids)) {
      const markTx = db.transaction(() => {
        for (const notifId of ids) {
          insertRead.run(notifId);
          if (notifId.startsWith('notif-reset-')) {
            const rawId = notifId.replace('notif-reset-', '');
            db.prepare('UPDATE password_reset_requests SET isRead = 1 WHERE id = ?').run(rawId);
          }
        }
      });
      markTx();
    } else if (id) {
      insertRead.run(id);
      if (id.startsWith('notif-reset-')) {
        const rawId = id.replace('notif-reset-', '');
        db.prepare('UPDATE password_reset_requests SET isRead = 1 WHERE id = ?').run(rawId);
      }
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Get password reset requests
app.get('/api/password-resets', (_req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM password_reset_requests ORDER BY rowid DESC').all();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Create new password reset request
app.post('/api/password-resets', (req, res) => {
  try {
    const { userId, userName, userEmail, userRole, avatar, reason } = req.body;
    const newId = `pr-${Date.now()}`;
    const requestedAt = 'Baru saja';
    db.prepare(`
      INSERT INTO password_reset_requests (id, userId, userName, userEmail, userRole, avatar, requestedAt, status, actionNote, isRead)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'Menunggu', ?, 0)
    `).run(
      newId,
      userId || 'u-guest',
      userName,
      userEmail,
      userRole || 'Pengguna',
      avatar || null,
      requestedAt,
      reason || 'Permintaan lupa password'
    );
    res.json({ success: true, id: newId });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Respond to password reset request (Approve or Reject)
app.post('/api/password-resets/:id/respond', (req, res) => {
  try {
    const { id } = req.params;
    const { action, actionNote } = req.body; // action: 'approve' | 'reject'
    const newStatus = action === 'approve' ? 'Disetujui' : 'Ditolak';
    const note = actionNote || (action === 'approve' 
      ? 'Tautan reset kata sandi telah dikirimkan ke email terdaftar (Berlaku 2 jam)' 
      : 'Permintaan reset ditolak oleh administrator');

    db.prepare(`
      UPDATE password_reset_requests 
      SET status = ?, actionNote = ?, isRead = 1 
      WHERE id = ?
    `).run(newStatus, note, id);

    // Also mark notif as read
    db.prepare('INSERT OR IGNORE INTO read_notifications (id) VALUES (?)').run(`notif-reset-${id}`);

    res.json({ success: true, status: newStatus, actionNote: note });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ==========================================
// REST API ENDPOINTS: KATEGORI PRODUK (3 LEVEL CRUD)
// ==========================================

// Get all categories sorted by level, orderIndex, name
app.get('/api/categories', (_req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM categories ORDER BY level ASC, orderIndex ASC, rowid ASC').all();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Create category
app.post('/api/categories', (req, res) => {
  try {
    const { name, parentId, level, code, description, status } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Nama kategori wajib diisi' });
    }
    const parsedLevel = Math.min(3, Math.max(1, parseInt(level) || 1));
    const newId = `cat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const createdAt = new Date().toISOString();

    db.prepare(`
      INSERT INTO categories (id, name, parentId, level, code, description, status, itemCount, orderIndex, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?)
    `).run(
      newId,
      name.trim(),
      parentId || null,
      parsedLevel,
      code ? code.trim() : null,
      description ? description.trim() : null,
      status || 'Aktif',
      createdAt
    );

    const created = db.prepare('SELECT * FROM categories WHERE id = ?').get(newId);
    res.json(created);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Update category
app.put('/api/categories/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, description, status } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Nama kategori wajib diisi' });
    }

    db.prepare(`
      UPDATE categories 
      SET name = ?, code = ?, description = ?, status = ?
      WHERE id = ?
    `).run(
      name.trim(),
      code ? code.trim() : null,
      description ? description.trim() : null,
      status || 'Aktif',
      id
    );

    const updated = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Delete category with cascade delete for all children
app.delete('/api/categories/:id', (req, res) => {
  try {
    const { id } = req.params;
    const target = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as any;
    if (!target) {
      return res.status(404).json({ error: 'Kategori tidak ditemukan' });
    }

    const idsToDelete = [id];
    
    // If level 1, find all level 2 children, and level 3 children of those level 2
    if (target.level === 1) {
      const level2 = db.prepare('SELECT id FROM categories WHERE parentId = ?').all(id) as { id: string }[];
      for (const l2 of level2) {
        idsToDelete.push(l2.id);
        const level3 = db.prepare('SELECT id FROM categories WHERE parentId = ?').all(l2.id) as { id: string }[];
        for (const l3 of level3) {
          idsToDelete.push(l3.id);
        }
      }
    } else if (target.level === 2) {
      const level3 = db.prepare('SELECT id FROM categories WHERE parentId = ?').all(id) as { id: string }[];
      for (const l3 of level3) {
        idsToDelete.push(l3.id);
      }
    }

    const deleteTx = db.transaction(() => {
      const stmt = db.prepare('DELETE FROM categories WHERE id = ?');
      for (const delId of idsToDelete) {
        stmt.run(delId);
      }
    });
    deleteTx();

    res.json({ success: true, deletedCount: idsToDelete.length, deletedIds: idsToDelete });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Vite dev server or static files handler
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  app.use(express.static(path.join(__dirname, 'public')));

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

startServer();
