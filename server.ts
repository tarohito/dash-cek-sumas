import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import fs from 'fs';
import crypto from 'crypto';
import { seedComprehensiveData } from './src/seedData.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const portArgIndex = process.argv.indexOf('--port');
const portFromArg = portArgIndex !== -1 ? parseInt(process.argv[portArgIndex + 1], 10) : NaN;
const PORT = !isNaN(portFromArg) ? portFromArg : (Number(process.env.PORT) || 3000);

const hostArgIndex = process.argv.indexOf('--host');
const hostFromArg = hostArgIndex !== -1 ? process.argv[hostArgIndex + 1] : undefined;
const HOST = hostFromArg && hostFromArg !== 'true' ? hostFromArg : '0.0.0.0';

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
    pin TEXT,
    latestTime TEXT,
    isB2B INTEGER DEFAULT 0,
    status TEXT DEFAULT 'valid',
    anomalyReason TEXT,
    deviceInfo TEXT,
    scanHistory TEXT,
    createdAt TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_scan_points_status ON scan_points(status);
  CREATE INDEX IF NOT EXISTS idx_scan_points_brand ON scan_points(brand);
  CREATE INDEX IF NOT EXISTS idx_scan_points_tagId ON scan_points(latestTagId);
`);

try { db.exec("ALTER TABLE scan_points ADD COLUMN pin TEXT"); } catch (_) {}
try { db.exec("ALTER TABLE scan_points ADD COLUMN scanHistory TEXT"); } catch (_) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_scan_points_pin ON scan_points(pin)"); } catch (_) {}

db.exec(`

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
    businessType TEXT DEFAULT 'Retail',
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
    createdAt TEXT NOT NULL,
    specSchema TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parentId);
  CREATE INDEX IF NOT EXISTS idx_categories_level ON categories(level);

  CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
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

// Migration: Update telemetry anomaly notices to concise wording
try {
  db.prepare(`UPDATE scan_points 
    SET anomalyReason = 'Terdeteksi 3x pemindaian pada tag ini. Pantau riwayat sesi untuk mencegah duplikasi fisik.' 
    WHERE anomalyReason LIKE '%Pemindaian berulang 3x%' OR anomalyReason LIKE '%item yang sama%' OR anomalyReason LIKE '%Aktivitas pemindaian berulang%'`).run();
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
try {
  db.prepare('ALTER TABLE categories ADD COLUMN specSchema TEXT').run();
} catch (_) {}
try {
  db.prepare("UPDATE products SET skuCode = 'SKU-' || UPPER(id) WHERE skuCode IS NULL OR skuCode = ''").run();
} catch (_) {}
try {
  db.prepare("ALTER TABLE brands ADD COLUMN businessType TEXT DEFAULT 'Retail'").run();
} catch (_) {}
try {
  db.prepare("UPDATE brands SET businessType = 'B2B' WHERE LOWER(name) = 'sumas'").run();
} catch (_) {}

// Migration: Pastikan data batch & tag Retail murni tanpa proyek, dan brand/batch Sumas teridentifikasi B2B
try {
  const dirtyRetailRow = db.prepare("SELECT COUNT(*) as count FROM batches WHERE isB2B = 0 AND project IS NOT NULL").get() as { count: number };
  const oldCat = db.prepare("SELECT id FROM categories WHERE id = 'cat-mat'").get();
  const brandsCountRow = db.prepare('SELECT COUNT(*) as count FROM brands').get() as { count: number };
  const productsCountRow = db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number };
  
  if (oldCat || brandsCountRow.count < 15 || productsCountRow.count < 15 || (dirtyRetailRow && dirtyRetailRow.count > 0)) {
    seedComprehensiveData(db);
  } else {
    db.prepare("UPDATE batches SET project = NULL WHERE isB2B = 0 OR LOWER(brand) != 'sumas'").run();
    db.prepare("UPDATE tags SET project = NULL, allocatedAt = NULL WHERE batchId IN (SELECT id FROM batches WHERE isB2B = 0 OR LOWER(brand) != 'sumas')").run();
    db.prepare("UPDATE batches SET isB2B = 1 WHERE LOWER(brand) = 'sumas'").run();
    db.prepare("UPDATE products SET isB2B = 1 WHERE LOWER(brandName) = 'sumas'").run();
    db.prepare("UPDATE brands SET businessType = 'B2B' WHERE LOWER(name) = 'sumas'").run();
  }
} catch (err) {
  console.error('Seeding check notice:', err);
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

// Scan points and telemetry data are seeded and synchronized comprehensively via seedComprehensiveData


// Seed real scan activities into database if empty
const scanActivitiesCountRow = db.prepare('SELECT COUNT(*) as count FROM scan_activities').get() as { count: number };
if (scanActivitiesCountRow && scanActivitiesCountRow.count === 0) {
  const insertActivity = db.prepare(`
    INSERT INTO scan_activities (rangeType, label, fullDate, scans, valid, topBrand, sortOrder)
    VALUES (@rangeType, @label, @fullDate, @scans, @valid, @topBrand, @sortOrder)
  `);

  const initialActivities = [
    // 7 Days
    { rangeType: '7d', label: 'Sen (26/10)', fullDate: '26 Okt 2026', scans: 520, valid: 519, topBrand: 'Sumas', sortOrder: 1 },
    { rangeType: '7d', label: 'Sel (27/10)', fullDate: '27 Okt 2026', scans: 680, valid: 679, topBrand: 'Somethinc', sortOrder: 2 },
    { rangeType: '7d', label: 'Rab (28/10)', fullDate: '28 Okt 2026', scans: 610, valid: 608, topBrand: 'Skintific', sortOrder: 3 },
    { rangeType: '7d', label: 'Kam (29/10)', fullDate: '29 Okt 2026', scans: 790, valid: 788, topBrand: 'Sumas', sortOrder: 4 },
    { rangeType: '7d', label: 'Jum (30/10)', fullDate: '30 Okt 2026', scans: 940, valid: 938, topBrand: 'Avoskin', sortOrder: 5 },
    { rangeType: '7d', label: 'Sab (31/10)', fullDate: '31 Okt 2026', scans: 1120, valid: 1118, topBrand: 'Somethinc', sortOrder: 6 },
    { rangeType: '7d', label: 'Min (01/11)', fullDate: '01 Nov 2026', scans: 860, valid: 859, topBrand: 'Whitelab', sortOrder: 7 },

    // 30 Days
    { rangeType: '30d', label: 'Minggu 1', fullDate: '01 - 07 Okt 2026', scans: 3450, valid: 3442, topBrand: 'Sumas', sortOrder: 1 },
    { rangeType: '30d', label: 'Minggu 2', fullDate: '08 - 14 Okt 2026', scans: 4120, valid: 4110, topBrand: 'Somethinc', sortOrder: 2 },
    { rangeType: '30d', label: 'Minggu 3', fullDate: '15 - 21 Okt 2026', scans: 4890, valid: 4881, topBrand: 'Sumas', sortOrder: 3 },
    { rangeType: '30d', label: 'Minggu 4', fullDate: '22 - 28 Okt 2026', scans: 5410, valid: 5402, topBrand: 'Skintific', sortOrder: 4 },
    { rangeType: '30d', label: 'Minggu 5', fullDate: '29 Okt - 01 Nov', scans: 2920, valid: 2915, topBrand: 'Somethinc', sortOrder: 5 },

    // 12 Months
    { rangeType: '12m', label: 'Jan', fullDate: 'Januari 2026', scans: 8900, valid: 8880, topBrand: 'Sumas', sortOrder: 1 },
    { rangeType: '12m', label: 'Feb', fullDate: 'Februari 2026', scans: 10400, valid: 10380, topBrand: 'Sumas', sortOrder: 2 },
    { rangeType: '12m', label: 'Mar', fullDate: 'Maret 2026', scans: 12100, valid: 12075, topBrand: 'Somethinc', sortOrder: 3 },
    { rangeType: '12m', label: 'Apr', fullDate: 'April 2026', scans: 11800, valid: 11770, topBrand: 'Avoskin', sortOrder: 4 },
    { rangeType: '12m', label: 'Mei', fullDate: 'Mei 2026', scans: 13900, valid: 13865, topBrand: 'Sumas', sortOrder: 5 },
    { rangeType: '12m', label: 'Jun', fullDate: 'Juni 2026', scans: 14500, valid: 14470, topBrand: 'Somethinc', sortOrder: 6 },
    { rangeType: '12m', label: 'Jul', fullDate: 'Juli 2026', scans: 15800, valid: 15760, topBrand: 'Skintific', sortOrder: 7 },
    { rangeType: '12m', label: 'Agt', fullDate: 'Agustus 2026', scans: 17200, valid: 17160, topBrand: 'Sumas', sortOrder: 8 },
    { rangeType: '12m', label: 'Sep', fullDate: 'September 2026', scans: 16900, valid: 16860, topBrand: 'Whitelab', sortOrder: 9 },
    { rangeType: '12m', label: 'Okt', fullDate: 'Oktober 2026', scans: 18492, valid: 18450, topBrand: 'Sumas', sortOrder: 10 },
    { rangeType: '12m', label: 'Nov', fullDate: 'November 2026', scans: 4820, valid: 4812, topBrand: 'Somethinc', sortOrder: 11 }
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

// Seed batches, tags, and scan points in SQLite with guaranteed 100% telemetry synchronization
const firstSp = db.prepare('SELECT latestTagId FROM scan_points LIMIT 1').get() as { latestTagId: string } | undefined;
const tagCheck = firstSp ? db.prepare('SELECT COUNT(*) as count FROM tags WHERE tagNumber = ?').get(firstSp.latestTagId) as { count: number } : { count: 0 };
const batchCountRow = db.prepare('SELECT COUNT(*) as count FROM batches').get() as { count: number };

if (!batchCountRow || batchCountRow.count < 15 || !tagCheck || tagCheck.count === 0) {
  seedComprehensiveData(db);
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


// ==========================================
// REST API ENDPOINTS: SCAN LOCATIONS & TELEMETRY
// ==========================================

// Get all real scan locations from SQLite
app.get('/api/scans/locations', (_req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM scan_points ORDER BY id ASC').all() as any[];
    const result = rows.map((r) => {
      let history = [];
      if (r.scanHistory) {
        try {
          history = typeof r.scanHistory === 'string' ? JSON.parse(r.scanHistory) : r.scanHistory;
        } catch (_) {
          history = [];
        }
      }
      return {
        ...r,
        isB2B: Boolean(r.isB2B),
        scanHistory: history
      };
    });
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

    const batchRecord = db.prepare('SELECT id, batchId FROM batches WHERE id = ? OR batchId = ?').get(id, id) as any;
    const actualBatchPk = batchRecord ? batchRecord.id : id;

    let countQuery = 'SELECT COUNT(*) as count FROM tags WHERE batchId = ?';
    let dataQuery = 'SELECT * FROM tags WHERE batchId = ?';
    const params: any[] = [actualBatchPk];

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
    `).get(actualBatchPk) as { total: number; available: number; used: number };

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
    const batch = db.prepare('SELECT * FROM batches WHERE id = ? OR batchId = ?').get(id, id) as any;
    if (!batch) {
      return res.status(404).json({ error: 'Batch tidak ditemukan' });
    }
    const tags = db.prepare('SELECT id, batchId, tagNumber, pin, status, project, specs FROM tags WHERE batchId = ? ORDER BY rowid ASC').all(batch.id);
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
    const batch = db.prepare('SELECT * FROM batches WHERE id = ? OR batchId = ?').get(id, id) as any;
    if (!batch) {
      return res.status(404).json({ error: 'Batch tidak ditemukan' });
    }

    const tagStats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'Tersedia' THEN 1 ELSE 0 END) as available,
        SUM(CASE WHEN status = 'Telah Digunakan' THEN 1 ELSE 0 END) as used
      FROM tags WHERE batchId = ?
    `).get(batch.id) as { total: number; available: number; used: number };

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
    `).all(batch.id);

    const isB2B = Boolean(batch.isB2B) || (batch.brand || '').trim().toLowerCase() === 'sumas';

    res.json({
      batch: { ...batch, isB2B },
      totalTags: tagStats?.total || batch.qty,
      availableCount: tagStats?.available || 0,
      usedCount: tagStats?.used || 0,
      projects: isB2B ? projectAllocations : []
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
            <title>Tag Tidak Ditemukan - Sistem Verifikasi Sumas</title>
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
              <p>Nomor tag fisik berikut tidak terdata pada sistem keamanan Sumas:</p>
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
        batch?.brand || 'Sumas',
        batch?.sku || 'Material Sumas',
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

// Allocate selected tags to a project in a fast transaction (Khusus Batch Milik SUMAS)
app.post('/api/batches/:id/allocate', (req, res) => {
  try {
    const { id } = req.params;
    const { tagIds, project, specs, codeType, warranty, prodCode, note } = req.body;

    const batch = db.prepare('SELECT id, brand FROM batches WHERE id = ?').get(id) as { id: string; brand: string } | undefined;
    if (!batch) {
      return res.status(404).json({ error: 'Batch tidak ditemukan' });
    }

    // Algoritma khusus: Hanya batch milik SUMAS yang dapat melakukan alokasi tag untuk proyek
    if ((batch.brand || '').trim().toLowerCase() !== 'sumas') {
      return res.status(403).json({ 
        error: `Batch milik brand "${batch.brand}" tidak diizinkan mengalokasikan proyek. Fitur alokasi proyek khusus didedikasikan untuk batch B2B SUMAS.` 
      });
    }

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

// Deallocate tags for a project (Khusus Batch Milik SUMAS)
app.post('/api/batches/:id/deallocate', (req, res) => {
  try {
    const { id } = req.params;
    const { project } = req.body;

    const batch = db.prepare('SELECT id, brand FROM batches WHERE id = ?').get(id) as { id: string; brand: string } | undefined;
    if (!batch) {
      return res.status(404).json({ error: 'Batch tidak ditemukan' });
    }

    if ((batch.brand || '').trim().toLowerCase() !== 'sumas') {
      return res.status(403).json({ error: 'Operasi alokasi proyek hanya berlaku untuk batch produk SUMAS.' });
    }

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

// Update project data within batch (from Alokasi Proyek page - Khusus SUMAS)
app.put('/api/batches/:id/projects', (req, res) => {
  try {
    const { id } = req.params;
    const batch = db.prepare('SELECT id, brand FROM batches WHERE id = ?').get(id) as { id: string; brand: string } | undefined;
    if (!batch) {
      return res.status(404).json({ error: 'Batch tidak ditemukan' });
    }
    if ((batch.brand || '').trim().toLowerCase() !== 'sumas') {
      return res.status(403).json({ error: 'Pengeditan data proyek hanya berlaku untuk batch SUMAS.' });
    }

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
    
    const totalProducts = db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number };
    const totalBrands = db.prepare('SELECT COUNT(*) as count FROM brands').get() as { count: number };
    const activeBrands = db.prepare("SELECT COUNT(*) as count FROM brands WHERE status = 'Aktif'").get() as { count: number };
    const scanSums = db.prepare('SELECT COALESCE(SUM(totalScans), 0) as totalScans, COALESCE(SUM(todayScans), 0) as todayScans FROM scan_points').get() as { totalScans: number; todayScans: number };
    const cityCount = db.prepare('SELECT COUNT(DISTINCT city) as count, COUNT(*) as totalPoints FROM scan_points').get() as { count: number; totalPoints: number };
    const scanValid = db.prepare("SELECT COUNT(*) as count FROM scan_points WHERE status = 'valid'").get() as { count: number };
    
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
      totalProducts: totalProducts.count,
      totalBrands: totalBrands.count,
      activeBrands: activeBrands.count,
      totalScans: scanSums.totalScans,
      todayScans: scanSums.todayScans,
      distinctCities: cityCount.count,
      totalScanPoints: cityCount.totalPoints,
      validScans: scanValid.count,
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
    let ownerName = b.ownerName || 'Belum Ditentukan';
    let ownerEmail = b.ownerEmail || null;
    let ownerRole = b.ownerRole || null;
    const finalOwnerId = b.ownerId && typeof b.ownerId === 'string' && b.ownerId.trim() !== '' ? b.ownerId.trim() : '';

    if (finalOwnerId) {
      const u = db.prepare('SELECT * FROM users WHERE id = ?').get(finalOwnerId) as any;
      if (u) {
        ownerName = u.name;
        ownerEmail = u.email;
        ownerRole = u.role;
      }
    } else {
      ownerName = 'Belum Ditentukan';
      ownerEmail = null;
      ownerRole = null;
    }

    const businessType = b.businessType === 'B2B' ? 'B2B' : (b.name?.toLowerCase() === 'sumas' ? 'B2B' : 'Retail');

    const stmt = db.prepare(`
      INSERT INTO brands (id, name, logo, ownerId, ownerName, ownerEmail, ownerRole, description, category, businessType, status, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      b.id,
      b.name,
      b.logo || null,
      finalOwnerId,
      ownerName,
      ownerEmail,
      ownerRole,
      b.description || '',
      b.category || 'Umum',
      businessType,
      b.status || 'Aktif',
      b.createdAt || new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
    );

    res.json({
      ...b,
      ownerId: finalOwnerId,
      ownerName,
      ownerEmail,
      ownerRole,
      businessType
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

    const rawOwnerId = b.ownerId !== undefined ? b.ownerId : existing.ownerId;
    const targetOwnerId = rawOwnerId && typeof rawOwnerId === 'string' && rawOwnerId.trim() !== '' ? rawOwnerId.trim() : '';
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
    } else {
      ownerName = 'Belum Ditentukan';
      ownerEmail = null;
      ownerRole = null;
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
      businessType: b.businessType !== undefined ? b.businessType : (existing.businessType || (existing.name?.toLowerCase() === 'sumas' ? 'B2B' : 'Retail')),
      status: b.status !== undefined ? b.status : existing.status,
    };

    db.prepare(`
      UPDATE brands 
      SET name = ?, logo = ?, ownerId = ?, ownerName = ?, ownerEmail = ?, ownerRole = ?, description = ?, category = ?, businessType = ?, status = ?
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
      updated.businessType,
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
      skuCode: p.skuCode || `SKU-${p.id.toUpperCase()}`,
      isB2B: Boolean(p.isB2B)
    }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Relational Detail of Product by ID or SKU from real database tables
app.get('/api/products/:id/relational', (req, res) => {
  try {
    const { id } = req.params;
    let prod = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as any;
    if (!prod) {
      prod = db.prepare('SELECT * FROM products WHERE LOWER(sku) = LOWER(?)').get(id) as any;
    }
    if (!prod) {
      return res.status(404).json({ error: 'Produk tidak ditemukan' });
    }

    const brand = db.prepare('SELECT id, name, logo, ownerId, ownerName, ownerEmail, ownerRole, category, status, description FROM brands WHERE id = ? OR LOWER(name) = LOWER(?)').get(prod.brandId, prod.brandName) as any || null;
    let user: any = null;
    if (brand?.ownerId) {
      user = db.prepare('SELECT id, name, username, email, phone, role, avatar, status FROM users WHERE id = ?').get(brand.ownerId);
    }
    if (!user && brand?.ownerName) {
      user = db.prepare('SELECT id, name, username, email, phone, role, avatar, status FROM users WHERE LOWER(name) = LOWER(?)').get(brand.ownerName);
    }

    const batches = db.prepare('SELECT id, batchId, date, project, sku, brand, qty, specs, pinLength, status, isB2B, redirectUrl, qrType, requirePin, enableGps FROM batches WHERE LOWER(sku) = LOWER(?) AND (LOWER(brand) = LOWER(?) OR LOWER(brand) = LOWER(?)) ORDER BY date DESC').all(prod.sku, prod.brandName, brand?.name || prod.brandName) as any[];
    const activeBatchesCount = batches.filter(b => b.status !== 'Disuspend').length;
    const suspendedBatchesCount = batches.filter(b => b.status === 'Disuspend').length;

    const batchIds = batches.map(b => b.id);
    let tagStats = { totalTags: 0, usedTags: 0, availableTags: 0 };
    let projects: string[] = [];
    let warranties: string[] = [];
    let prodCodes: string[] = [];
    let sampleAllocatedTags: any[] = [];

    if (batchIds.length > 0) {
      const placeholders = batchIds.map(() => '?').join(',');
      const statsRow = db.prepare(`
        SELECT 
          COUNT(*) as totalTags,
          SUM(CASE WHEN status = 'Telah Digunakan' THEN 1 ELSE 0 END) as usedTags,
          SUM(CASE WHEN status = 'Tersedia' THEN 1 ELSE 0 END) as availableTags
        FROM tags WHERE batchId IN (${placeholders})
      `).get(...batchIds) as any;
      if (statsRow) {
        tagStats = {
          totalTags: Number(statsRow.totalTags) || 0,
          usedTags: Number(statsRow.usedTags) || 0,
          availableTags: Number(statsRow.availableTags) || 0
        };
      }

      const pRows = db.prepare(`SELECT DISTINCT project FROM tags WHERE batchId IN (${placeholders}) AND project IS NOT NULL AND project != '' AND project != '-'`).all(...batchIds) as { project: string }[];
      projects = pRows.map(r => r.project);

      const wRows = db.prepare(`SELECT DISTINCT warranty FROM tags WHERE batchId IN (${placeholders}) AND warranty IS NOT NULL AND warranty != '' AND warranty != '-'`).all(...batchIds) as { warranty: string }[];
      warranties = wRows.map(r => r.warranty);

      const pcRows = db.prepare(`SELECT DISTINCT prodCode FROM tags WHERE batchId IN (${placeholders}) AND prodCode IS NOT NULL AND prodCode != '' AND prodCode != '-'`).all(...batchIds) as { prodCode: string }[];
      prodCodes = pcRows.map(r => r.prodCode);

      sampleAllocatedTags = db.prepare(`
        SELECT tagNumber, pin, status, project, warranty, prodCode, note, allocatedAt 
        FROM tags 
        WHERE batchId IN (${placeholders}) AND status = 'Telah Digunakan' 
        LIMIT 6
      `).all(...batchIds);
    }

    // Scans from scan_points
    const scanRows = db.prepare(`
      SELECT city, province, venue, totalScans, todayScans, status, latestTime, deviceInfo 
      FROM scan_points 
      WHERE (LOWER(brand) = LOWER(?) OR LOWER(brand) = LOWER(?)) 
        AND (LOWER(productType) LIKE '%' || LOWER(?) || '%' OR batchId IN (${batchIds.length ? batchIds.map(() => '?').join(',') : "''"}))
      ORDER BY totalScans DESC
      LIMIT 4
    `).all(prod.brandName, brand?.name || prod.brandName, prod.sku, ...(batchIds.length ? batchIds : [])) as any[];

    const totalScans = scanRows.reduce((acc, r) => acc + (Number(r.totalScans) || 0), 0);

    res.json({
      product: {
        ...prod,
        skuCode: prod.skuCode || `SKU-${prod.id.toUpperCase()}`,
        isB2B: Boolean(prod.isB2B)
      },
      brand,
      user,
      batches,
      activeBatchesCount,
      suspendedBatchesCount,
      tagStats,
      projects,
      warranties,
      prodCodes,
      sampleAllocatedTags,
      scanActivity: {
        totalScans,
        locations: scanRows
      }
    });
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
    const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: 'Kategori tidak ditemukan' });
    }
    const { name, code, description, status, specSchema } = req.body;
    const finalName = name !== undefined ? name.trim() : existing.name;
    if (!finalName) {
      return res.status(400).json({ error: 'Nama kategori wajib diisi' });
    }
    const finalCode = code !== undefined ? (code ? code.trim() : null) : existing.code;
    const finalDesc = description !== undefined ? (description ? description.trim() : null) : existing.description;
    const finalStatus = status !== undefined ? status : existing.status;
    const finalSchema = specSchema !== undefined 
      ? (typeof specSchema === 'string' ? specSchema : JSON.stringify(specSchema)) 
      : existing.specSchema;

    db.prepare(`
      UPDATE categories 
      SET name = ?, code = ?, description = ?, status = ?, specSchema = ?
      WHERE id = ?
    `).run(finalName, finalCode, finalDesc, finalStatus, finalSchema, id);

    const updated = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Update category spec schema specifically
app.put('/api/categories/:id/specs', (req, res) => {
  try {
    const { id } = req.params;
    const { specSchema } = req.body;
    const finalSchema = typeof specSchema === 'string' ? specSchema : JSON.stringify(specSchema || []);
    
    // 1. Cari kategori berdasarkan ID
    let existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as any;
    
    // 2. Jika tidak ditemukan via ID, coba cari via Nama (case-insensitive)
    if (!existing) {
      existing = db.prepare('SELECT * FROM categories WHERE LOWER(name) = LOWER(?)').get(id) as any;
    }

    // 3. Jika kategori belum ada di database, buat otomatis sebagai kategori baru
    if (!existing) {
      const newId = id.startsWith('cat-') ? id : `cat-${Date.now()}`;
      const catCode = id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'CAT';
      db.prepare(`
        INSERT INTO categories (id, name, parentId, level, code, description, status, itemCount, orderIndex, createdAt, specSchema)
        VALUES (?, ?, NULL, 1, ?, 'Kategori produk', 'Aktif', 0, 99, ?, ?)
      `).run(newId, id, catCode, new Date().toISOString().split('T')[0], finalSchema);
      existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(newId);
      return res.json(existing);
    }

    db.prepare('UPDATE categories SET specSchema = ? WHERE id = ?').run(finalSchema, existing.id);
    const updated = db.prepare('SELECT * FROM categories WHERE id = ?').get(existing.id);
    res.json(updated);
  } catch (error) {
    console.error('Error updating category specs:', error);
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

// ==============================================================
// PENGATURAN SISTEM, BACKUP, ALERT ANOMALI, & KEBIJAKAN TELEMETRI
// ==============================================================

const DEFAULT_SETTINGS = {
  anomalyThreshold: {
    validMaxScans: 1,
    warningMaxScans: 3,
    suspiciousMinScans: 4,
    cooldownSeconds: 60,
    enableImpossibleTravel: true,
    maxVelocityKmh: 300,
    consecutiveFailureAlert: 3
  },
  locationPolicy: {
    mode: 'hybrid', // 'hybrid' | 'strict' | 'flexible'
    requireGpsByDefault: true,
    enforceIndonesiaOnly: true,
    maxAccuracyMeters: 150,
    detectMockLocation: true
  },
  notifications: {
    emailEnabled: true,
    emailRecipients: 'security@sumas.id, andriyanafatchulnisairga@gmail.com',
    telegramEnabled: true,
    telegramBotToken: '712398451:AAFlkmx-92j8KqP_9x1Vn58sLmQz4OpK8rU',
    telegramChatId: '@sumas_security_telemetry',
    whatsappEnabled: true,
    whatsappNumber: '+6281298765432',
    whatsappGatewayUrl: 'https://api.fonnte.com/send',
    triggerOnSuspicious: true,
    triggerOnImpossibleTravel: true,
    throttleMinutes: 5
  },
  backupInfo: {
    lastBackupDate: '10 Nov 2026, 08:30 WIB',
    autoBackupDaily: true,
    retentionDays: 30
  }
};

// GET /api/settings - Mendapatkan pengaturan sistem
app.get('/api/settings', (_req, res) => {
  try {
    const row = db.prepare("SELECT value, updatedAt FROM system_settings WHERE key = 'app_settings'").get() as any;
    if (row && row.value) {
      const parsed = JSON.parse(row.value);
      return res.json({ ...DEFAULT_SETTINGS, ...parsed, updatedAt: row.updatedAt });
    }
    res.json({ ...DEFAULT_SETTINGS, updatedAt: 'Belum pernah diubah' });
  } catch (error) {
    console.error('Gagal mengambil pengaturan:', error);
    res.status(500).json({ error: String(error) });
  }
});

// PUT /api/settings - Menyimpan perubahan pengaturan sistem
app.put('/api/settings', (req, res) => {
  try {
    const newSettings = req.body;
    if (!newSettings || typeof newSettings !== 'object') {
      return res.status(400).json({ error: 'Payload pengaturan tidak valid' });
    }

    const merged = {
      anomalyThreshold: { ...DEFAULT_SETTINGS.anomalyThreshold, ...(newSettings.anomalyThreshold || {}) },
      locationPolicy: { ...DEFAULT_SETTINGS.locationPolicy, ...(newSettings.locationPolicy || {}) },
      notifications: { ...DEFAULT_SETTINGS.notifications, ...(newSettings.notifications || {}) },
      backupInfo: { ...DEFAULT_SETTINGS.backupInfo, ...(newSettings.backupInfo || {}) }
    };

    const updatedAt = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) + ' WIB';
    const jsonStr = JSON.stringify(merged);

    db.prepare(`
      INSERT INTO system_settings (key, value, updatedAt)
      VALUES ('app_settings', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
    `).run(jsonStr, updatedAt);

    // Catat log audit perubahan pengaturan sistem
    const logId = Date.now();
    db.prepare(`
      INSERT INTO audit_logs (id, batchId, timestamp, user, reason, changes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      logId,
      'SYSTEM-CONFIG',
      updatedAt,
      'Super Admin',
      'Pembaruan Kebijakan Keamanan & Pengaturan Sistem',
      JSON.stringify([
        { field: 'Ambang Batas Anomali', old: 'Versi Sebelumnya', new: `${merged.anomalyThreshold.warningMaxScans}x Waspada, ≥${merged.anomalyThreshold.suspiciousMinScans}x Palsu` },
        { field: 'Mode Telemetri GPS', old: 'Versi Sebelumnya', new: merged.locationPolicy.mode },
        { field: 'Peringatan Notifikasi', old: 'Versi Sebelumnya', new: `Email: ${merged.notifications.emailEnabled ? 'Aktif' : 'Nonaktif'}, WA: ${merged.notifications.whatsappEnabled ? 'Aktif' : 'Nonaktif'}, Tele: ${merged.notifications.telegramEnabled ? 'Aktif' : 'Nonaktif'}` }
      ])
    );

    res.json({ success: true, settings: { ...merged, updatedAt } });
  } catch (error) {
    console.error('Gagal menyimpan pengaturan:', error);
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/settings/test-alert - Uji coba pengiriman alert anomali instan
app.post('/api/settings/test-alert', (req, res) => {
  try {
    const { channel, target } = req.body;
    const now = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) + ' WIB';
    
    // Simulasikan pengiriman notifikasi dan catat ke riwayat log aktivitas
    const logId = Date.now();
    const channelName = channel === 'telegram' ? 'Telegram Bot' : channel === 'whatsapp' ? 'WhatsApp Gateway' : 'Email Security';
    
    db.prepare(`
      INSERT INTO audit_logs (id, batchId, timestamp, user, reason, changes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      logId,
      'ALERT-TEST',
      now,
      'System Alert Engine',
      `Uji Coba Pengiriman Notifikasi Anomali (${channelName})`,
      JSON.stringify([
        { field: 'Channel', old: '-', new: channelName },
        { field: 'Tujuan', old: '-', new: target || 'Default Destination' },
        { field: 'Status Uji Coba', old: 'Menunggu', new: 'Terkirim Sukses (200 OK)' }
      ])
    );

    res.json({
      success: true,
      message: `Pesan uji coba alert keamanan berhasil disimulasikan ke ${channelName} (${target || 'tujuan terdaftar'}) pada ${now}.`,
      timestamp: now
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// GET /api/settings/backup - Unduh arsip cadangan (Snapshot Database Sumas)
app.get('/api/settings/backup', (_req, res) => {
  try {
    const batches = db.prepare('SELECT * FROM batches').all();
    const tags = db.prepare('SELECT * FROM tags').all();
    const scanPoints = db.prepare('SELECT * FROM scan_points').all();
    const scanActivities = db.prepare('SELECT * FROM scan_activities').all();
    const categories = db.prepare('SELECT * FROM categories').all();
    const brands = db.prepare('SELECT * FROM brands').all();
    const products = db.prepare('SELECT * FROM products').all();
    const users = db.prepare('SELECT id, name, email, phone, role, status, createdAt FROM users').all();
    const auditLogs = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 500').all();
    const settingsRow = db.prepare("SELECT value, updatedAt FROM system_settings WHERE key = 'app_settings'").get() as any;

    const backupDate = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) + ' WIB';
    const timestampIso = new Date().toISOString().replace(/[:.]/g, '-');

    // Update last backup date di settings
    try {
      const current = settingsRow ? JSON.parse(settingsRow.value) : DEFAULT_SETTINGS;
      current.backupInfo = { ...current.backupInfo, lastBackupDate: backupDate };
      db.prepare(`
        INSERT INTO system_settings (key, value, updatedAt)
        VALUES ('app_settings', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
      `).run(JSON.stringify(current), backupDate);
    } catch (_) {}

    const payload = {
      system: 'Sumas Anti-Counterfeiting Platform',
      version: '2.5.0-Enterprise',
      backupGeneratedAt: backupDate,
      summary: {
        totalBatches: batches.length,
        totalTags: tags.length,
        totalScanPoints: scanPoints.length,
        totalCategories: categories.length,
        totalBrands: brands.length,
        totalProducts: products.length,
        totalUsers: users.length,
        totalAuditLogs: auditLogs.length
      },
      data: {
        batches,
        tags,
        scanPoints,
        scanActivities,
        categories,
        brands,
        products,
        users,
        auditLogs,
        settings: settingsRow ? JSON.parse(settingsRow.value) : DEFAULT_SETTINGS
      }
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="sumas-backup-${timestampIso}.json"`);
    res.send(JSON.stringify(payload, null, 2));
  } catch (error) {
    console.error('Gagal membuat backup:', error);
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/settings/restore - Pulihkan data dari berkas cadangan JSON
app.post('/api/settings/restore', (req, res) => {
  try {
    const backup = req.body;
    if (!backup || !backup.data || !backup.system) {
      return res.status(400).json({ error: 'Format berkas cadangan tidak valid atau rusak.' });
    }

    const { batches, tags, scanPoints, categories, brands, products, settings } = backup.data;

    const restoreTx = db.transaction(() => {
      if (Array.isArray(batches) && batches.length > 0) {
        db.prepare('DELETE FROM batches').run();
        const insertBatch = db.prepare(`
          INSERT INTO batches (id, batchId, date, project, sku, brand, qty, actualTagCount, specs, pinLength, status, isB2B, redirectUrl, qrType, requirePin, enableGps)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const b of batches) {
          insertBatch.run(
            b.id, b.batchId, b.date, b.project, b.sku, b.brand, b.qty, 
            b.actualTagCount || b.qty, b.specs, b.pinLength || 6, b.status || 'Aktif',
            b.isB2B ? 1 : 0, b.redirectUrl || 'https://cek.sumas.id/', b.qrType || 'dynamic',
            b.requirePin ?? 1, b.enableGps ?? 1
          );
        }
      }

      if (Array.isArray(categories) && categories.length > 0) {
        db.prepare('DELETE FROM categories').run();
        const insertCat = db.prepare(`
          INSERT INTO categories (id, name, parentId, level, code, description, status, itemCount, orderIndex, createdAt, specSchema)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const c of categories) {
          insertCat.run(c.id, c.name, c.parentId, c.level, c.code, c.description, c.status, c.itemCount, c.orderIndex, c.createdAt, c.specSchema);
        }
      }

      if (settings) {
        const now = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) + ' WIB';
        db.prepare(`
          INSERT INTO system_settings (key, value, updatedAt)
          VALUES ('app_settings', ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
        `).run(JSON.stringify(settings), now);
      }
    });

    restoreTx();

    res.json({
      success: true,
      message: `Pemulihan data berhasil! Total ${backup.summary?.totalBatches || 0} batch dan master data berhasil dipulihkan.`
    });
  } catch (error) {
    console.error('Gagal memulihkan cadangan:', error);
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

  const server = app.listen(PORT, HOST, () => {
    console.log(`Server listening on http://${HOST}:${PORT}`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use.`);
    } else {
      console.error('Server listen error:', err);
    }
  });
}

startServer();
