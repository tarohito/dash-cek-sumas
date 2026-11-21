import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { seedComprehensiveData } from './src/seedData.ts';
import {
  DEFAULT_SYSTEM_SETTINGS,
  mergeSystemSettings,
  isPrivateOrLocalIp,
  evaluateScanAgainstPolicy,
  buildQrVerificationHtml,
  aggregateScanActivityFromPoints,
  type SystemSettingsConfig,
  type GeoIpResult,
  type ScanHistoryRecord,
  type NotificationConfig,
} from './src/utils/securityPolicy.ts';
import {
  DEFAULT_ROLE_PERMISSIONS,
  mergeRbacMatrix,
  getPermissionsForRole,
  hasPermission,
  normalizeRole,
  type PermissionKey,
  type RbacMatrix,
} from './src/utils/rbac.ts';

import {
  escapeHtml,
  escapeLikePattern,
  sanitizeStringInput,
  isValidIpAddress,
  getSafeClientIp,
  validateHttpUrl,
  validatePublicWebhookUrl,
  validateSafeImageSource,
  sanitizePayloadMiddleware,
  createRateLimiter,
  LoginAttemptTracker,
  securityHeadersMiddleware,
  csrfOriginGuardMiddleware,
  sendInternalError,
} from './src/utils/securityHardening.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

const portArgIndex = process.argv.indexOf('--port');
const portFromArg = portArgIndex !== -1 ? parseInt(process.argv[portArgIndex + 1], 10) : NaN;
const PORT = !isNaN(portFromArg) ? portFromArg : (Number(process.env.PORT) || 3000);

const hostArgIndex = process.argv.indexOf('--host');
const hostFromArg = hostArgIndex !== -1 ? process.argv[hostArgIndex + 1] : undefined;
const HOST = hostFromArg && hostFromArg !== 'true' ? hostFromArg : '0.0.0.0';

// 1. Security Headers & Sensitive Path Shield (sebelum static/API)
app.use(securityHeadersMiddleware);

// 2. Anti-DDoS Multi-Tier Rate Limiters (sliding-window, memory-bounded)
const globalApiLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 300,
  keyPrefix: 'api-global',
  message: 'Terlalu banyak permintaan ke server. Mohon tunggu 1 menit lalu coba kembali.',
});
const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 20,
  keyPrefix: 'auth-login',
  message: 'Terlalu banyak percobaan login dari jaringan Anda. Coba lagi dalam beberapa menit.',
});
const passwordResetRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 6,
  keyPrefix: 'auth-reset',
  message: 'Batas pengajuan lupa kata sandi tercapai. Silakan coba lagi setelah 15 menit.',
});
const publicScanRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 80,
  keyPrefix: 'public-scan',
  message: 'Batas pemindaian sementara tercapai. Mohon tunggu sebentar.',
});
const heavyOpsRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  maxRequests: 25,
  keyPrefix: 'heavy-ops',
  message: 'Terlalu banyak operasi berat dalam waktu singkat. Coba lagi beberapa menit lagi.',
});
const loginAttemptTracker = new LoginAttemptTracker({
  maxFailuresPerPair: 5,
  maxFailuresPerIdentifier: 10,
  windowMs: 15 * 60 * 1000,
  lockoutMs: 15 * 60 * 1000,
});

// 3. Body size limits ketat untuk mencegah JSON/Memory DoS (khusus /restore dibatasi 15mb, default 4mb untuk upload gambar)
const restoreJsonParser = express.json({ limit: '15mb', strict: true });
const defaultJsonParser = express.json({ limit: '4mb', strict: true });
app.use((req, res, next) => {
  if (req.path === '/api/settings/restore' && req.method === 'POST') {
    return restoreJsonParser(req, res, next);
  }
  return defaultJsonParser(req, res, next);
});

// 4. Prototype Pollution & Deep Nesting Sanitizer
app.use(sanitizePayloadMiddleware);

// 5. Terapkan Global API Rate Limiter & CSRF Origin Guard pada /api/*
app.use('/api', globalApiLimiter);
app.use('/api', csrfOriginGuardMiddleware);
app.use('/q', publicScanRateLimiter);

// Helper Hashing Password Keamanan Tinggi dengan Salt (scrypt - memory-hard & GPU-resistant)
const DUMMY_SCRYPT_SALT = '00112233445566778899aabbccddeeff';

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
    if (!salt || !originalHash || originalHash.length !== 128) return false;
    try {
      const hash = crypto.scryptSync(password.trim(), salt, 64);
      const originalBuf = Buffer.from(originalHash, 'hex');
      if (hash.length !== originalBuf.length) return false;
      return crypto.timingSafeEqual(hash, originalBuf);
    } catch {
      return false;
    }
  }
  return false;
}

// Dummy hash check untuk mencegah timing side-channel user enumeration saat login
function performDummyPasswordWork(password: string) {
  try {
    crypto.scryptSync(password || 'dummy', DUMMY_SCRYPT_SALT, 64);
  } catch (_) {}
}

// Initialize SQLite database with WAL mode & busy timeout for concurrency resilience
const db = new Database(path.join(__dirname, 'database.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');

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
    redirectUrl TEXT DEFAULT 'https://cek.sumas.id/',
    qrType TEXT DEFAULT 'dynamic',
    requirePin INTEGER DEFAULT 1,
    enableGps INTEGER DEFAULT 1
  );

  CREATE INDEX IF NOT EXISTS idx_batches_batchId ON batches(batchId);
  CREATE INDEX IF NOT EXISTS idx_batches_brand ON batches(brand);

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
  CREATE INDEX IF NOT EXISTS idx_tags_tagNumber ON tags(tagNumber);
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
    description TEXT,
    category TEXT,
    businessType TEXT DEFAULT 'Retail',
    status TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_brands_ownerId ON brands(ownerId);

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

  CREATE INDEX IF NOT EXISTS idx_products_brandId ON products(brandId);

  CREATE TABLE IF NOT EXISTS password_reset_requests (
    id TEXT PRIMARY KEY,
    userId TEXT,
    requestedAt TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Menunggu',
    actionNote TEXT,
    createdAtTs INTEGER
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'info',
    audience TEXT NOT NULL DEFAULT 'brand_scope',
    targetUserId TEXT,
    brandName TEXT,
    brandId TEXT,
    title TEXT NOT NULL,
    subtitle TEXT,
    description TEXT,
    entityType TEXT,
    entityId TEXT,
    status TEXT DEFAULT 'info',
    metadata TEXT,
    dedupeKey TEXT,
    createdAtTs INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(createdAtTs DESC);
  CREATE INDEX IF NOT EXISTS idx_notifications_audience ON notifications(audience, createdAtTs DESC);
  CREATE INDEX IF NOT EXISTS idx_notifications_entity ON notifications(entityType, entityId);
  CREATE INDEX IF NOT EXISTS idx_notifications_dedupe ON notifications(dedupeKey, createdAtTs DESC);

  CREATE TABLE IF NOT EXISTS read_notifications (
    userId TEXT NOT NULL,
    notificationId TEXT NOT NULL,
    readAt TEXT NOT NULL,
    PRIMARY KEY (userId, notificationId)
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parentId TEXT,
    level INTEGER NOT NULL,
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

  CREATE TABLE IF NOT EXISTS server_secrets (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_sessions (
    tokenHash TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    expiresAt INTEGER NOT NULL,
    ipAddress TEXT,
    userAgent TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_user_sessions_userId ON user_sessions(userId);
  CREATE INDEX IF NOT EXISTS idx_user_sessions_expiresAt ON user_sessions(expiresAt);
`);

// Migrations: Standarisasi peran ke 2 tingkat (Super Admin & Admin Brand)
try {
  db.prepare("UPDATE users SET role = 'Admin Brand' WHERE role IS NULL OR LOWER(TRIM(role)) NOT IN ('super admin', 'administrator', 'admin')").run();
  db.prepare("UPDATE users SET role = 'Super Admin' WHERE LOWER(TRIM(role)) IN ('super admin', 'administrator', 'admin')").run();
  const storedRbacRow = db.prepare("SELECT value FROM system_settings WHERE key = 'rbac_permissions'").get() as any;
  if (storedRbacRow?.value) {
    const cleanedMatrix = mergeRbacMatrix(JSON.parse(storedRbacRow.value));
    db.prepare("UPDATE system_settings SET value = ? WHERE key = 'rbac_permissions'").run(JSON.stringify(cleanedMatrix));
  }
} catch (_) {}

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

// Migration: Tambah timestamp numerik untuk pengurutan kronologis reset sandi
try {
  db.prepare('ALTER TABLE password_reset_requests ADD COLUMN createdAtTs INTEGER').run();
} catch (_) {}

// Migration: Upgrade tabel read_notifications dari global (id) menjadi per-user (userId, notificationId, readAt)
try {
  const readCols = db.prepare('PRAGMA table_info(read_notifications)').all() as Array<{ name: string }>;
  const hasUserIdCol = readCols.some((c) => c.name === 'userId');
  const hasNotifIdCol = readCols.some((c) => c.name === 'notificationId');
  if (!hasUserIdCol || !hasNotifIdCol) {
    const legacyRows = readCols.some((c) => c.name === 'id')
      ? (db.prepare('SELECT id FROM read_notifications').all() as Array<{ id: string }>)
      : [];
    const existingUsers = db.prepare('SELECT id FROM users').all() as Array<{ id: string }>;
    const migratedAt = new Date().toISOString();
    const migrateReadTx = db.transaction(() => {
      db.exec(`
        DROP TABLE IF EXISTS read_notifications;
        CREATE TABLE read_notifications (
          userId TEXT NOT NULL,
          notificationId TEXT NOT NULL,
          readAt TEXT NOT NULL,
          PRIMARY KEY (userId, notificationId)
        );
        CREATE INDEX IF NOT EXISTS idx_read_notifications_user ON read_notifications(userId);
      `);
      if (legacyRows.length > 0 && existingUsers.length > 0) {
        const insertMigrated = db.prepare(
          'INSERT OR IGNORE INTO read_notifications (userId, notificationId, readAt) VALUES (?, ?, ?)'
        );
        for (const u of existingUsers) {
          for (const row of legacyRows) {
            if (row?.id) insertMigrated.run(u.id, row.id, migratedAt);
          }
        }
      }
    });
    migrateReadTx();
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_read_notifications_user ON read_notifications(userId);');
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
    db.prepare("UPDATE batches SET project = NULL WHERE isB2B = 0").run();
    db.prepare("UPDATE tags SET project = NULL, allocatedAt = NULL WHERE batchId IN (SELECT id FROM batches WHERE isB2B = 0)").run();
    db.prepare("UPDATE batches SET isB2B = 1 WHERE brand IN (SELECT name FROM brands WHERE businessType = 'B2B')").run();
    db.prepare("UPDATE batches SET isB2B = 0 WHERE brand IN (SELECT name FROM brands WHERE businessType = 'Retail')").run();
    db.prepare("UPDATE products SET isB2B = 1 WHERE brandName IN (SELECT name FROM brands WHERE businessType = 'B2B')").run();
    db.prepare("UPDATE products SET isB2B = 0 WHERE brandName IN (SELECT name FROM brands WHERE businessType = 'Retail')").run();
  }
} catch (err) {
  console.error('Seeding check notice:', err);
}

// Seed initial 3-level categories if empty
const categoryCountRow = db.prepare('SELECT COUNT(*) as count FROM categories').get() as { count: number };
if (categoryCountRow && categoryCountRow.count === 0) {
  const insertCategory = db.prepare(`
    INSERT INTO categories (id, name, parentId, level, createdAt)
    VALUES (?, ?, ?, ?, ?)
  `);

  const initialCategories = [
    // === LEVEL 1: KATEGORI UTAMA ===
    { id: 'cat-mat', name: 'Material & Konstruksi', parentId: null, level: 1, createdAt: '2026-10-01' },
    { id: 'cat-app', name: 'Pakaian & Fashion', parentId: null, level: 1, createdAt: '2026-10-02' },
    { id: 'cat-acc', name: 'Aksesoris & Merchandise', parentId: null, level: 1, createdAt: '2026-10-03' },

    // === LEVEL 2: SUB-KATEGORI (Parent: Material & Konstruksi) ===
    { id: 'cat-cub', name: 'Partisi Cubicle Toilet', parentId: 'cat-mat', level: 2, createdAt: '2026-10-05' },
    { id: 'cat-hdwr', name: 'Aksesoris & Hardware Cubicle', parentId: 'cat-mat', level: 2, createdAt: '2026-10-06' },
    { id: 'cat-clad', name: 'Wall Cladding & Plafon', parentId: 'cat-mat', level: 2, createdAt: '2026-10-07' },

    // === LEVEL 2: SUB-KATEGORI (Parent: Pakaian & Fashion) ===
    { id: 'cat-top', name: 'Atasan & T-Shirt', parentId: 'cat-app', level: 2, createdAt: '2026-10-08' },
    { id: 'cat-out', name: 'Outerwear & Jaket', parentId: 'cat-app', level: 2, createdAt: '2026-10-09' },

    // === LEVEL 2: SUB-KATEGORI (Parent: Aksesoris & Merchandise) ===
    { id: 'cat-hat', name: 'Topi & Headwear', parentId: 'cat-acc', level: 2, createdAt: '2026-10-10' },
    { id: 'cat-bag', name: 'Tas & Pouch', parentId: 'cat-acc', level: 2, createdAt: '2026-10-11' },

    // === LEVEL 3: SUB-SUB KATEGORI (Parent: Partisi Cubicle Toilet) ===
    { id: 'cat-phn12', name: 'Phenolic Board 12mm Standard', parentId: 'cat-cub', level: 3, createdAt: '2026-10-12' },
    { id: 'cat-phn15', name: 'Phenolic Board 15mm Heavy Duty', parentId: 'cat-cub', level: 3, createdAt: '2026-10-13' },
    { id: 'cat-anti', name: 'Antibacterial Board (Medis/RS)', parentId: 'cat-cub', level: 3, createdAt: '2026-10-14' },
    { id: 'cat-wood', name: 'Woodgrain Texture Finish', parentId: 'cat-cub', level: 3, createdAt: '2026-10-15' },

    // === LEVEL 3: SUB-SUB KATEGORI (Parent: Aksesoris & Hardware Cubicle) ===
    { id: 'cat-nyl', name: 'Nylon Fitting Set Hitam', parentId: 'cat-hdwr', level: 3, createdAt: '2026-10-16' },
    { id: 'cat-ss304', name: 'Stainless Steel 304 Luxury', parentId: 'cat-hdwr', level: 3, createdAt: '2026-10-17' },
    { id: 'cat-leg', name: 'Adjustable Leg 10-15cm', parentId: 'cat-hdwr', level: 3, createdAt: '2026-10-18' },

    // === LEVEL 3: SUB-SUB KATEGORI (Parent: Wall Cladding) ===
    { id: 'cat-ext', name: 'Exterior Architectural Cladding', parentId: 'cat-clad', level: 3, createdAt: '2026-10-19' },
    { id: 'cat-int', name: 'Interior Decorative Panel', parentId: 'cat-clad', level: 3, createdAt: '2026-10-20' },

    // === LEVEL 3: SUB-SUB KATEGORI (Parent: Atasan & T-Shirt) ===
    { id: 'cat-ovr', name: 'Oversized Boxy Cut Tee', parentId: 'cat-top', level: 3, createdAt: '2026-10-21' },
    { id: 'cat-reg', name: 'Regular Fit Graphic Tee', parentId: 'cat-top', level: 3, createdAt: '2026-10-22' },

    // === LEVEL 3: SUB-SUB KATEGORI (Parent: Outerwear & Jaket) ===
    { id: 'cat-hood', name: 'Heavyweight Fleece Hoodie', parentId: 'cat-out', level: 3, createdAt: '2026-10-23' },
    { id: 'cat-dnm', name: 'Denim Trucker Jacket', parentId: 'cat-out', level: 3, createdAt: '2026-10-24' },

    // === LEVEL 3: SUB-SUB KATEGORI (Parent: Topi & Headwear) ===
    { id: 'cat-cap', name: '6-Panel Curved Dad Cap', parentId: 'cat-hat', level: 3, createdAt: '2026-10-25' },

    // === LEVEL 3: SUB-SUB KATEGORI (Parent: Tas & Pouch) ===
    { id: 'cat-slng', name: 'Utility Cordura Sling Bag', parentId: 'cat-bag', level: 3, createdAt: '2026-10-26' }
  ];

  const insertAllCats = db.transaction((cats) => {
    for (const c of cats) {
      insertCategory.run(c.id, c.name, c.parentId, c.level, c.createdAt);
    }
  });
  insertAllCats(initialCategories);
}

// Scan points and telemetry data are seeded and synchronized comprehensively via seedComprehensiveData.
// Aktivitas tren scan (/api/scans/activity) kini dihitung 100% secara dinamis dari tabel scan_points & scanHistory.

// Generate permanent tags helper: cryptographically unpredictable ID & PIN via crypto.randomInt
function generateTagsForBatch(batchId: string, brand: string, count: number, pinLen = 8, allocatedCount = 0, projectName = '', specs = 'Phenolic Board 12mm') {
  const pinDigits = '0123456789';
  const idChars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const tags = [];
  const usedTagNumbers = new Set<string>();
  const targetPinLen = Math.min(12, Math.max(4, Number(pinLen) || 8));
  const nowFormatted = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

  // Ambil tagNumber yang sudah ada di database untuk mencegah tabrakan ID
  try {
    const existing = db.prepare('SELECT tagNumber FROM tags').all() as { tagNumber: string }[];
    for (const row of existing) {
      if (row.tagNumber) usedTagNumbers.add(row.tagNumber);
    }
  } catch (_) {}

  for (let i = 1; i <= count; i++) {
    // Format PIN: HANYA ANGKA SAJA (0-9) menggunakan CSPRNG crypto.randomInt
    let pin = '';
    for (let p = 0; p < targetPinLen; p++) {
      pin += pinDigits.charAt(crypto.randomInt(0, pinDigits.length));
    }
    const isAllocated = i <= allocatedCount;

    // Format ID Tag: CAMPURAN ANGKA DAN HURUF (8 Karakter Alfanumerik Unik) via CSPRNG
    let tagNumber = '';
    do {
      let cand = '';
      for (let c = 0; c < 8; c++) {
        cand += idChars.charAt(crypto.randomInt(0, idChars.length));
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
      codeType: isAllocated ? `${brand}-CUB-${new Date().getFullYear()}` : '-',
      warranty: isAllocated ? '5 Tahun' : '-',
      prodCode: isAllocated ? 'PRD-001' : '-',
      note: isAllocated ? (projectName ? `Alokasi proyek ${projectName}` : '-') : '-',
      allocatedAt: isAllocated ? nowFormatted : null
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

if (!batchCountRow || batchCountRow.count < 15 || (firstSp && (!tagCheck || tagCheck.count === 0))) {
  seedComprehensiveData(db);
} else {
  // Ensure tags table has rows for any existing batches (including legacy batches.tags column if present)
  const batchCols = db.prepare('PRAGMA table_info(batches)').all() as Array<{ name: string }>;
  const hasLegacyTagsCol = batchCols.some((c) => c.name === 'tags');
  const existingBatches = db.prepare(
    hasLegacyTagsCol
      ? 'SELECT id, batchId, brand, qty, pinLength, isB2B, project, specs, tags FROM batches'
      : 'SELECT id, batchId, brand, qty, pinLength, isB2B, project, specs FROM batches'
  ).all() as any[];
  for (const b of existingBatches) {
    const tagCount = db.prepare('SELECT COUNT(*) as count FROM tags WHERE batchId = ?').get(b.id) as { count: number };
    if (!tagCount || tagCount.count === 0) {
      if (hasLegacyTagsCol && b.tags) {
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

// Migration: Hapus kolom tabel yang tidak perlu / redundan untuk optimasi skema SQLite
{
  const dropColumnIfExists = (table: string, col: string) => {
    try {
      const cols = db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>;
      if (cols.some((c) => c.name === col)) {
        db.exec(`ALTER TABLE "${table}" DROP COLUMN "${col}"`);
      }
    } catch (_) {}
  };
  dropColumnIfExists('batches', 'tags');
  dropColumnIfExists('scan_points', 'updatedAt');
  dropColumnIfExists('categories', 'itemCount');
  dropColumnIfExists('categories', 'orderIndex');
  dropColumnIfExists('categories', 'description');
  dropColumnIfExists('categories', 'code');
  dropColumnIfExists('categories', 'status');
  dropColumnIfExists('brands', 'ownerName');
  dropColumnIfExists('brands', 'ownerEmail');
  dropColumnIfExists('brands', 'ownerRole');
  dropColumnIfExists('password_reset_requests', 'userName');
  dropColumnIfExists('password_reset_requests', 'userEmail');
  dropColumnIfExists('password_reset_requests', 'userRole');
  dropColumnIfExists('password_reset_requests', 'avatar');
  dropColumnIfExists('password_reset_requests', 'isRead');
}


// ==============================================================
// HARDENED SESSION AUTHENTICATION, RBAC & MULTI-TENANT ISOLATION
// ==============================================================

// Migrasi otomatis: pastikan tidak ada kata sandi plaintext tersisa di tabel users
try {
  const unhashedUsers = db.prepare(
    "SELECT id, password FROM users WHERE password IS NOT NULL AND password != '' AND password NOT LIKE 'scrypt:%'"
  ).all() as { id: string; password: string }[];
  for (const row of unhashedUsers) {
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashPassword(row.password), row.id);
  }
} catch (_) {}

// Secret kriptografis acak 256-bit (disimpan terpisah di server_secrets, tidak diekspor ke backup)
function getOrCreateServerSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 32) {
    return process.env.SESSION_SECRET.trim();
  }
  try {
    const existing = db.prepare("SELECT value FROM server_secrets WHERE key = 'session_hmac_secret'").get() as { value?: string } | undefined;
    if (existing?.value && existing.value.length >= 64) {
      return existing.value;
    }
    const generated = crypto.randomBytes(32).toString('hex');
    db.prepare(
      "INSERT OR REPLACE INTO server_secrets (key, value, createdAt) VALUES ('session_hmac_secret', ?, ?)"
    ).run(generated, new Date().toISOString());
    return generated;
  } catch {
    return crypto.randomBytes(32).toString('hex');
  }
}

const SESSION_SECRET = getOrCreateServerSecret();

function hashSessionToken(rawToken: string): string {
  return crypto.createHmac('sha256', SESSION_SECRET).update(rawToken).digest('hex');
}

function parseCookies(req: express.Request): Record<string, string> {
  const header = req.headers.cookie || '';
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      try { result[k] = decodeURIComponent(v); } catch (_) { result[k] = v; }
    }
  }
  return result;
}

function createUserSession(
  userId: string,
  maxAgeSeconds: number,
  req: express.Request
): string {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(rawToken);
  const now = Date.now();
  const expiresAt = now + maxAgeSeconds * 1000;
  const ipAddress = getSafeClientIp(req);
  const userAgent = sanitizeStringInput(req.headers['user-agent'] || '', 240);

  db.prepare(`
    INSERT INTO user_sessions (tokenHash, userId, createdAt, expiresAt, ipAddress, userAgent)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(tokenHash, userId, now, expiresAt, ipAddress, userAgent);

  // Bersihkan sesi kedaluwarsa & batasi maksimal 10 sesi aktif per akun
  try {
    db.prepare('DELETE FROM user_sessions WHERE expiresAt <= ?').run(now);
    const activeSessions = db.prepare(
      'SELECT tokenHash FROM user_sessions WHERE userId = ? ORDER BY createdAt DESC'
    ).all(userId) as { tokenHash: string }[];
    if (activeSessions.length > 10) {
      const delStmt = db.prepare('DELETE FROM user_sessions WHERE tokenHash = ?');
      for (const stale of activeSessions.slice(10)) {
        delStmt.run(stale.tokenHash);
      }
    }
  } catch (_) {}

  return rawToken;
}

function revokeSessionByToken(rawToken?: string) {
  if (!rawToken) return;
  try {
    const tokenHash = hashSessionToken(rawToken);
    db.prepare('DELETE FROM user_sessions WHERE tokenHash = ?').run(tokenHash);
  } catch (_) {}
}

function revokeAllUserSessions(userId: string) {
  if (!userId) return;
  try {
    db.prepare('DELETE FROM user_sessions WHERE userId = ?').run(userId);
  } catch (_) {}
}

function getRbacMatrix(): RbacMatrix {
  try {
    const row = db.prepare("SELECT value FROM system_settings WHERE key = 'rbac_permissions'").get() as any;
    if (row?.value) {
      return mergeRbacMatrix(JSON.parse(row.value));
    }
  } catch (_) {}
  return mergeRbacMatrix(DEFAULT_ROLE_PERMISSIONS);
}

function saveRbacMatrix(rawMatrix: Partial<Record<string, unknown>>): RbacMatrix {
  const merged = mergeRbacMatrix(rawMatrix);
  const updatedAt = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) + ' WIB';
  db.prepare(`
    INSERT INTO system_settings (key, value, updatedAt)
    VALUES ('rbac_permissions', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
  `).run(JSON.stringify(merged), updatedAt);
  return merged;
}

function extractSessionToken(req: express.Request): string | null {
  const cookies = parseCookies(req);
  if (cookies.sumas_session && cookies.sumas_session.length >= 32 && cookies.sumas_session.length <= 256) {
    return cookies.sumas_session;
  }
  const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization.trim() : '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const bearerToken = authHeader.slice(7).trim();
    if (bearerToken.length >= 32 && bearerToken.length <= 256) {
      return bearerToken;
    }
  }
  return null;
}

function resolveSessionUser(req: express.Request): any | null {
  const rawToken = extractSessionToken(req);
  if (!rawToken) return null;

  const tokenHash = hashSessionToken(rawToken);
  const session = db.prepare(
    'SELECT userId, expiresAt FROM user_sessions WHERE tokenHash = ? LIMIT 1'
  ).get(tokenHash) as { userId: string; expiresAt: number } | undefined;

  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    try { db.prepare('DELETE FROM user_sessions WHERE tokenHash = ?').run(tokenHash); } catch (_) {}
    return null;
  }

  const user = db.prepare(
    'SELECT id, name, username, email, phone, role, avatar, status, createdAt FROM users WHERE id = ?'
  ).get(session.userId) as any;
  if (!user || (user.status || 'Aktif') === 'Nonaktif') {
    revokeAllUserSessions(session.userId);
    return null;
  }
  return { ...user, role: normalizeRole(user.role) };
}

// HANYA mempercayai identitas aktor dari sesi HttpOnly terverifikasi (tidak menerima header X-Actor-* dari klien)
function getActorFromRequest(req: express.Request): { id: string | null; name: string; role: string } {
  const authUser = (req as any).authUser || resolveSessionUser(req);
  if (authUser) {
    return { id: authUser.id, name: authUser.name, role: authUser.role };
  }
  return { id: null, name: 'Sistem', role: 'Admin Brand' };
}

function getNotificationActorLabel(actor: { name: string; role: string }): string {
  if (normalizeRole(actor.role) === 'Super Admin') {
    return 'Administrator';
  }
  return actor.name || 'Sistem';
}

// Multi-Tenant Brand Scope & Anti-IDOR Enforcement Helpers
interface UserBrandScope {
  user: any | null;
  isGlobal: boolean;
  ownedBrandNames: Set<string>;
  ownedBrandIds: Set<string>;
}

function getUserBrandScope(req: express.Request): UserBrandScope {
  const user = (req as any).authUser || resolveSessionUser(req);
  if (!user) {
    return { user: null, isGlobal: false, ownedBrandNames: new Set(), ownedBrandIds: new Set() };
  }
  const matrix = getRbacMatrix();
  const isGlobal = hasPermission(user.role, 'scope.all_brands', matrix);
  if (isGlobal) {
    return { user, isGlobal: true, ownedBrandNames: new Set(), ownedBrandIds: new Set() };
  }
  const rows = db.prepare('SELECT id, name FROM brands WHERE ownerId = ?').all(user.id) as { id: string; name: string }[];
  return {
    user,
    isGlobal: false,
    ownedBrandNames: new Set(rows.map((r) => String(r.name || '').trim().toLowerCase()).filter(Boolean)),
    ownedBrandIds: new Set(rows.map((r) => String(r.id || '').trim()).filter(Boolean)),
  };
}

function canScopeAccessBrand(scope: UserBrandScope, brandName?: string | null, brandId?: string | null): boolean {
  if (scope.isGlobal) return true;
  if (brandId && scope.ownedBrandIds.has(String(brandId).trim())) return true;
  if (brandName && scope.ownedBrandNames.has(String(brandName).trim().toLowerCase())) return true;
  return false;
}

function assertBrandAccess(
  req: express.Request,
  res: express.Response,
  brandName?: string | null,
  brandId?: string | null
): boolean {
  const scope = getUserBrandScope(req);
  if (canScopeAccessBrand(scope, brandName, brandId)) return true;
  res.status(403).json({
    success: false,
    error: 'Akses ditolak. Anda hanya dapat mengakses data milik brand yang berada di bawah pengelolaan Anda.',
  });
  return false;
}

function isBrandB2BDb(brandName?: string | null, batchIsB2B?: number | boolean | null): boolean {
  if (batchIsB2B === 1 || batchIsB2B === true) return true;
  if (batchIsB2B === 0 || batchIsB2B === false) return false;
  if (!brandName) return false;
  try {
    const row = db.prepare('SELECT businessType FROM brands WHERE LOWER(name) = ?').get(brandName.trim().toLowerCase()) as { businessType?: string } | undefined;
    return row?.businessType === 'B2B';
  } catch (_) {
    return false;
  }
}

function buildSessionCookieFlags(req: express.Request, maxAgeSeconds: number): string {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  return isHttps
    ? `Path=/; HttpOnly; SameSite=None; Secure; Partitioned; Max-Age=${maxAgeSeconds}`
    : `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function buildPublicCookieFlags(req: express.Request, maxAgeSeconds: number): string {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  return isHttps
    ? `Path=/; SameSite=None; Secure; Partitioned; Max-Age=${maxAgeSeconds}`
    : `Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

// GET /api/auth/me - Memeriksa sesi login aktif (wajib login, tidak auto-bypass)
app.get('/api/auth/me', (req, res) => {
  try {
    const user = resolveSessionUser(req);
    const matrix = getRbacMatrix();
    if (!user) {
      return res.json({ authenticated: false, user: null, permissions: [], matrix });
    }
    const permissions = getPermissionsForRole(user.role, matrix);
    return res.json({ authenticated: true, user, permissions, matrix });
  } catch (error) {
    return sendInternalError(res, 'GET /api/auth/me', error);
  }
});

// GET /api/auth/demo-accounts - Daftar akun pengguna aktif dinamis untuk tombol bantuan login cepat
app.get('/api/auth/demo-accounts', (_req, res) => {
  try {
    const users = db.prepare(`
      SELECT u.id, u.name, u.email, u.role,
        (SELECT GROUP_CONCAT(b.name, ', ') FROM brands b WHERE b.ownerId = u.id) as managedBrandNames
      FROM users u
      WHERE u.status = 'Aktif'
      ORDER BY CASE WHEN u.role = 'Super Admin' THEN 1 ELSE 2 END, u.id ASC
      LIMIT 3
    `).all() as any[];

    const result = users.map(u => ({
      name: u.name,
      email: u.email,
      role: u.role === 'Super Admin'
        ? 'Super Admin'
        : `Admin Brand ${u.managedBrandNames ? `· (${u.managedBrandNames})` : ''}`
    }));

    res.json(result);
  } catch (error) {
    res.json([]);
  }
});

// POST /api/auth/login - Autentikasi real dengan rate limiter, brute-force lockout & anti-enumeration
app.post('/api/auth/login', loginRateLimiter, (req, res) => {
  try {
    const identifier = sanitizeStringInput(req.body?.identifier || req.body?.email || '', 150).toLowerCase();
    const usernameLookup = identifier.startsWith('@') ? identifier.slice(1) : identifier;
    const password = typeof req.body?.password === 'string' ? req.body.password.slice(0, 200) : '';
    const rememberMe = req.body?.rememberMe !== false;
    const clientIp = getSafeClientIp(req);

    if (!identifier || !password) {
      return res.status(400).json({ success: false, error: 'Email/username dan kata sandi wajib diisi.' });
    }

    // Cek apakah kombinasi IP / akun sedang terkunci karena brute-force
    const lockState = loginAttemptTracker.checkLocked(identifier, clientIp);
    if (lockState.locked) {
      const waitMin = Math.max(1, Math.ceil(lockState.retryAfterSeconds / 60));
      res.setHeader('Retry-After', String(lockState.retryAfterSeconds));
      return res.status(429).json({
        success: false,
        error: `Terlalu banyak percobaan login gagal. Akun sementara dikunci selama ${waitMin} menit untuk keamanan.`,
      });
    }

    const user = db.prepare(
      "SELECT * FROM users WHERE LOWER(email) = ? OR (username IS NOT NULL AND username != '' AND LOWER(username) = ?) LIMIT 1"
    ).get(identifier, usernameLookup) as any;

    // Anti-user-enumeration & timing attack mitigation
    if (!user || !user.password || !String(user.password).trim()) {
      performDummyPasswordWork(password);
      const failure = loginAttemptTracker.recordFailure(identifier, clientIp);
      if (failure.justLocked) {
        return res.status(429).json({
          success: false,
          error: 'Terlalu banyak percobaan login gagal. Coba kembali dalam 15 menit.',
        });
      }
      return res.status(401).json({ success: false, error: 'Email/username atau kata sandi salah.' });
    }

    const passwordValid = verifyPassword(password, user.password);
    if (!passwordValid) {
      const failure = loginAttemptTracker.recordFailure(identifier, clientIp);
      if (failure.justLocked) {
        try {
          const nowStr = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) + ' WIB';
          db.prepare(`
            INSERT INTO audit_logs (id, batchId, timestamp, user, reason, changes)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(
            Date.now() + crypto.randomInt(0, 999),
            'AUTH-SECURITY',
            nowStr,
            'Security Shield',
            `Proteksi Brute-Force: Penguncian sementara percobaan login (${identifier})`,
            JSON.stringify([
              { field: 'IP Sumber', old: '-', new: clientIp },
              { field: 'Tindakan', old: '-', new: 'Dikunci 15 menit setelah 5 kegagalan beruntun' },
            ])
          );
        } catch (_) {}
        return res.status(429).json({
          success: false,
          error: 'Terlalu banyak percobaan login gagal. Akses login sementara dikunci selama 15 menit.',
        });
      }
      return res.status(401).json({ success: false, error: 'Email/username atau kata sandi salah.' });
    }

    if ((user.status || 'Aktif') === 'Nonaktif') {
      return res.status(403).json({
        success: false,
        error: 'Akun ini sedang dinonaktifkan. Hubungi Super Admin untuk mengaktifkan kembali.',
      });
    }

    // Login berhasil: reset brute-force counter & terbitkan sesi revocable baru
    loginAttemptTracker.clearSuccess(identifier, clientIp);

    const maxAgeSeconds = rememberMe ? 30 * 24 * 3600 : 12 * 3600;
    const token = createUserSession(user.id, maxAgeSeconds, req);
    res.setHeader('Set-Cookie', [
      `sumas_session=${encodeURIComponent(token)}; ${buildSessionCookieFlags(req, maxAgeSeconds)}`,
      `sumas_logged_out=; ${buildPublicCookieFlags(req, 0)}`,
    ]);

    const { password: _pwd, ...safeUser } = user;
    const normalizedUser = { ...safeUser, role: normalizeRole(safeUser.role) };
    const matrix = getRbacMatrix();
    const permissions = getPermissionsForRole(normalizedUser.role, matrix);
    res.json({ success: true, user: normalizedUser, permissions, matrix, sessionToken: token });
  } catch (error) {
    return sendInternalError(res, 'POST /api/auth/login', error, 'Gagal memproses login. Silakan coba kembali.');
  }
});

// POST /api/auth/logout - Cabut sesi di database & hapus cookie
app.post('/api/auth/logout', (req, res) => {
  const cookies = parseCookies(req);
  if (cookies.sumas_session) {
    revokeSessionByToken(cookies.sumas_session);
  }
  const bearerOrCookie = extractSessionToken(req);
  if (bearerOrCookie && bearerOrCookie !== cookies.sumas_session) {
    revokeSessionByToken(bearerOrCookie);
  }
  res.setHeader('Set-Cookie', [
    `sumas_session=; ${buildSessionCookieFlags(req, 0)}`,
    `sumas_logged_out=1; ${buildPublicCookieFlags(req, 7 * 24 * 3600)}`,
  ]);
  res.json({ success: true });
});

// PUT /api/auth/profile - Memperbarui profil & kata sandi milik akun yang sedang login
app.put('/api/auth/profile', (req, res) => {
  try {
    const authUser = resolveSessionUser(req);
    if (!authUser) {
      return res.status(401).json({ success: false, error: 'Sesi login tidak valid atau telah berakhir.' });
    }

    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(authUser.id) as any;
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Akun pengguna tidak ditemukan.' });
    }

    const body = req.body || {};
    const cleanName = body.name !== undefined ? sanitizeStringInput(body.name, 120) : existing.name;
    const rawUsername = body.username !== undefined
      ? sanitizeStringInput(body.username, 80).replace(/^@+/, '').toLowerCase()
      : (existing.username || null);
    const cleanUsername = rawUsername ? rawUsername.trim() : null;
    const cleanEmail = body.email !== undefined ? sanitizeStringInput(body.email, 150).toLowerCase() : existing.email;
    const cleanPhone = body.phone !== undefined ? (sanitizeStringInput(body.phone, 40) || null) : existing.phone;
    const cleanAvatar = body.avatar !== undefined ? (sanitizeStringInput(body.avatar, 2_000_000) || null) : existing.avatar;

    if (!cleanName) {
      return res.status(400).json({ success: false, error: 'Nama lengkap wajib diisi.' });
    }
    if (body.username !== undefined) {
      if (!cleanUsername || !/^[a-z0-9._-]{3,50}$/.test(cleanUsername)) {
        return res.status(400).json({ success: false, error: 'Username minimal 3 karakter dan hanya boleh menggunakan huruf, angka, titik, `_`, atau `-`.' });
      }
    }
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ success: false, error: 'Format alamat email tidak valid.' });
    }

    const duplicateEmail = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id != ? LIMIT 1').get(cleanEmail, existing.id) as any;
    if (duplicateEmail) {
      return res.status(409).json({ success: false, error: 'Alamat email sudah digunakan oleh akun lain.' });
    }
    if (cleanUsername) {
      const duplicateUsername = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ? LIMIT 1').get(cleanUsername, existing.id) as any;
      if (duplicateUsername) {
        return res.status(409).json({ success: false, error: 'Username tersebut sudah digunakan oleh akun lain.' });
      }
    }

    const rawNewPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
    const rawCurrentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    let nextPasswordHash = existing.password;

    if (rawNewPassword.trim().length > 0) {
      if (!rawCurrentPassword) {
        return res.status(400).json({ success: false, error: 'Kata sandi saat ini wajib diisi untuk mengubah kata sandi.' });
      }
      if (!existing.password || !verifyPassword(rawCurrentPassword, existing.password)) {
        return res.status(400).json({ success: false, error: 'Kata sandi saat ini tidak sesuai.' });
      }
      if (rawNewPassword.trim().length < 6) {
        return res.status(400).json({ success: false, error: 'Kata sandi baru minimal harus 6 karakter.' });
      }
      nextPasswordHash = hashPassword(rawNewPassword.trim());
    }

    db.prepare(`
      UPDATE users
      SET name = ?, username = ?, email = ?, phone = ?, avatar = ?, password = ?
      WHERE id = ?
    `).run(cleanName, cleanUsername, cleanEmail, cleanPhone, cleanAvatar, nextPasswordHash, existing.id);

    const updated = db.prepare(
      'SELECT id, name, username, email, phone, role, avatar, status, createdAt FROM users WHERE id = ?'
    ).get(existing.id) as any;

    return res.json({
      success: true,
      user: { ...updated, role: normalizeRole(updated.role) },
      passwordUpdated: rawNewPassword.trim().length > 0,
    });
  } catch (error) {
    return sendInternalError(res, 'PUT /api/auth/profile', error, 'Gagal memperbarui profil akun.');
  }
});

// Centralized RBAC API Guard Middleware untuk seluruh endpoint /api/*
app.use('/api', (req, res, next) => {
  const reqPath = req.path;
  const method = req.method.toUpperCase();

  // Endpoint publik: Auth, verifikasi konsumen QR, pencatatan scan, dan permohonan lupa sandi
  if (
    reqPath === '/auth/me' ||
    reqPath === '/auth/login' ||
    reqPath === '/auth/logout' ||
    reqPath === '/auth/demo-accounts' ||
    (method === 'POST' && reqPath === '/password-resets') ||
    (method === 'POST' && /^\/q\/[^/]+\/verify$/.test(reqPath)) ||
    (method === 'POST' && reqPath === '/scans/record')
  ) {
    return next();
  }

  const user = resolveSessionUser(req);
  if (!user) {
    return res.status(401).json({
      error: 'Sesi login tidak valid atau telah berakhir. Silakan masuk terlebih dahulu.',
    });
  }

  (req as any).authUser = user;
  const matrix = getRbacMatrix();
  const can = (perm: PermissionKey) => hasPermission(user.role, perm, matrix);
  const canAny = (...perms: PermissionKey[]) => perms.some((p) => can(p));

  const deny = (msg?: string) =>
    res.status(403).json({
      error: msg || `Akses ditolak. Peran "${user.role}" tidak memiliki izin untuk melakukan tindakan ini.`,
    });

  // Self-service update profil & kata sandi milik akun yang sedang login
  if (reqPath === '/auth/profile' && method === 'PUT') {
    return next();
  }

  // RBAC permissions endpoint
  if (reqPath === '/rbac/permissions') {
    if (method === 'GET') return next();
    if (method === 'PUT') {
      return normalizeRole(user.role) === 'Super Admin'
        ? next()
        : deny('Hanya Super Admin yang berwenang mengubah matriks hak akses (RBAC).');
    }
  }

  // Dashboard & Telemetri Scan
  if (
    reqPath === '/dashboard/stats' ||
    reqPath === '/scans/locations' ||
    reqPath === '/scans/stats' ||
    reqPath === '/scans/activity'
  ) {
    return canAny('dashboard.view', 'scans.view') ? next() : deny();
  }

  // Batches & Tags
  if (reqPath === '/batches' || reqPath.startsWith('/batches/')) {
    if (method === 'GET') return canAny('batches.view', 'dashboard.view') ? next() : deny();
    if (method === 'POST' && reqPath === '/batches') return can('batches.create') ? next() : deny();
    if (method === 'PATCH' && reqPath.endsWith('/redirect-url')) return can('batches.redirect_url') ? next() : deny();
    if (
      (method === 'POST' && (reqPath.endsWith('/allocate') || reqPath.endsWith('/deallocate'))) ||
      (method === 'PUT' && reqPath.endsWith('/projects'))
    ) {
      return can('batches.allocate') ? next() : deny();
    }
    if (method === 'PUT') {
      if (req.body && req.body.status !== undefined && req.body.project === undefined && req.body.specs === undefined) {
        return can('batches.suspend') ? next() : deny();
      }
      return canAny('batches.edit', 'batches.suspend') ? next() : deny();
    }
    if (method === 'DELETE') return can('batches.delete') ? next() : deny();
  }

  // Audit logs
  if (reqPath === '/audit-logs') {
    if (method === 'GET') return canAny('batches.view', 'dashboard.view') ? next() : deny();
    if (method === 'POST') {
      return canAny('batches.create', 'batches.edit', 'batches.allocate', 'batches.suspend', 'batches.redirect_url', 'users.manage')
        ? next()
        : deny();
    }
  }

  // Brands
  if (reqPath === '/brands' || reqPath.startsWith('/brands/')) {
    if (method === 'GET') return next(); // Dibutuhkan untuk pemetaan brand milik Pengelola Brand
    return can('brands.manage') ? next() : deny();
  }

  // Categories
  if (reqPath === '/categories' || reqPath.startsWith('/categories/')) {
    if (method === 'GET') return next();
    return can('categories.manage') ? next() : deny();
  }

  // Products / SKU
  if (reqPath === '/products' || reqPath.startsWith('/products/')) {
    if (method === 'GET') return canAny('sku.view', 'batches.view', 'dashboard.view') ? next() : deny();
    return can('sku.manage') ? next() : deny();
  }

  // Users
  if (reqPath === '/users' || reqPath.startsWith('/users/')) {
    if (method === 'GET') return next(); // Handler menyaring hanya [self] jika tanpa izin users.view/manage
    return can('users.manage') ? next() : deny();
  }

  // Password Reset Management
  if (reqPath === '/password-resets' || reqPath.startsWith('/password-resets/')) {
    return can('users.manage') ? next() : deny();
  }

  // Notifications
  if (reqPath === '/notifications' || reqPath.startsWith('/notifications/')) {
    return next();
  }

  // System Settings, Backup & Restore
  if (reqPath === '/settings' || reqPath.startsWith('/settings/')) {
    if (method === 'GET' && reqPath === '/settings') {
      return canAny('settings.view', 'settings.manage') ? next() : deny();
    }
    return can('settings.manage') ? next() : deny();
  }

  return next();
});

// GET /api/rbac/permissions - Mengambil matriks hak akses aktif
app.get('/api/rbac/permissions', (req, res) => {
  try {
    const user = (req as any).authUser || resolveSessionUser(req);
    const matrix = getRbacMatrix();
    res.json({
      matrix,
      permissions: user ? getPermissionsForRole(user.role, matrix) : [],
    });
  } catch (error) {
    return sendInternalError(res, 'GET /api/rbac/permissions', error);
  }
});

// PUT /api/rbac/permissions - Menyimpan perubahan matriks hak akses oleh Administrator
app.put('/api/rbac/permissions', (req, res) => {
  try {
    const incoming = req.body?.matrix;
    if (!incoming || typeof incoming !== 'object') {
      return res.status(400).json({ success: false, error: 'Payload matriks hak akses tidak valid.' });
    }
    const saved = saveRbacMatrix(incoming);
    const actor = getActorFromRequest(req);
    const nowStr = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) + ' WIB';
    try {
      db.prepare(`
        INSERT INTO audit_logs (id, batchId, timestamp, user, reason, changes)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        Date.now(),
        'RBAC-POLICY',
        nowStr,
        actor.name,
        'Pembaruan Matriks Hak Akses (RBAC)',
        JSON.stringify([
          { field: 'Super Admin', old: '-', new: `${saved['Super Admin'].length} izin aktif (Terkunci)` },
          { field: 'Admin Brand', old: '-', new: `${saved['Admin Brand'].length} izin aktif` },
        ])
      );
    } catch (_) {}

    const actorLabel = getNotificationActorLabel(actor);
    createSystemNotification({
      type: 'system',
      severity: 'warning',
      audience: 'super_admin',
      title: 'Matriks Hak Akses (RBAC) Diperbarui',
      subtitle: `Diperbarui oleh ${actorLabel}`,
      description: `Izin aktif Admin Brand kini berjumlah ${saved['Admin Brand'].length} hak akses.`,
      entityType: 'rbac',
      entityId: 'RBAC-POLICY',
      status: 'edited',
      metadata: {
        actor: actorLabel,
        adminBrandPermissionsCount: saved['Admin Brand'].length,
      },
    });

    res.json({ success: true, matrix: saved });
  } catch (error) {
    return sendInternalError(res, 'PUT /api/rbac/permissions', error);
  }
});

// ==========================================
// REST API ENDPOINTS: SCAN LOCATIONS & TELEMETRY
// ==========================================

// Get real scan locations from SQLite (brand-scoped for Pengelola Brand)
app.get('/api/scans/locations', (req, res) => {
  try {
    const scope = getUserBrandScope(req);
    const rows = db.prepare('SELECT * FROM scan_points ORDER BY id ASC').all() as any[];
    const scopedRows = scope.isGlobal
      ? rows
      : rows.filter((r) => canScopeAccessBrand(scope, r.brand));
    const result = scopedRows.map((r) => {
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
    return sendInternalError(res, 'GET /api/scans/locations', error);
  }
});

// Get scan telemetry summary stats from SQLite (brand-scoped)
app.get('/api/scans/stats', (req, res) => {
  try {
    const scope = getUserBrandScope(req);
    if (scope.isGlobal) {
      const totalPoints = db.prepare('SELECT COUNT(*) as count FROM scan_points').get() as { count: number };
      const validCount = db.prepare("SELECT COUNT(*) as count FROM scan_points WHERE status = 'valid'").get() as { count: number };
      const repeatedCount = db.prepare("SELECT COUNT(*) as count FROM scan_points WHERE status = 'repeated'").get() as { count: number };
      const suspiciousCount = db.prepare("SELECT COUNT(*) as count FROM scan_points WHERE status = 'suspicious'").get() as { count: number };
      const scanSums = db.prepare('SELECT COALESCE(SUM(totalScans), 0) as totalScans, COALESCE(SUM(todayScans), 0) as todayScans FROM scan_points').get() as { totalScans: number; todayScans: number };

      return res.json({
        totalLocations: totalPoints.count,
        totalScans: scanSums.totalScans,
        todayScans: scanSums.todayScans,
        valid: validCount.count,
        repeated: repeatedCount.count,
        suspicious: suspiciousCount.count
      });
    }

    const allRows = db.prepare('SELECT brand, status, totalScans, todayScans FROM scan_points').all() as any[];
    const scoped = allRows.filter((r) => canScopeAccessBrand(scope, r.brand));
    return res.json({
      totalLocations: scoped.length,
      totalScans: scoped.reduce((sum, r) => sum + (Number(r.totalScans) || 0), 0),
      todayScans: scoped.reduce((sum, r) => sum + (Number(r.todayScans) || 0), 0),
      valid: scoped.filter((r) => r.status === 'valid').length,
      repeated: scoped.filter((r) => r.status === 'repeated').length,
      suspicious: scoped.filter((r) => r.status === 'suspicious').length,
    });
  } catch (error) {
    return sendInternalError(res, 'GET /api/scans/stats', error);
  }
});

// Get scan activity chart data dynamically aggregated from real scan_points & scanHistory (brand-scoped)
app.get('/api/scans/activity', (req, res) => {
  try {
    const scope = getUserBrandScope(req);
    const range = sanitizeStringInput(req.query.range || '7d', 10);
    const requestedBrand = sanitizeStringInput(req.query.brand || '', 120);
    if (!scope.isGlobal && requestedBrand && !canScopeAccessBrand(scope, requestedBrand)) {
      return res.status(403).json({ error: 'Akses ditolak untuk data aktivitas brand lain.' });
    }
    const rows = db.prepare('SELECT id, brand, totalScans, todayScans, status, latestTime, createdAt, scanHistory FROM scan_points').all() as any[];
    const scopedRows = scope.isGlobal
      ? rows
      : rows.filter((r) => canScopeAccessBrand(scope, r.brand));
    const aggregated = aggregateScanActivityFromPoints(scopedRows, range, requestedBrand);
    res.json(aggregated);
  } catch (error) {
    return sendInternalError(res, 'GET /api/scans/activity', error);
  }
});

// ==============================================================
// REAL SECURITY, TELEMETRY, GEOIP & INSTANT ALERT ENGINE
// ==============================================================
const alertThrottleMap = new Map<string, number>();

function getActiveSystemSettings(): SystemSettingsConfig {
  try {
    const row = db.prepare("SELECT value FROM system_settings WHERE key = 'app_settings'").get() as { value?: string } | undefined;
    if (row?.value) {
      return mergeSystemSettings(JSON.parse(row.value));
    }
  } catch (_) {}
  return mergeSystemSettings(DEFAULT_SYSTEM_SETTINGS);
}

function extractClientIp(req: express.Request): string {
  return getSafeClientIp(req);
}

async function resolveGeoIpServer(clientIp: string, headers: express.Request['headers']): Promise<GeoIpResult> {
  // 1. Cloudflare proxy headers if behind Cloudflare
  const cfLat = parseFloat(String(headers['cf-iplatitude'] || ''));
  const cfLng = parseFloat(String(headers['cf-iplongitude'] || ''));
  const cfCountry = String(headers['cf-ipcountry'] || '').toUpperCase();
  const cfCity = sanitizeStringInput(headers['cf-ipcity'] || '', 80);
  if (Number.isFinite(cfLat) && Number.isFinite(cfLng) && cfCountry) {
    return {
      city: cfCity || 'Lokasi IP',
      province: sanitizeStringInput(headers['cf-region'] || '', 80),
      countryCode: cfCountry,
      lat: cfLat,
      lng: cfLng,
      isp: sanitizeStringInput(headers['cf-asorganization'] || 'ISP Jaringan', 120),
      isFallbackDefault: false,
    };
  }

  // 2. Private / localhost / invalid IP fallback (Anti-SSRF IP validation)
  if (!isValidIpAddress(clientIp) || isPrivateOrLocalIp(clientIp)) {
    return {
      city: 'Jakarta',
      province: 'DKI Jakarta',
      countryCode: 'ID',
      countryName: 'Indonesia',
      lat: -6.2088,
      lng: 106.8456,
      isp: 'Jaringan Lokal',
      isFallbackDefault: true,
    };
  }

  // 3. Real GeoIP lookup via ipwho.is (timeout 2.5s)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const resp = await fetch(`https://ipwho.is/${encodeURIComponent(clientIp)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timer);
    if (resp.ok) {
      const data = await resp.json() as any;
      if (data && data.success !== false && Number.isFinite(Number(data.latitude)) && Number.isFinite(Number(data.longitude))) {
        return {
          city: data.city || 'Tidak Diketahui',
          province: data.region || '',
          countryCode: String(data.country_code || '').toUpperCase(),
          countryName: data.country || '',
          lat: Number(data.latitude),
          lng: Number(data.longitude),
          isp: data.connection?.isp || data.connection?.org || 'ISP Publik',
          isFallbackDefault: false,
        };
      }
    }
  } catch (_) {}

  return {
    city: 'Jakarta',
    province: 'DKI Jakarta',
    countryCode: 'ID',
    countryName: 'Indonesia',
    lat: -6.2088,
    lng: 106.8456,
    isp: 'ISP Publik',
    isFallbackDefault: true,
  };
}

interface AlertDeliveryResult {
  channel: 'email' | 'telegram' | 'whatsapp';
  success: boolean;
  target: string;
  detail: string;
}

async function sendRealAlertChannel(
  channel: 'email' | 'telegram' | 'whatsapp',
  cfg: NotificationConfig,
  subject: string,
  plainText: string,
  htmlBody: string
): Promise<AlertDeliveryResult> {
  if (channel === 'telegram') {
    const token = (cfg.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || '').trim();
    const chatId = (cfg.telegramChatId || '').trim();
    if (!token) {
      return {
        channel,
        success: false,
        target: chatId || '-',
        detail: 'Bot Token Telegram belum diisi. Masukkan token dari @BotFather terlebih dahulu.',
      };
    }
    if (!chatId) {
      return {
        channel,
        success: false,
        target: '-',
        detail: 'Chat / Channel ID Telegram belum diisi.',
      };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: htmlBody,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const data = await res.json().catch(() => ({})) as any;
      if (res.ok && data?.ok) {
        return {
          channel,
          success: true,
          target: chatId,
          detail: `Terkirim ke Telegram (${chatId}), message_id: ${data.result?.message_id ?? '-'}.`,
        };
      }
      return {
        channel,
        success: false,
        target: chatId,
        detail: `Telegram API menolak (${res.status}): ${data?.description || 'Periksa kembali Bot Token dan Chat ID (pastikan bot sudah menjadi admin/member channel).'}`,
      };
    } catch (err: any) {
      return {
        channel,
        success: false,
        target: chatId,
        detail: `Gagal terhubung ke Telegram API: ${err?.message || String(err)}`,
      };
    }
  }

  if (channel === 'whatsapp') {
    const gatewayUrl = (cfg.whatsappGatewayUrl || '').trim();
    const targetNumber = (cfg.whatsappNumber || '').trim();
    const apiToken = (cfg.whatsappApiToken || process.env.WHATSAPP_API_TOKEN || '').trim();

    if (!gatewayUrl) {
      return {
        channel,
        success: false,
        target: targetNumber || '-',
        detail: 'Gateway Endpoint URL WhatsApp belum diisi.',
      };
    }
    if (!targetNumber) {
      return {
        channel,
        success: false,
        target: '-',
        detail: 'Nomor WhatsApp tujuan belum diisi.',
      };
    }

    try {
      const checkedGateway = validatePublicWebhookUrl(gatewayUrl);
      if (!checkedGateway.valid) {
        return { channel, success: false, target: targetNumber, detail: checkedGateway.error || 'URL Gateway tidak diizinkan.' };
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiToken) {
        headers['Authorization'] = apiToken;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(checkedGateway.url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          target: targetNumber,
          phone: targetNumber,
          message: plainText,
          countryCode: '62',
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      const rawText = await res.text();
      let parsed: any = null;
      try { parsed = JSON.parse(rawText); } catch (_) {}

      const gatewayRejected = parsed && (parsed.status === false || parsed.ok === false);
      if (res.ok && !gatewayRejected) {
        return {
          channel,
          success: true,
          target: targetNumber,
          detail: `Terkirim ke WhatsApp Gateway (${parsed?.detail || parsed?.message || `HTTP ${res.status}`}).`,
        };
      }
      return {
        channel,
        success: false,
        target: targetNumber,
        detail: `WhatsApp Gateway menolak (HTTP ${res.status}): ${parsed?.reason || parsed?.message || rawText.slice(0, 160) || 'Periksa URL & API Token Gateway.'}`,
      };
    } catch (err: any) {
      return {
        channel,
        success: false,
        target: targetNumber,
        detail: `Gagal terhubung ke WhatsApp Gateway: ${err?.message || String(err)}`,
      };
    }
  }

  // Channel: Email (Real SMTP via Nodemailer OR Real Resend API)
  const recipients = (cfg.emailRecipients || '')
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes('@'));

  if (recipients.length === 0) {
    return {
      channel: 'email',
      success: false,
      target: cfg.emailRecipients || '-',
      detail: 'Alamat email penerima belum diisi atau tidak valid.',
    };
  }

  const resendKey = (process.env.RESEND_API_KEY || '').trim();
  const smtpHost = (process.env.SMTP_HOST || '').trim();
  const smtpUser = (process.env.SMTP_USER || '').trim();
  const smtpPass = (process.env.SMTP_PASS || '').trim();

  if (smtpHost && smtpUser && smtpPass) {
    try {
      const smtpPort = Number(process.env.SMTP_PORT) || 587;
      const smtpSecure = process.env.SMTP_SECURE === 'true' || smtpPort === 465;
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: { user: smtpUser, pass: smtpPass },
        connectionTimeout: 8000,
        greetingTimeout: 8000,
      });
      const info = await transporter.sendMail({
        from: process.env.SMTP_FROM || smtpUser,
        to: recipients.join(', '),
        subject,
        text: plainText,
        html: `<div style="font-family:sans-serif;line-height:1.6;color:#1e293b">${htmlBody.replace(/\n/g, '<br/>')}</div>`,
      });
      return {
        channel: 'email',
        success: true,
        target: recipients.join(', '),
        detail: `Email terkirim via SMTP (${smtpHost}), messageId: ${info.messageId}.`,
      };
    } catch (err: any) {
      return {
        channel: 'email',
        success: false,
        target: recipients.join(', '),
        detail: `SMTP gagal mengirim (${smtpHost}): ${err?.message || String(err)}`,
      };
    }
  }

  if (resendKey) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || 'Security Alert <onboarding@resend.dev>',
          to: recipients,
          subject,
          text: plainText,
          html: `<div style="font-family:sans-serif;line-height:1.6;color:#1e293b">${htmlBody.replace(/\n/g, '<br/>')}</div>`,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const data = await res.json().catch(() => ({})) as any;
      if (res.ok && data?.id) {
        return {
          channel: 'email',
          success: true,
          target: recipients.join(', '),
          detail: `Email terkirim via Resend API (id: ${data.id}).`,
        };
      }
      return {
        channel: 'email',
        success: false,
        target: recipients.join(', '),
        detail: `Resend API menolak (${res.status}): ${data?.message || 'Periksa RESEND_API_KEY & RESEND_FROM.'}`,
      };
    } catch (err: any) {
      return {
        channel: 'email',
        success: false,
        target: recipients.join(', '),
        detail: `Gagal terhubung ke Resend API: ${err?.message || String(err)}`,
      };
    }
  }

  return {
    channel: 'email',
    success: false,
    target: recipients.join(', '),
    detail: 'Server email belum dikonfigurasi. Tambahkan SMTP_HOST, SMTP_USER, SMTP_PASS (atau RESEND_API_KEY) pada file .env server.',
  };
}

async function dispatchRealAnomalyAlerts(
  context: {
    tagNumber: string;
    brand: string;
    productType: string;
    batchId: string;
    city: string;
    province: string;
    status: string;
    anomalyReason: string;
    impossibleTravelDetected: boolean;
    totalScans: number;
    ipAddress: string;
    device: string;
  },
  settings: SystemSettingsConfig
): Promise<{ dispatched: boolean; throttled: boolean; results: AlertDeliveryResult[] }> {
  const notif = settings.notifications;
  const shouldTrigger =
    (context.impossibleTravelDetected && notif.triggerOnImpossibleTravel) ||
    (context.status === 'suspicious' && notif.triggerOnSuspicious);

  if (!shouldTrigger) {
    return { dispatched: false, throttled: false, results: [] };
  }

  const throttleMs = Math.max(0, Number(notif.throttleMinutes) || 0) * 60 * 1000;
  const throttleKey = `${context.tagNumber}:${context.impossibleTravelDetected ? 'travel' : 'suspicious'}`;
  const lastSentAt = alertThrottleMap.get(throttleKey) || 0;
  const nowMs = Date.now();
  if (throttleMs > 0 && nowMs - lastSentAt < throttleMs) {
    return { dispatched: false, throttled: true, results: [] };
  }
  if (alertThrottleMap.size > 5000) {
    const oldestKey = alertThrottleMap.keys().next().value;
    if (oldestKey) alertThrottleMap.delete(oldestKey);
  }
  alertThrottleMap.set(throttleKey, nowMs);

  const nowStr = new Date(nowMs).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) + ' WIB';
  const subject = context.impossibleTravelDetected
    ? `[PERINGATAN IMPOSSIBLE TRAVEL] Tag ${context.tagNumber}`
    : `[PERINGATAN ANOMALI] Tag ${context.tagNumber} (${context.brand})`;

  const plainText = [
    subject,
    `Waktu: ${nowStr}`,
    `Tag: ${context.tagNumber} | Batch: ${context.batchId || '-'}`,
    `Produk: ${context.brand} - ${context.productType || '-'}`,
    `Lokasi: ${context.city}${context.province ? `, ${context.province}` : ''} (IP: ${context.ipAddress})`,
    `Perangkat: ${context.device} | Total Scan: ${context.totalScans}x`,
    `Alasan Anomali: ${context.anomalyReason}`,
  ].join('\n');

  const htmlBody = [
    `<b>${escapeHtml(subject)}</b>`,
    `Waktu: ${escapeHtml(nowStr)}`,
    `Tag: <code>${escapeHtml(context.tagNumber)}</code> | Batch: <code>${escapeHtml(context.batchId || '-')}</code>`,
    `Produk: ${escapeHtml(context.brand)} — ${escapeHtml(context.productType || '-')}`,
    `Lokasi: ${escapeHtml(context.city)}${context.province ? `, ${escapeHtml(context.province)}` : ''} (IP: <code>${escapeHtml(context.ipAddress)}</code>)`,
    `Perangkat: ${escapeHtml(context.device)} | Total Scan: ${escapeHtml(context.totalScans)}x`,
    `Alasan: ${escapeHtml(context.anomalyReason)}`,
  ].join('\n');

  const tasks: Promise<AlertDeliveryResult>[] = [];
  if (notif.emailEnabled) tasks.push(sendRealAlertChannel('email', notif, subject, plainText, htmlBody));
  // Integrasi API Telegram & WhatsApp dilewati sementara sesuai kebijakan aktif

  const results = tasks.length > 0 ? await Promise.all(tasks) : [];
  try {
    const changesLog = results.length > 0
      ? results.map((r) => ({
          field: r.channel.toUpperCase(),
          old: r.target,
          new: r.success ? `Terkirim (${r.detail})` : `Gagal (${r.detail})`,
        }))
      : [
          { field: 'Status Peringatan', old: '-', new: 'Tercatat di Dashboard (API Telegram/WA dilewati sementara)' },
          { field: 'Alasan Anomali', old: '-', new: context.anomalyReason },
        ];

    db.prepare(`
      INSERT INTO audit_logs (id, batchId, timestamp, user, reason, changes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      Date.now() + Math.floor(Math.random() * 1000),
      context.batchId || context.tagNumber || 'ALERT-AUTO',
      nowStr,
      'System Alert Engine',
      `Peringatan Otomatis Anomali Tag ${context.tagNumber}`,
      JSON.stringify(changesLog)
    );
  } catch (_) {}

  return { dispatched: true, throttled: false, results };
}

async function evaluateAndPersistScan(params: {
  tagNumber?: string;
  pin?: string;
  brand?: string;
  productType?: string;
  batchId?: string;
  isB2B?: boolean;
  batchEnableGps?: boolean;
  batchSuspended?: boolean;
  gpsGranted: boolean;
  lat?: number | null;
  lng?: number | null;
  accuracyMeters?: number | null;
  speedMps?: number | null;
  isMockLocation?: boolean;
  webdriver?: boolean;
  city?: string;
  province?: string;
  venue?: string;
  countryCode?: string;
  deviceInfo?: string;
  req: express.Request;
}) {
  const settings = getActiveSystemSettings();
  const clientIp = extractClientIp(params.req);
  const userAgent = String(params.req.headers['user-agent'] || '');

  const geoIp = await resolveGeoIpServer(clientIp, params.req.headers);

  // Look up existing scan_points row for this tagNumber (if provided)
  let existingRow: any = null;
  if (params.tagNumber) {
    existingRow = db
      .prepare('SELECT * FROM scan_points WHERE latestTagId = ? ORDER BY rowid DESC LIMIT 1')
      .get(params.tagNumber) as any;
  }

  let existingHistory: ScanHistoryRecord[] = [];
  if (existingRow?.scanHistory) {
    try {
      const parsed = JSON.parse(existingRow.scanHistory);
      if (Array.isArray(parsed)) existingHistory = parsed;
    } catch (_) {}
  }

  const evaluation = evaluateScanAgainstPolicy({
    settings,
    batchEnableGps: params.batchEnableGps,
    existingTotalScans: existingRow ? Number(existingRow.totalScans) || 0 : 0,
    existingTodayScans: existingRow ? Number(existingRow.todayScans) || 0 : 0,
    existingStatus: existingRow?.status,
    existingHistory,
    gpsGranted: params.gpsGranted,
    lat: params.lat,
    lng: params.lng,
    accuracyMeters: params.accuracyMeters,
    speedMps: params.speedMps,
    isMockLocation: params.isMockLocation,
    webdriver: params.webdriver,
    city: params.city,
    province: params.province,
    venue: params.venue,
    countryCode: params.countryCode,
    geoIp,
    ipAddress: clientIp,
    isp: geoIp.isp,
    userAgent,
    deviceInfo: params.deviceInfo,
  });

  if (evaluation.blocked) {
    return { evaluation, scanId: null, settings };
  }

  const finalStatus = params.batchSuspended ? 'suspicious' : evaluation.status;
  const finalAnomalyReason = params.batchSuspended
    ? ['Batch berstatus Disuspend.', evaluation.anomalyReasonText].filter(Boolean).join(' ')
    : evaluation.anomalyReasonText;

  if (finalStatus !== evaluation.historyEntry.status) {
    evaluation.historyEntry.status = finalStatus;
    evaluation.historyEntry.statusNote = finalAnomalyReason || evaluation.historyEntry.statusNote;
  }

  const nowTimeLabel = evaluation.historyEntry.scannedAt;
  const updatedHistory = evaluation.withinCooldown
    ? existingHistory.length > 0
      ? [{ ...existingHistory[0], scannedAt: nowTimeLabel, statusNote: evaluation.historyEntry.statusNote }, ...existingHistory.slice(1)]
      : [evaluation.historyEntry]
    : [evaluation.historyEntry, ...existingHistory].slice(0, 50);

  let scanId: string;
  const nowEpochMs = Date.now();
  const todayIsoDate = new Date(nowEpochMs).toISOString().split('T')[0];
  if (existingRow) {
    scanId = existingRow.id;
    db.prepare(`
      UPDATE scan_points
      SET city = ?, province = ?, venue = ?, lat = ?, lng = ?,
          totalScans = ?, todayScans = ?, latestTime = ?,
          status = ?, anomalyReason = ?, deviceInfo = ?, scanHistory = ?,
          createdAt = ?
      WHERE id = ?
    `).run(
      evaluation.city,
      evaluation.province,
      evaluation.venue,
      evaluation.lat,
      evaluation.lng,
      evaluation.newTotalScans,
      evaluation.newTodayScans,
      nowTimeLabel,
      finalStatus,
      finalAnomalyReason,
      evaluation.historyEntry.device,
      JSON.stringify(updatedHistory),
      todayIsoDate,
      scanId
    );
    // Jika terjadi scan baru di luar cooldown, tandai notifikasi tag ini belum dibaca lagi
    if (!evaluation.withinCooldown) {
      db.prepare('DELETE FROM read_notifications WHERE notificationId = ?').run(`notif-scan-${scanId}`);
    }
  } else {
    scanId = `scan-${nowEpochMs}-${Math.random().toString(36).substring(2, 6)}`;
    db.prepare(`
      INSERT INTO scan_points (
        id, city, province, venue, lat, lng, totalScans, todayScans,
        brand, productType, batchId, latestTagId, pin, latestTime,
        isB2B, status, anomalyReason, deviceInfo, scanHistory, createdAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      scanId,
      evaluation.city,
      evaluation.province,
      evaluation.venue,
      evaluation.lat,
      evaluation.lng,
      evaluation.newTotalScans,
      evaluation.newTodayScans,
      params.brand || 'Umum',
      params.productType || '',
      params.batchId || '',
      params.tagNumber || '',
      params.pin || null,
      nowTimeLabel,
      params.isB2B ? 1 : 0,
      finalStatus,
      finalAnomalyReason,
      evaluation.historyEntry.device,
      JSON.stringify(updatedHistory),
      todayIsoDate
    );
  }

  // Dispatch real instant alerts in background on suspicious / impossible travel
  if (!evaluation.withinCooldown && (finalStatus === 'suspicious' || evaluation.impossibleTravelDetected)) {
    void dispatchRealAnomalyAlerts(
      {
        tagNumber: params.tagNumber || scanId,
        brand: params.brand || existingRow?.brand || 'Produk',
        productType: params.productType || existingRow?.productType || '',
        batchId: params.batchId || existingRow?.batchId || '',
        city: evaluation.city,
        province: evaluation.province,
        status: finalStatus,
        anomalyReason: finalAnomalyReason || 'Anomali terdeteksi',
        impossibleTravelDetected: evaluation.impossibleTravelDetected,
        totalScans: evaluation.newTotalScans,
        ipAddress: clientIp,
        device: evaluation.historyEntry.device,
      },
      settings
    );
  }

  // Emit notifikasi real-time terpusat (brand-scoped untuk Admin Brand & global untuk Super Admin)
  const scanBrand = params.brand || existingRow?.brand || 'Umum';
  const scanProduct = params.productType || existingRow?.productType || scanBrand;
  const isAnomalyScan = finalStatus === 'suspicious' || evaluation.impossibleTravelDetected;
  createSystemNotification({
    type: isAnomalyScan ? 'scan_anomaly' : 'scan',
    severity: isAnomalyScan ? 'critical' : 'info',
    audience: 'brand_scope',
    brandName: scanBrand,
    title: isAnomalyScan ? 'Peringatan Anomali Scan Tag' : 'Aktivitas Scan Tag Berhasil',
    subtitle: `${evaluation.venue ? evaluation.venue + ' · ' : ''}${evaluation.city}, ${evaluation.province}`,
    description: isAnomalyScan
      ? `Tag ${params.tagNumber || scanId} (${scanProduct}): ${finalAnomalyReason || 'Terdeteksi pola pemindaian mencurigakan'}`
      : `Tag ${params.tagNumber || scanId} dipindai untuk produk ${scanProduct} (${evaluation.newTodayScans} scan hari ini)`,
    entityType: 'scan_point',
    entityId: scanId,
    status: finalStatus,
    dedupeKey: `scan:${params.tagNumber || scanId}:${finalStatus}`,
    dedupeWindowMs: isAnomalyScan ? 60_000 : 120_000,
    metadata: {
      deviceInfo: evaluation.historyEntry.device,
      brand: scanBrand,
      tagNumber: params.tagNumber || '',
      city: evaluation.city,
      venue: evaluation.venue,
      anomalyReason: finalAnomalyReason,
    },
  });

  return { evaluation: { ...evaluation, status: finalStatus, anomalyReasonText: finalAnomalyReason }, scanId, settings };
}

// Record a new scan event into SQLite with full real policy enforcement & rate limiting
app.post('/api/scans/record', publicScanRateLimiter, async (req, res) => {
  try {
    const s = req.body || {};
    let batchRecord: any = null;
    let tagRecord: any = null;
    const rawLookupTag = sanitizeStringInput(s.latestTagId || s.tagNumber || '', 80);
    if (rawLookupTag) {
      tagRecord = db.prepare('SELECT * FROM tags WHERE tagNumber = ?').get(rawLookupTag) as any;
      if (tagRecord) {
        batchRecord = db.prepare('SELECT * FROM batches WHERE id = ?').get(tagRecord.batchId) as any;
      }
    }

    const latVal = s.lat !== undefined && s.lat !== null && s.lat !== '' ? Number(s.lat) : null;
    const lngVal = s.lng !== undefined && s.lng !== null && s.lng !== '' ? Number(s.lng) : null;
    const gpsGranted =
      typeof s.gpsGranted === 'boolean'
        ? s.gpsGranted
        : Number.isFinite(latVal) && Number.isFinite(lngVal);

    const { evaluation, scanId } = await evaluateAndPersistScan({
      tagNumber: s.latestTagId || s.tagNumber || '',
      pin: s.pin || tagRecord?.pin || '',
      brand: s.brand || batchRecord?.brand || 'Umum',
      productType: s.productType || batchRecord?.sku || '',
      batchId: s.batchId || batchRecord?.batchId || '',
      isB2B: s.isB2B !== undefined ? Boolean(s.isB2B) : Boolean(batchRecord?.isB2B),
      batchEnableGps: batchRecord ? batchRecord.enableGps !== 0 : true,
      batchSuspended: batchRecord?.status === 'Disuspend',
      gpsGranted,
      lat: latVal,
      lng: lngVal,
      accuracyMeters: s.accuracyMeters !== undefined && s.accuracyMeters !== null ? Number(s.accuracyMeters) : null,
      speedMps: s.speedMps !== undefined && s.speedMps !== null ? Number(s.speedMps) : null,
      isMockLocation: Boolean(s.isMockLocation),
      webdriver: Boolean(s.webdriver),
      city: s.city,
      province: s.province,
      venue: s.venue,
      countryCode: s.countryCode,
      deviceInfo: s.deviceInfo,
      req,
    });

    if (evaluation.blocked) {
      return res.status(403).json({
        success: false,
        blocked: true,
        code: evaluation.blockCode,
        error: evaluation.blockMessage,
        message: evaluation.blockMessage,
      });
    }

    res.json({
      success: true,
      id: scanId,
      status: evaluation.status,
      anomalyReason: evaluation.anomalyReasonText,
      withinCooldown: evaluation.withinCooldown,
      totalScans: evaluation.newTotalScans,
      locationSource: evaluation.locationSource,
      effectiveMode: evaluation.effectiveMode,
      city: evaluation.city,
      province: evaluation.province,
      lat: evaluation.lat,
      lng: evaluation.lng,
      impossibleTravelDetected: evaluation.impossibleTravelDetected,
      velocityKmh: evaluation.velocityKmh,
      distanceKm: evaluation.distanceKm,
    });
  } catch (error) {
    return sendInternalError(res, 'POST /api/scans/record', error);
  }
});

// ==============================================================
// REST API ENDPOINTS: BATCHES & ULTRA-LIGHTWEIGHT PAGINATED TAGS
// ==============================================================

// Get batches metadata (LIGHTWEIGHT, brand-scoped untuk mencegah IDOR)
app.get('/api/batches', (req, res) => {
  try {
    const scope = getUserBrandScope(req);
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
    const scopedRows = scope.isGlobal
      ? rows
      : rows.filter((row) => canScopeAccessBrand(scope, row.brand));
    const result = scopedRows.map((row) => ({
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
    return sendInternalError(res, 'GET /api/batches', error);
  }
});

// Get paginated tags for a specific batch (brand-scoped + SQL LIKE wildcard escaping)
app.get('/api/batches/:id/tags', (req, res) => {
  try {
    const { id } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(500, Math.max(10, parseInt(req.query.limit as string) || 96));
    const offset = (page - 1) * limit;
    const search = sanitizeStringInput(req.query.search || '', 120).toLowerCase();
    const status = sanitizeStringInput(req.query.status || 'all', 40) || 'all';
    const project = sanitizeStringInput(req.query.project || 'all', 120) || 'all';

    const batchRecord = db.prepare('SELECT id, batchId, brand FROM batches WHERE id = ? OR batchId = ?').get(id, id) as any;
    if (!batchRecord) {
      return res.status(404).json({ error: 'Batch tidak ditemukan.' });
    }
    if (!assertBrandAccess(req, res, batchRecord.brand)) return;
    const actualBatchPk = batchRecord.id;

    let countQuery = 'SELECT COUNT(*) as count FROM tags WHERE batchId = ?';
    let dataQuery = 'SELECT * FROM tags WHERE batchId = ?';
    const params: any[] = [actualBatchPk];

    if (search) {
      const escapedSearch = `%${escapeLikePattern(search)}%`;
      const searchClause = " AND (LOWER(pin) LIKE ? ESCAPE '\\' OR LOWER(tagNumber) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(project, '')) LIKE ? ESCAPE '\\')";
      countQuery += searchClause;
      dataQuery += searchClause;
      params.push(escapedSearch, escapedSearch, escapedSearch);
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
    return sendInternalError(res, 'GET /api/batches/:id/tags', error);
  }
});

// Endpoint untuk mengambil seluruh tag batch (untuk render PDF A3+ dan ekspor data, brand-scoped)
app.get('/api/batches/:id/all-tags', (req, res) => {
  try {
    const { id } = req.params;
    const batch = db.prepare('SELECT * FROM batches WHERE id = ? OR batchId = ?').get(id, id) as any;
    if (!batch) {
      return res.status(404).json({ error: 'Batch tidak ditemukan' });
    }
    if (!assertBrandAccess(req, res, batch.brand)) return;
    const tags = db.prepare('SELECT id, batchId, tagNumber, pin, status, project, specs FROM tags WHERE batchId = ? ORDER BY rowid ASC').all(batch.id);
    res.json({
      batch,
      tags,
      total: tags.length
    });
  } catch (error) {
    return sendInternalError(res, 'GET /api/batches/:id/all-tags', error);
  }
});

// Get batch summary and project allocations (brand-scoped)
app.get('/api/batches/:id/summary', (req, res) => {
  try {
    const { id } = req.params;
    const batch = db.prepare('SELECT * FROM batches WHERE id = ? OR batchId = ?').get(id, id) as any;
    if (!batch) {
      return res.status(404).json({ error: 'Batch tidak ditemukan' });
    }
    if (!assertBrandAccess(req, res, batch.brand)) return;

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

    const isB2B = isBrandB2BDb(batch.brand, batch.isB2B);

    res.json({
      batch: { ...batch, isB2B },
      totalTags: tagStats?.total || batch.qty,
      availableCount: tagStats?.available || 0,
      usedCount: tagStats?.used || 0,
      projects: isB2B ? projectAllocations : []
    });
  } catch (error) {
    return sendInternalError(res, 'GET /api/batches/:id/summary', error);
  }
});

// Create batch with high-speed transaction, strict resource bounds, URL validation & brand isolation
app.post('/api/batches', heavyOpsRateLimiter, (req, res) => {
  try {
    const b = req.body || {};
    const batchBrand = sanitizeStringInput(b.brand, 120);
    const batchSku = sanitizeStringInput(b.sku, 200);
    const batchCode = sanitizeStringInput(b.batchId, 120);
    const batchPk = sanitizeStringInput(b.id, 120) || `batch-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

    if (!batchBrand || !batchSku || !batchCode) {
      return res.status(400).json({ error: 'ID Batch, Brand, dan SKU wajib diisi.' });
    }
    if (!assertBrandAccess(req, res, batchBrand)) return;

    const rawQty = parseInt(String(b.qty), 10);
    if (!Number.isFinite(rawQty) || rawQty < 1 || rawQty > 25000) {
      return res.status(400).json({ error: 'Jumlah tag per batch harus antara 1 hingga 25.000 tag.' });
    }
    const qty = rawQty;
    const pinLength = Math.min(12, Math.max(4, parseInt(String(b.pinLength), 10) || 8));
    const isB2B = b.isB2B ? 1 : 0;

    const urlCheck = validateHttpUrl(b.redirectUrl, { allowEmpty: true, defaultUrl: 'https://cek.sumas.id/' });
    if (!urlCheck.valid) {
      return res.status(400).json({ error: urlCheck.error || 'URL pengalihan QR tidak valid.' });
    }
    const redirectUrl = urlCheck.url || 'https://cek.sumas.id/';
    const qrType = b.qrType === 'static' ? 'static' : 'dynamic';
    const requirePin = b.requirePin === false || b.requirePin === 0 ? 0 : 1;
    const enableGps = b.enableGps === false || b.enableGps === 0 ? 0 : 1;
    const safeStatus = b.status === 'Disuspend' ? 'Disuspend' : 'Aktif';
    const safeDate = sanitizeStringInput(b.date, 80) || new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
    const safeSpecs = sanitizeStringInput(b.specs, 500) || '-';
    const safeProject = b.project ? sanitizeStringInput(b.project, 200) : null;

    const stmt = db.prepare(`
      INSERT INTO batches (id, batchId, date, project, sku, brand, qty, specs, pinLength, status, isB2B, redirectUrl, qrType, requirePin, enableGps)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      batchPk,
      batchCode,
      safeDate,
      safeProject,
      batchSku,
      batchBrand,
      qty,
      safeSpecs,
      pinLength,
      safeStatus,
      isB2B,
      redirectUrl,
      qrType,
      requirePin,
      enableGps
    );

    // High performance bulk insertion of CSPRNG tags in single SQLite transaction
    const generatedTags = generateTagsForBatch(batchPk, batchBrand, qty, pinLength, 0, '');
    insertBatchTags(generatedTags);

    res.json({
      ...b,
      id: batchPk,
      batchId: batchCode,
      date: safeDate,
      project: safeProject,
      sku: batchSku,
      brand: batchBrand,
      specs: safeSpecs,
      status: safeStatus,
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
    return sendInternalError(res, 'POST /api/batches', error);
  }
});

// Update dynamic QR redirect URL & security settings for an existing batch (validated URL + brand isolation)
app.patch('/api/batches/:id/redirect-url', (req, res) => {
  try {
    const { id } = req.params;
    const { redirectUrl, qrType, requirePin, enableGps } = req.body || {};
    const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(id) as any;
    if (!batch) {
      return res.status(404).json({ error: 'Batch tidak ditemukan' });
    }
    if (!assertBrandAccess(req, res, batch.brand)) return;

    if (batch.qrType === 'static') {
      return res.status(400).json({
        error: 'Batch dengan tipe QR Statis tidak mendukung perubahan URL karena alamat URL telah tertanam permanen pada stiker fisik.'
      });
    }

    let newUrl = batch.redirectUrl || 'https://cek.sumas.id/';
    if (redirectUrl !== undefined) {
      const urlCheck = validateHttpUrl(redirectUrl, { allowEmpty: false });
      if (!urlCheck.valid) {
        return res.status(400).json({ error: urlCheck.error || 'URL pengalihan QR hanya boleh menggunakan http:// atau https://.' });
      }
      newUrl = urlCheck.url;
    }

    const newQrType = qrType === 'static' ? 'static' : (qrType === 'dynamic' ? 'dynamic' : (batch.qrType || 'dynamic'));
    const newRequirePin = requirePin !== undefined ? (requirePin ? 1 : 0) : (batch.requirePin ?? 1);
    const newEnableGps = enableGps !== undefined ? (enableGps ? 1 : 0) : (batch.enableGps ?? 1);

    db.prepare(`
      UPDATE batches 
      SET redirectUrl = ?, qrType = ?, requirePin = ?, enableGps = ?
      WHERE id = ?
    `).run(newUrl, newQrType, newRequirePin, newEnableGps, id);

    const actor = getActorFromRequest(req);
    const logId = Date.now();
    const timestamp = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
    db.prepare(`
      INSERT INTO audit_logs (id, batchId, timestamp, user, reason, changes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      logId,
      batch.batchId,
      timestamp,
      actor.name,
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
    return sendInternalError(res, 'PATCH /api/batches/:id/redirect-url', error);
  }
});

// Dynamic QR Code Resolver Endpoint: /q/:tagNumber (XSS-hardened + Safe Redirect + GPS Telemetry Policy)
app.get('/q/:tagNumber', async (req, res) => {
  try {
    const rawTagNumber = sanitizeStringInput(req.params.tagNumber, 64);
    const tag = db.prepare('SELECT * FROM tags WHERE tagNumber = ?').get(rawTagNumber) as any;
    if (!tag) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="id">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Tag Tidak Ditemukan - Verifikasi Keaslian</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
              .card { background: #1e293b; border: 1px solid #334155; border-radius: 20px; padding: 32px 24px; max-width: 420px; width: 100%; text-align: center; }
              h2 { color: #f43f5e; margin: 0 0 12px; font-size: 20px; }
              p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 20px; }
              .badge { display: inline-block; padding: 6px 14px; border-radius: 999px; background: rgba(244, 63, 94, 0.15); color: #fb7185; font-family: monospace; font-size: 13px; font-weight: bold; border: 1px solid rgba(244, 63, 94, 0.3); word-break: break-all; }
            </style>
          </head>
          <body>
            <div class="card">
              <h2>Tag Tidak Terdaftar</h2>
              <p>Nomor tag fisik berikut tidak terdata pada sistem verifikasi keamanan:</p>
              <div class="badge">${escapeHtml(rawTagNumber || '-')}</div>
            </div>
          </body>
        </html>
      `);
    }

    const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(tag.batchId) as any;
    const checkedTarget = validateHttpUrl(batch?.redirectUrl, { allowEmpty: true, defaultUrl: 'https://cek.sumas.id/' });
    const targetUrl = checkedTarget.valid && checkedTarget.url ? checkedTarget.url : 'https://cek.sumas.id/';

    const settings = getActiveSystemSettings();
    const effectiveMode: 'hybrid' | 'strict' | 'flexible' =
      batch && batch.enableGps === 0 ? 'flexible' : settings.locationPolicy.mode;

    if (effectiveMode === 'hybrid' || effectiveMode === 'strict') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.send(
        buildQrVerificationHtml({
          tagNumber: tag.tagNumber,
          brand: batch?.brand || 'Produk',
          sku: batch?.sku || '',
          mode: effectiveMode,
          maxAccuracyMeters: settings.locationPolicy.maxAccuracyMeters,
        })
      );
    }

    const { evaluation } = await evaluateAndPersistScan({
      tagNumber: tag.tagNumber,
      pin: tag.pin,
      brand: batch?.brand || 'Umum',
      productType: batch?.sku || 'Material',
      batchId: batch?.batchId || tag.batchId,
      isB2B: Boolean(batch?.isB2B),
      batchEnableGps: false,
      batchSuspended: batch?.status === 'Disuspend',
      gpsGranted: false,
      req,
    });

    const sep = targetUrl.includes('?') ? '&' : '?';
    const redirectTarget = `${targetUrl}${sep}tag=${encodeURIComponent(tag.tagNumber)}&pin=${encodeURIComponent(tag.pin)}&batch=${encodeURIComponent(batch?.batchId || '')}&sku=${encodeURIComponent(batch?.sku || '')}&brand=${encodeURIComponent(batch?.brand || '')}&status=${encodeURIComponent(evaluation.status)}`;

    res.redirect(302, redirectTarget);
  } catch (error) {
    console.error('[SECURITY/SERVER ERROR] GET /q/:tagNumber:', error);
    res.status(500).send('Terjadi kesalahan saat mengalihkan QR Code Dinamis.');
  }
});

// POST /api/q/:tagNumber/verify - Endpoint verifikasi GPS real dari halaman /q/:tagNumber
app.post('/api/q/:tagNumber/verify', publicScanRateLimiter, async (req, res) => {
  try {
    const rawTagNumber = sanitizeStringInput(req.params.tagNumber, 64);
    const tag = db.prepare('SELECT * FROM tags WHERE tagNumber = ?').get(rawTagNumber) as any;
    if (!tag) {
      return res.status(404).json({ success: false, message: 'Nomor tag fisik tidak ditemukan.' });
    }

    const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(tag.batchId) as any;
    const checkedTarget = validateHttpUrl(batch?.redirectUrl, { allowEmpty: true, defaultUrl: 'https://cek.sumas.id/' });
    const targetUrl = checkedTarget.valid && checkedTarget.url ? checkedTarget.url : 'https://cek.sumas.id/';

    const body = req.body || {};
    const latVal = body.lat !== undefined && body.lat !== null ? Number(body.lat) : null;
    const lngVal = body.lng !== undefined && body.lng !== null ? Number(body.lng) : null;
    const accuracyVal = body.accuracyMeters !== undefined && body.accuracyMeters !== null ? Number(body.accuracyMeters) : null;
    const speedVal = body.speedMps !== undefined && body.speedMps !== null ? Number(body.speedMps) : null;

    const { evaluation, scanId } = await evaluateAndPersistScan({
      tagNumber: tag.tagNumber,
      pin: tag.pin,
      brand: batch?.brand || 'Umum',
      productType: batch?.sku || 'Material',
      batchId: batch?.batchId || tag.batchId,
      isB2B: Boolean(batch?.isB2B),
      batchEnableGps: batch ? batch.enableGps !== 0 : true,
      batchSuspended: batch?.status === 'Disuspend',
      gpsGranted: Boolean(body.gpsGranted),
      lat: latVal,
      lng: lngVal,
      accuracyMeters: accuracyVal,
      speedMps: speedVal,
      isMockLocation: Boolean(body.isMockLocation),
      webdriver: Boolean(body.webdriver),
      req,
    });

    if (evaluation.blocked) {
      return res.status(403).json({
        success: false,
        blocked: true,
        code: evaluation.blockCode,
        message: evaluation.blockMessage,
      });
    }

    const sep = targetUrl.includes('?') ? '&' : '?';
    const redirectUrl = `${targetUrl}${sep}tag=${encodeURIComponent(tag.tagNumber)}&pin=${encodeURIComponent(tag.pin)}&batch=${encodeURIComponent(batch?.batchId || '')}&sku=${encodeURIComponent(batch?.sku || '')}&brand=${encodeURIComponent(batch?.brand || '')}&status=${encodeURIComponent(evaluation.status)}`;

    res.json({
      success: true,
      scanId,
      redirectUrl,
      status: evaluation.status,
      anomalyReason: evaluation.anomalyReasonText,
      withinCooldown: evaluation.withinCooldown,
      locationSource: evaluation.locationSource,
      city: evaluation.city,
      province: evaluation.province,
    });
  } catch (error) {
    return sendInternalError(res, 'POST /api/q/:tagNumber/verify', error, 'Gagal memverifikasi tag.');
  }
});

// Allocate selected tags to a project in a fast transaction (Khusus Batch Milik SUMAS + brand-scoped)
app.post('/api/batches/:id/allocate', (req, res) => {
  try {
    const { id } = req.params;
    const { tagIds, project, specs, codeType, warranty, prodCode, note } = req.body || {};

    const batch = db.prepare('SELECT id, brand, isB2B FROM batches WHERE id = ?').get(id) as { id: string; brand: string; isB2B?: number } | undefined;
    if (!batch) {
      return res.status(404).json({ error: 'Batch tidak ditemukan' });
    }
    if (!assertBrandAccess(req, res, batch.brand)) return;

    const isBatchB2B = isBrandB2BDb(batch.brand, batch.isB2B);
    if (!isBatchB2B) {
      return res.status(403).json({
        error: `Batch milik brand "${batch.brand}" bertipe Retail dan tidak memiliki fitur alokasi proyek. Alokasi proyek hanya berlaku untuk brand/batch B2B.`
      });
    }

    if (!Array.isArray(tagIds) || tagIds.length === 0 || tagIds.length > 10000) {
      return res.status(400).json({ error: 'Jumlah tag yang dipilih harus antara 1 hingga 10.000 tag.' });
    }
    const cleanProject = sanitizeStringInput(project, 200);
    if (!cleanProject) {
      return res.status(400).json({ error: 'Nama proyek wajib diisi.' });
    }

    const allocatedAt = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
    const cleanSpecs = sanitizeStringInput(specs, 300) || '-';
    const cleanCodeType = sanitizeStringInput(codeType, 120) || '-';
    const cleanWarranty = sanitizeStringInput(warranty, 120) || '-';
    const cleanProdCode = sanitizeStringInput(prodCode, 120) || '-';
    const cleanNote = sanitizeStringInput(note, 500) || '-';

    const updateTagStmt = db.prepare(`
      UPDATE tags 
      SET status = 'Telah Digunakan', project = ?, specs = ?, codeType = ?, warranty = ?, prodCode = ?, note = ?, allocatedAt = ?
      WHERE id = ? AND batchId = ?
    `);

    const runAllocation = db.transaction((ids: unknown[]) => {
      for (const tagId of ids) {
        if (typeof tagId !== 'string' || !tagId) continue;
        updateTagStmt.run(cleanProject, cleanSpecs, cleanCodeType, cleanWarranty, cleanProdCode, cleanNote, allocatedAt, tagId, id);
      }
    });

    runAllocation(tagIds);

    const distinctProjectsRows = db.prepare(`
      SELECT DISTINCT project FROM tags WHERE batchId = ? AND project IS NOT NULL AND status = 'Telah Digunakan'
    `).all(id) as { project: string }[];
    const distinctProjects = distinctProjectsRows.map(r => r.project).join(', ');

    db.prepare('UPDATE batches SET project = ? WHERE id = ?').run(distinctProjects || null, id);

    res.json({ success: true, allocatedCount: tagIds.length, project: cleanProject, allocatedAt });
  } catch (error) {
    return sendInternalError(res, 'POST /api/batches/:id/allocate', error);
  }
});

// Deallocate tags for a project (Khusus Batch Milik SUMAS + brand-scoped)
app.post('/api/batches/:id/deallocate', (req, res) => {
  try {
    const { id } = req.params;
    const project = sanitizeStringInput(req.body?.project, 200);

    const batch = db.prepare('SELECT id, brand, isB2B FROM batches WHERE id = ?').get(id) as { id: string; brand: string; isB2B?: number } | undefined;
    if (!batch) {
      return res.status(404).json({ error: 'Batch tidak ditemukan' });
    }
    if (!assertBrandAccess(req, res, batch.brand)) return;

    const isBatchB2B = isBrandB2BDb(batch.brand, batch.isB2B);
    if (!isBatchB2B) {
      return res.status(403).json({ error: 'Operasi alokasi proyek hanya berlaku untuk brand/batch B2B.' });
    }

    db.prepare(`
      UPDATE tags
      SET status = 'Tersedia', project = NULL, specs = '-', codeType = '-', warranty = '-', prodCode = '-', note = '-', allocatedAt = NULL
      WHERE batchId = ? AND project = ?
    `).run(id, project);

    const distinctProjectsRows = db.prepare(`
      SELECT DISTINCT project FROM tags WHERE batchId = ? AND project IS NOT NULL AND status = 'Telah Digunakan'
    `).all(id) as { project: string }[];
    const distinctProjects = distinctProjectsRows.map(r => r.project).join(', ');

    db.prepare('UPDATE batches SET project = ? WHERE id = ?').run(distinctProjects || null, id);

    res.json({ success: true, deallocatedProject: project });
  } catch (error) {
    return sendInternalError(res, 'POST /api/batches/:id/deallocate', error);
  }
});

// Update project data within batch (from Alokasi Proyek page - Khusus SUMAS + brand-scoped)
app.put('/api/batches/:id/projects', (req, res) => {
  try {
    const { id } = req.params;
    const batch = db.prepare('SELECT id, brand, isB2B FROM batches WHERE id = ?').get(id) as { id: string; brand: string; isB2B?: number } | undefined;
    if (!batch) {
      return res.status(404).json({ error: 'Batch tidak ditemukan' });
    }
    if (!assertBrandAccess(req, res, batch.brand)) return;

    const isBatchB2B = isBrandB2BDb(batch.brand, batch.isB2B);
    if (!isBatchB2B) {
      return res.status(403).json({ error: 'Pengeditan data proyek hanya berlaku untuk brand/batch B2B.' });
    }

    const { oldProjectName, newProjectName, specs, codeType, warranty, prodCode, note } = req.body || {};

    const trimmedOld = sanitizeStringInput(oldProjectName, 200);
    const trimmedNew = sanitizeStringInput(newProjectName, 200);
    if (!trimmedOld || !trimmedNew) {
      return res.status(400).json({ error: 'Nama proyek lama dan baru wajib diisi' });
    }

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
      sanitizeStringInput(specs, 300) || '-',
      sanitizeStringInput(codeType, 120) || '-',
      sanitizeStringInput(warranty, 120) || '-',
      sanitizeStringInput(prodCode, 120) || '-',
      sanitizeStringInput(note, 500) || '-',
      id,
      trimmedOld
    );

    const distinctProjectsRows = db.prepare(`
      SELECT DISTINCT project FROM tags WHERE batchId = ? AND project IS NOT NULL AND status = 'Telah Digunakan'
    `).all(id) as { project: string }[];
    const distinctProjects = distinctProjectsRows.map(r => r.project).join(', ');

    db.prepare('UPDATE batches SET project = ? WHERE id = ?').run(distinctProjects || null, id);

    res.json({ success: true, updatedProject: trimmedNew });
  } catch (error) {
    return sendInternalError(res, 'PUT /api/batches/:id/projects', error);
  }
});


app.put('/api/batches/:id', (req, res) => {
  try {
    const { id } = req.params;
    const b = req.body || {};

    const existing = db.prepare('SELECT * FROM batches WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: 'Batch tidak ditemukan.' });
    }
    if (!assertBrandAccess(req, res, existing.brand)) return;

    const actor = getActorFromRequest(req);
    const matrix = getRbacMatrix();
    const hasEditPerm = hasPermission(actor.role, 'batches.edit', matrix);
    const hasSuspendPerm = hasPermission(actor.role, 'batches.suspend', matrix);

    const nextProject = b.project !== undefined ? (b.project === null ? null : sanitizeStringInput(b.project, 200)) : existing.project;
    const nextSpecs = b.specs !== undefined ? sanitizeStringInput(b.specs, 500) : existing.specs;
    const nextStatus = b.status !== undefined ? (b.status === 'Disuspend' ? 'Disuspend' : 'Aktif') : existing.status;

    const isModifyingDetails =
      (b.project !== undefined && nextProject !== existing.project) ||
      (b.specs !== undefined && nextSpecs !== existing.specs);
    const isModifyingStatus = b.status !== undefined && nextStatus !== existing.status;

    if (isModifyingDetails && !hasEditPerm) {
      return res.status(403).json({ error: 'Akses ditolak. Anda tidak memiliki izin untuk mengubah detail batch.' });
    }
    if (isModifyingStatus && !hasSuspendPerm) {
      return res.status(403).json({ error: 'Akses ditolak. Anda tidak memiliki izin untuk menangguhkan atau memulihkan batch.' });
    }

    const updated = {
      project: nextProject,
      specs: nextSpecs,
      status: nextStatus,
    };

    db.prepare(`
      UPDATE batches 
      SET project = ?, specs = ?, status = ?
      WHERE id = ?
    `).run(updated.project, updated.specs, updated.status, id);

    const result = db.prepare('SELECT * FROM batches WHERE id = ?').get(id) as any;

    // Notifikasi perubahan status kritis batch (Suspend / Pulihkan) ke Super Admin & Admin Brand pemilik brand
    if (existing.status !== updated.status) {
      const actorLabel = getNotificationActorLabel(actor);
      const isSuspendedNow = updated.status === 'Disuspend';
      createSystemNotification({
        type: 'edit',
        severity: isSuspendedNow ? 'warning' : 'info',
        audience: 'brand_scope',
        brandName: existing.brand,
        title: isSuspendedNow
          ? `Batch Disuspend: ${existing.batchId}`
          : `Batch Dipulihkan: ${existing.batchId}`,
        subtitle: `Dilakukan oleh ${actorLabel} · Brand ${existing.brand}`,
        description: isSuspendedNow
          ? `Status batch ${existing.batchId} (${existing.sku}) diubah menjadi Disuspend.`
          : `Status batch ${existing.batchId} (${existing.sku}) telah diaktifkan kembali.`,
        entityType: 'batch',
        entityId: existing.batchId,
        status: 'edited',
        dedupeKey: `batch-status:${existing.batchId}:${updated.status}`,
        dedupeWindowMs: 10_000,
        metadata: {
          user: actorLabel,
          batchId: existing.batchId,
          brand: existing.brand,
          changes: [{ field: 'Status', old: existing.status || 'Aktif', new: updated.status }],
        },
      });
    }

    res.json({
      ...result,
      isB2B: Boolean(result.isB2B),
      tags: null
    });
  } catch (error) {
    return sendInternalError(res, 'PUT /api/batches/:id', error);
  }
});

app.delete('/api/batches/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM batches WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: 'Batch tidak ditemukan.' });
    }
    if (!assertBrandAccess(req, res, existing.brand)) return;

    const delTx = db.transaction(() => {
      db.prepare('DELETE FROM batches WHERE id = ?').run(id);
      db.prepare('DELETE FROM tags WHERE batchId = ?').run(id);
      db.prepare('DELETE FROM audit_logs WHERE batchId = ?').run(existing.batchId);
    });
    delTx();
    res.json({ success: true });
  } catch (error) {
    return sendInternalError(res, 'DELETE /api/batches/:id', error);
  }
});

// Audit logs (brand-scoped untuk Pengelola Brand)
app.get('/api/audit-logs', (req, res) => {
  try {
    const scope = getUserBrandScope(req);
    const rows = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 200').all() as any[];
    let filteredRows = rows;
    if (!scope.isGlobal) {
      const ownedBatches = db.prepare('SELECT batchId, brand FROM batches').all() as { batchId: string; brand: string }[];
      const allowedBatchIds = new Set(
        ownedBatches.filter((b) => canScopeAccessBrand(scope, b.brand)).map((b) => b.batchId)
      );
      filteredRows = rows.filter((r) => allowedBatchIds.has(r.batchId));
    }
    const result = filteredRows.map((row) => {
      let changes = [];
      try { changes = JSON.parse(row.changes); } catch (_) {}
      return { ...row, changes };
    });
    res.json(result);
  } catch (error) {
    return sendInternalError(res, 'GET /api/audit-logs', error);
  }
});

// Audit log creation: selalu gunakan identitas aktor dari sesi terverifikasi (anti-spoofing)
app.post('/api/audit-logs', (req, res) => {
  try {
    const log = req.body || {};
    const actor = getActorFromRequest(req);
    const batchIdStr = sanitizeStringInput(log.batchId, 120);
    if (!batchIdStr) {
      return res.status(400).json({ error: 'batchId audit log wajib diisi.' });
    }
    const scope = getUserBrandScope(req);
    const relatedBatch = db.prepare('SELECT brand FROM batches WHERE batchId = ? OR id = ?').get(batchIdStr, batchIdStr) as { brand: string } | undefined;
    if (!scope.isGlobal) {
      if (!relatedBatch) {
        return res.status(403).json({ error: 'Akses ditolak. Audit log hanya dapat dicatat untuk batch milik brand yang Anda kelola.' });
      }
      if (!assertBrandAccess(req, res, relatedBatch.brand)) return;
    }

    const safeId = Number.isSafeInteger(Number(log.id)) && Number(log.id) > 0 ? Number(log.id) : Date.now();
    const safeTimestamp = sanitizeStringInput(log.timestamp, 80) || new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
    const safeReason = sanitizeStringInput(log.reason, 400) || 'Pembaruan data';
    const safeChanges = Array.isArray(log.changes) ? log.changes.slice(0, 50) : [];

    db.prepare(`
      INSERT INTO audit_logs (id, batchId, timestamp, user, reason, changes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      safeId,
      batchIdStr,
      safeTimestamp,
      actor.name,
      safeReason,
      JSON.stringify(safeChanges)
    );
    const fieldSummary = safeChanges
      .map((c: any) => `${c.field}: "${c.old}" → "${c.new}"`)
      .join(', ');
    const actorLabel = getNotificationActorLabel(actor);
    createSystemNotification({
      type: 'edit',
      severity: safeReason.toLowerCase().includes('suspend') ? 'warning' : 'info',
      audience: relatedBatch?.brand ? 'brand_scope' : 'super_admin',
      brandName: relatedBatch?.brand || null,
      title: `Pengeditan Data: ${batchIdStr}`,
      subtitle: `Dilakukan oleh ${actorLabel}${relatedBatch?.brand ? ` · ${relatedBatch.brand}` : ''}`,
      description: safeReason
        ? `${safeReason}${fieldSummary ? ` (${fieldSummary})` : ''}`
        : fieldSummary || 'Pembaruan data batch',
      entityType: 'audit_log',
      entityId: String(safeId),
      status: 'edited',
      dedupeKey: `audit:${batchIdStr}:${safeReason}`,
      dedupeWindowMs: 5_000,
      metadata: {
        user: actorLabel,
        batchId: batchIdStr,
        brand: relatedBatch?.brand || null,
        changes: safeChanges,
      },
    });

    res.json({
      id: safeId,
      batchId: batchIdStr,
      timestamp: safeTimestamp,
      user: actor.name,
      reason: safeReason,
      changes: safeChanges,
    });
  } catch (error) {
    return sendInternalError(res, 'POST /api/audit-logs', error);
  }
});

// Live Dashboard Stats from SQLite (brand-scoped untuk Pengelola Brand)
app.get('/api/dashboard/stats', (req, res) => {
  try {
    const scope = getUserBrandScope(req);
    const allBatches = db.prepare('SELECT * FROM batches ORDER BY rowid DESC').all() as any[];
    const scopedBatches = scope.isGlobal
      ? allBatches
      : allBatches.filter((b) => canScopeAccessBrand(scope, b.brand));

    const allProducts = db.prepare('SELECT id, brandId, brandName FROM products').all() as any[];
    const scopedProducts = scope.isGlobal
      ? allProducts
      : allProducts.filter((p) => canScopeAccessBrand(scope, p.brandName, p.brandId));

    const allBrands = db.prepare('SELECT id, name, status FROM brands').all() as any[];
    const scopedBrands = scope.isGlobal
      ? allBrands
      : allBrands.filter((br) => canScopeAccessBrand(scope, br.name, br.id));

    const allScans = db.prepare('SELECT city, brand, totalScans, todayScans, status FROM scan_points').all() as any[];
    const scopedScans = scope.isGlobal
      ? allScans
      : allScans.filter((s) => canScopeAccessBrand(scope, s.brand));

    const scopedBatchCodeSet = new Set(scopedBatches.map((b) => b.batchId));
    const allLogs = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 200').all() as any[];
    const scopedLogs = scope.isGlobal
      ? allLogs
      : allLogs.filter((l) => scopedBatchCodeSet.has(l.batchId));

    const brandStatsMap = new Map<string, { brand: string; batchCount: number; totalQty: number }>();
    for (const b of scopedBatches) {
      const key = b.brand || 'Lainnya';
      const entry = brandStatsMap.get(key) || { brand: key, batchCount: 0, totalQty: 0 };
      entry.batchCount += 1;
      entry.totalQty += Number(b.qty) || 0;
      brandStatsMap.set(key, entry);
    }

    const recentLogs = scopedLogs.slice(0, 5).map((row) => {
      let changes = [];
      try { changes = JSON.parse(row.changes); } catch (_) {}
      return { ...row, changes };
    });

    const recentBatches = scopedBatches.slice(0, 5).map((row) => ({
      ...row,
      isB2B: Boolean(row.isB2B),
      tags: null
    }));

    res.json({
      totalBatches: scopedBatches.length,
      activeBatches: scopedBatches.filter((b) => b.status !== 'Disuspend').length,
      suspendedBatches: scopedBatches.filter((b) => b.status === 'Disuspend').length,
      totalTags: scopedBatches.reduce((sum, b) => sum + (Number(b.qty) || 0), 0),
      b2bBatches: scopedBatches.filter((b) => Boolean(b.isB2B)).length,
      retailBatches: scopedBatches.filter((b) => !Boolean(b.isB2B)).length,
      totalLogs: scopedLogs.length,
      totalProducts: scopedProducts.length,
      totalBrands: scopedBrands.length,
      activeBrands: scopedBrands.filter((br) => br.status === 'Aktif').length,
      totalScans: scopedScans.reduce((sum, s) => sum + (Number(s.totalScans) || 0), 0),
      todayScans: scopedScans.reduce((sum, s) => sum + (Number(s.todayScans) || 0), 0),
      distinctCities: new Set(scopedScans.map((s) => s.city).filter(Boolean)).size,
      totalScanPoints: scopedScans.length,
      validScans: scopedScans.filter((s) => s.status === 'valid').length,
      brandStats: Array.from(brandStatsMap.values()),
      recentLogs,
      recentBatches,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return sendInternalError(res, 'GET /api/dashboard/stats', error);
  }
});

// ==========================================
// REST API ENDPOINTS: USERS & BRANDS (CRUD)
// ==========================================

// Get all users (terbaru di paling atas, tanpa mengekspos hash kata sandi; disaring sesuai RBAC)
app.get('/api/users', (req, res) => {
  try {
    const authUser = (req as any).authUser || resolveSessionUser(req);
    const matrix = getRbacMatrix();
    const canViewAllUsers = authUser && (
      hasPermission(authUser.role, 'users.view', matrix) ||
      hasPermission(authUser.role, 'users.manage', matrix)
    );
    if (!canViewAllUsers) {
      return res.json(authUser ? [authUser] : []);
    }
    const rows = db.prepare('SELECT id, name, username, email, phone, role, avatar, status, createdAt FROM users ORDER BY rowid DESC').all();
    res.json(rows);
  } catch (error) {
    return sendInternalError(res, 'GET /api/users', error);
  }
});

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// Create user (validasi email unik, sandi min 8 karakter, validasi avatar anti-XSS, anti-eskalasi peran)
app.post('/api/users', (req, res) => {
  try {
    const u = req.body || {};
    const actor = getActorFromRequest(req);
    const isActorSuperAdmin = normalizeRole(actor.role) === 'Super Admin';
    const requestedRole = normalizeRole(u.role || 'Admin Brand');
    if (!isActorSuperAdmin && requestedRole === 'Super Admin') {
      return res.status(403).json({ error: 'Hanya Super Admin yang berwenang membuat akun dengan peran Super Admin.' });
    }

    const cleanEmail = sanitizeStringInput(u.email, 160).toLowerCase();
    const cleanName = sanitizeStringInput(u.name, 120);
    const cleanUsername = u.username ? sanitizeStringInput(u.username, 80).replace(/^@+/, '').toLowerCase() : null;
    const cleanPhone = u.phone ? sanitizeStringInput(u.phone, 40) : null;
    const cleanId = sanitizeStringInput(u.id, 80) || `usr-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

    if (!cleanName) {
      return res.status(400).json({ error: 'Nama lengkap wajib diisi.' });
    }
    if (!cleanEmail || !EMAIL_REGEX.test(cleanEmail)) {
      return res.status(400).json({ error: 'Format email tidak valid. Masukkan format yang benar (contoh: nama@perusahaan.com).' });
    }

    const dupEmail = db.prepare('SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1').get(cleanEmail);
    if (dupEmail) {
      return res.status(409).json({ error: 'Alamat email tersebut sudah terdaftar pada akun lain.' });
    }
    if (cleanUsername) {
      const dupUsername = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1').get(cleanUsername);
      if (dupUsername) {
        return res.status(409).json({ error: 'Username tersebut sudah digunakan akun lain.' });
      }
    }

    const avatarCheck = validateSafeImageSource(u.avatar);
    if (!avatarCheck.valid) {
      return res.status(400).json({ error: avatarCheck.error || 'Format foto profil tidak valid.' });
    }

    let hashedPassword: string | null = null;
    if (u.password && typeof u.password === 'string' && u.password.trim().length > 0) {
      if (u.password.trim().length < 8) {
        return res.status(400).json({ error: 'Kata sandi minimal terdiri dari 8 karakter.' });
      }
      hashedPassword = hashPassword(u.password);
    }

    const now = new Date().toISOString();
    const safeStatus = u.status === 'Nonaktif' ? 'Nonaktif' : 'Aktif';

    db.prepare(`
      INSERT INTO users (id, name, username, email, phone, role, avatar, status, createdAt, password)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      cleanId,
      cleanName,
      cleanUsername,
      cleanEmail,
      cleanPhone,
      normalizeRole(u.role || 'Admin Brand'),
      avatarCheck.value,
      safeStatus,
      u.createdAt ? sanitizeStringInput(u.createdAt, 80) : now,
      hashedPassword
    );
    const created = db.prepare('SELECT id, name, username, email, phone, role, avatar, status, createdAt FROM users WHERE id = ?').get(cleanId);
    res.json(created);
  } catch (error) {
    return sendInternalError(res, 'POST /api/users', error);
  }
});

// Update user (validasi avatar anti-XSS, proteksi last-admin, & cabut sesi saat sandi/status/peran berubah)
app.put('/api/users/:id', (req, res) => {
  try {
    const { id } = req.params;
    const u = req.body || {};
    const actor = getActorFromRequest(req);

    if (actor.id && actor.id === id && u.status === 'Nonaktif') {
      return res.status(400).json({ error: 'Anda tidak dapat menonaktifkan akun Anda sendiri yang sedang aktif login.' });
    }
    if (u.email !== undefined && (typeof u.email !== 'string' || !EMAIL_REGEX.test(u.email.trim()))) {
      return res.status(400).json({ error: 'Format email tidak valid. Masukkan format yang benar (contoh: nama@perusahaan.com).' });
    }
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: 'User tidak ditemukan' });
    }

    const isActorSuperAdmin = normalizeRole(actor.role) === 'Super Admin';
    if (!isActorSuperAdmin && normalizeRole(existing.role) === 'Super Admin') {
      return res.status(403).json({ error: 'Anda tidak memiliki izin untuk mengubah akun Super Admin.' });
    }

    const nextEmail = u.email !== undefined ? sanitizeStringInput(u.email, 160).toLowerCase() : existing.email;
    const nextUsername = u.username !== undefined ? (u.username ? sanitizeStringInput(u.username, 80).replace(/^@+/, '').toLowerCase() : null) : existing.username;
    const nextRole = normalizeRole(u.role !== undefined ? u.role : existing.role);
    const nextStatus = u.status !== undefined ? (u.status === 'Nonaktif' ? 'Nonaktif' : 'Aktif') : (existing.status || 'Aktif');

    if (!isActorSuperAdmin && nextRole === 'Super Admin') {
      return res.status(403).json({ error: 'Hanya Super Admin yang berwenang menetapkan peran Super Admin.' });
    }

    // Cegah penghapusan / penonaktifan Super Admin aktif terakhir
    if (normalizeRole(existing.role) === 'Super Admin' && (nextRole !== 'Super Admin' || nextStatus === 'Nonaktif')) {
      const otherAdmins = db.prepare(
        "SELECT COUNT(*) as count FROM users WHERE id != ? AND role = 'Super Admin' AND (status IS NULL OR status != 'Nonaktif')"
      ).get(id) as { count: number };
      if (!otherAdmins || otherAdmins.count === 0) {
        return res.status(400).json({ error: 'Tidak dapat menonaktifkan atau menurunkan peran Super Admin aktif terakhir di sistem.' });
      }
    }

    if (nextEmail.toLowerCase() !== String(existing.email || '').toLowerCase()) {
      const dupEmail = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id != ? LIMIT 1').get(nextEmail, id);
      if (dupEmail) {
        return res.status(409).json({ error: 'Alamat email tersebut sudah digunakan akun lain.' });
      }
    }
    if (nextUsername && nextUsername.toLowerCase() !== String(existing.username || '').toLowerCase()) {
      const dupUsername = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ? LIMIT 1').get(nextUsername, id);
      if (dupUsername) {
        return res.status(409).json({ error: 'Username tersebut sudah digunakan akun lain.' });
      }
    }

    let nextAvatar = existing.avatar;
    if (u.avatar !== undefined) {
      const avatarCheck = validateSafeImageSource(u.avatar);
      if (!avatarCheck.valid) {
        return res.status(400).json({ error: avatarCheck.error || 'Format foto profil tidak valid.' });
      }
      nextAvatar = avatarCheck.value;
    }

    const hasNewPassword = typeof u.password === 'string' && u.password.trim().length > 0;
    if (hasNewPassword && u.password.trim().length < 8) {
      return res.status(400).json({ error: 'Kata sandi baru minimal terdiri dari 8 karakter.' });
    }

    const updated = {
      name: u.name !== undefined ? sanitizeStringInput(u.name, 120) : existing.name,
      username: nextUsername,
      email: nextEmail,
      phone: u.phone !== undefined ? (u.phone ? sanitizeStringInput(u.phone, 40) : null) : existing.phone,
      role: nextRole,
      avatar: nextAvatar,
      status: nextStatus,
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

    if (hasNewPassword) {
      const hashedPassword = hashPassword(u.password);
      db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, id);
      // Cabut seluruh sesi lama pengguna jika kata sandi diganti (kecuali bila admin mengganti sandi sendiri, tetap cabut sesi lama agar sesi curian mati)
      revokeAllUserSessions(id);
    } else if (nextStatus === 'Nonaktif' || nextRole !== normalizeRole(existing.role)) {
      revokeAllUserSessions(id);
    }

    const result = db.prepare('SELECT id, name, username, email, phone, role, avatar, status, createdAt FROM users WHERE id = ?').get(id);

    // Emit notifikasi pribadi ke pengguna yang akunnya diubah oleh Super Admin (perubahan sandi/peran/status)
    if (actor.id && actor.id !== id && (hasNewPassword || nextRole !== normalizeRole(existing.role) || nextStatus !== (existing.status || 'Aktif'))) {
      const changeParts: string[] = [];
      if (hasNewPassword) changeParts.push('kata sandi diperbarui');
      if (nextRole !== normalizeRole(existing.role)) changeParts.push(`peran diubah menjadi ${nextRole}`);
      if (nextStatus !== (existing.status || 'Aktif')) changeParts.push(`status akun menjadi ${nextStatus}`);

      const actorLabel = getNotificationActorLabel(actor);
      createSystemNotification({
        type: 'system',
        severity: nextStatus === 'Nonaktif' ? 'warning' : 'info',
        audience: 'user',
        targetUserId: id,
        title: hasNewPassword ? 'Kata Sandi Akun Diperbarui' : 'Pembaruan Keamanan Akun Anda',
        subtitle: `Diproses oleh ${actorLabel}`,
        description: `Perubahan akun Anda: ${changeParts.join(', ')}.`,
        entityType: 'user',
        entityId: id,
        status: 'info',
        metadata: { actor: actorLabel, userId: id },
      });
    }

    res.json(result);
  } catch (error) {
    return sendInternalError(res, 'PUT /api/users/:id', error);
  }
});

// Delete user (proteksi last-admin & cabut seluruh sesi aktif)
app.delete('/api/users/:id', (req, res) => {
  try {
    const { id } = req.params;
    const actor = getActorFromRequest(req);
    if (actor.id && actor.id === id) {
      return res.status(400).json({ error: 'Anda tidak dapat menghapus akun Anda sendiri yang sedang aktif login.' });
    }

    const existing = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: 'User tidak ditemukan.' });
    }
    const isActorSuperAdmin = normalizeRole(actor.role) === 'Super Admin';
    if (!isActorSuperAdmin && normalizeRole(existing.role) === 'Super Admin') {
      return res.status(403).json({ error: 'Anda tidak memiliki izin untuk menghapus akun Super Admin.' });
    }
    if (normalizeRole(existing.role) === 'Super Admin') {
      const otherAdmins = db.prepare(
        "SELECT COUNT(*) as count FROM users WHERE id != ? AND role = 'Super Admin' AND (status IS NULL OR status != 'Nonaktif')"
      ).get(id) as { count: number };
      if (!otherAdmins || otherAdmins.count === 0) {
        return res.status(400).json({ error: 'Tidak dapat menghapus Super Admin aktif terakhir di sistem.' });
      }
    }

    revokeAllUserSessions(id);
    db.prepare('DELETE FROM users WHERE id = ?').run(id);

    const fallbackUser = db.prepare('SELECT id FROM users ORDER BY rowid ASC LIMIT 1').get() as { id: string } | undefined;
    if (fallbackUser) {
      db.prepare('UPDATE brands SET ownerId = ? WHERE ownerId = ?').run(fallbackUser.id, id);
    }

    res.json({ success: true });
  } catch (error) {
    return sendInternalError(res, 'DELETE /api/users/:id', error);
  }
});

// Get brands (terbaru di paling atas, terisolasi ke brand sendiri untuk Pengelola Brand)
app.get('/api/brands', (req, res) => {
  try {
    const scope = getUserBrandScope(req);
    const rows = db.prepare(`
      SELECT b.*, u.name AS userOwnerName, u.email AS userOwnerEmail, u.role AS userOwnerRole
      FROM brands b
      LEFT JOIN users u ON u.id = b.ownerId
      ORDER BY b.rowid DESC
    `).all() as any[];
    const scopedRows = scope.isGlobal
      ? rows
      : rows.filter((b) => canScopeAccessBrand(scope, b.name, b.id));

    const syncedBrands = scopedRows.map(({ userOwnerName, userOwnerEmail, userOwnerRole, ...b }) => ({
      ...b,
      ownerName: userOwnerName || 'Belum Ditentukan',
      ownerEmail: userOwnerEmail || null,
      ownerRole: userOwnerRole ? normalizeRole(userOwnerRole) : null,
    }));

    res.json(syncedBrands);
  } catch (error) {
    return sendInternalError(res, 'GET /api/brands', error);
  }
});

// Create brand (validasi logo anti-XSS & sanitasi string)
app.post('/api/brands', (req, res) => {
  try {
    const b = req.body || {};
    const cleanName = sanitizeStringInput(b.name, 120);
    if (!cleanName) {
      return res.status(400).json({ error: 'Nama brand wajib diisi.' });
    }
    const cleanId = sanitizeStringInput(b.id, 80) || `brand-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

    const logoCheck = validateSafeImageSource(b.logo);
    if (!logoCheck.valid) {
      return res.status(400).json({ error: logoCheck.error || 'Format logo brand tidak valid.' });
    }

    let ownerName = 'Belum Ditentukan';
    let ownerEmail: string | null = null;
    let ownerRole: string | null = null;
    const scope = getUserBrandScope(req);
    const requestedOwnerId = b.ownerId && typeof b.ownerId === 'string' && b.ownerId.trim() !== '' ? sanitizeStringInput(b.ownerId, 80) : '';
    const finalOwnerId = scope.isGlobal ? requestedOwnerId : (scope.user?.id || '');

    if (finalOwnerId) {
      const u = db.prepare('SELECT name, email, role FROM users WHERE id = ?').get(finalOwnerId) as any;
      if (u) {
        ownerName = u.name;
        ownerEmail = u.email;
        ownerRole = normalizeRole(u.role);
      }
    }

    const businessType = b.businessType === 'B2B' ? 'B2B' : 'Retail';
    const safeStatus = b.status === 'Nonaktif' ? 'Nonaktif' : 'Aktif';
    const safeDesc = sanitizeStringInput(b.description, 1000);
    const safeCat = sanitizeStringInput(b.category, 120) || 'Umum';
    const safeCreatedAt = sanitizeStringInput(b.createdAt, 80) || new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

    const stmt = db.prepare(`
      INSERT INTO brands (id, name, logo, ownerId, description, category, businessType, status, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      cleanId,
      cleanName,
      logoCheck.value,
      finalOwnerId,
      safeDesc,
      safeCat,
      businessType,
      safeStatus,
      safeCreatedAt
    );

    res.json({
      id: cleanId,
      name: cleanName,
      logo: logoCheck.value,
      ownerId: finalOwnerId,
      ownerName,
      ownerEmail,
      ownerRole,
      description: safeDesc,
      category: safeCat,
      businessType,
      status: safeStatus,
      createdAt: safeCreatedAt,
    });
  } catch (error) {
    return sendInternalError(res, 'POST /api/brands', error);
  }
});

// Update brand (validasi logo anti-XSS & sanitasi string)
app.put('/api/brands/:id', (req, res) => {
  try {
    const { id } = req.params;
    const b = req.body || {};
    const existing = db.prepare('SELECT * FROM brands WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: 'Brand tidak ditemukan' });
    }
    if (!assertBrandAccess(req, res, existing.name, existing.id)) return;

    const scope = getUserBrandScope(req);
    let nextLogo = existing.logo;
    if (b.logo !== undefined) {
      const logoCheck = validateSafeImageSource(b.logo);
      if (!logoCheck.valid) {
        return res.status(400).json({ error: logoCheck.error || 'Format logo brand tidak valid.' });
      }
      nextLogo = logoCheck.value;
    }

    const rawOwnerId = b.ownerId !== undefined ? b.ownerId : existing.ownerId;
    const requestedOwnerId = rawOwnerId && typeof rawOwnerId === 'string' && rawOwnerId.trim() !== '' ? sanitizeStringInput(rawOwnerId, 80) : '';
    if (!scope.isGlobal && b.ownerId !== undefined && requestedOwnerId !== String(existing.ownerId || '')) {
      return res.status(403).json({ error: 'Hanya Super Admin atau pemilik akses lintas brand yang berwenang memindahkan kepemilikan brand.' });
    }
    const targetOwnerId = scope.isGlobal ? requestedOwnerId : String(existing.ownerId || '');
    let ownerName = 'Belum Ditentukan';
    let ownerEmail: string | null = null;
    let ownerRole: string | null = null;

    if (targetOwnerId) {
      const u = db.prepare('SELECT name, email, role FROM users WHERE id = ?').get(targetOwnerId) as any;
      if (u) {
        ownerName = u.name;
        ownerEmail = u.email;
        ownerRole = normalizeRole(u.role);
      }
    }

    const updated = {
      name: b.name !== undefined ? sanitizeStringInput(b.name, 120) : existing.name,
      logo: nextLogo,
      ownerId: targetOwnerId,
      description: b.description !== undefined ? sanitizeStringInput(b.description, 1000) : existing.description,
      category: b.category !== undefined ? sanitizeStringInput(b.category, 120) : existing.category,
      businessType: b.businessType !== undefined ? (b.businessType === 'B2B' ? 'B2B' : 'Retail') : (existing.businessType || 'Retail'),
      status: b.status !== undefined ? (b.status === 'Nonaktif' ? 'Nonaktif' : 'Aktif') : existing.status,
    };

    db.prepare(`
      UPDATE brands 
      SET name = ?, logo = ?, ownerId = ?, description = ?, category = ?, businessType = ?, status = ?
      WHERE id = ?
    `).run(
      updated.name,
      updated.logo,
      updated.ownerId,
      updated.description,
      updated.category,
      updated.businessType,
      updated.status,
      id
    );

    const result = db.prepare('SELECT * FROM brands WHERE id = ?').get(id) as any;
    res.json({ ...result, ownerName, ownerEmail, ownerRole });
  } catch (error) {
    return sendInternalError(res, 'PUT /api/brands/:id', error);
  }
});

// Delete brand (terisolasi brand scope)
app.delete('/api/brands/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT id, name FROM brands WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: 'Brand tidak ditemukan' });
    }
    if (!assertBrandAccess(req, res, existing.name, existing.id)) return;

    db.prepare('DELETE FROM brands WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    return sendInternalError(res, 'DELETE /api/brands/:id', error);
  }
});

// Products / SKUs (brand-scoped untuk Pengelola Brand)
app.get('/api/products', (req, res) => {
  try {
    const scope = getUserBrandScope(req);
    const rows = db.prepare('SELECT * FROM products ORDER BY brandName ASC, sku ASC').all() as any[];
    const scopedRows = scope.isGlobal
      ? rows
      : rows.filter((p) => canScopeAccessBrand(scope, p.brandName, p.brandId));
    const result = scopedRows.map((p) => ({
      ...p,
      skuCode: p.skuCode || `SKU-${p.id.toUpperCase()}`,
      isB2B: Boolean(p.isB2B)
    }));
    res.json(result);
  } catch (error) {
    return sendInternalError(res, 'GET /api/products', error);
  }
});

// Relational Detail of Product by ID or SKU (brand-scoped + LIKE escaping)
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
    if (!assertBrandAccess(req, res, prod.brandName, prod.brandId)) return;

    const brandRow = db.prepare('SELECT id, name, logo, ownerId, category, status, description FROM brands WHERE id = ? OR LOWER(name) = LOWER(?)').get(prod.brandId, prod.brandName) as any || null;
    let user: any = null;
    if (brandRow?.ownerId) {
      user = db.prepare('SELECT id, name, username, email, phone, role, avatar, status FROM users WHERE id = ?').get(brandRow.ownerId);
    }
    const brand = brandRow
      ? {
          ...brandRow,
          ownerName: user?.name || 'Belum Ditentukan',
          ownerEmail: user?.email || null,
          ownerRole: user?.role ? normalizeRole(user.role) : null,
        }
      : null;

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

    const escapedSkuLike = `%${escapeLikePattern(String(prod.sku || '').toLowerCase())}%`;
    const scanRows = db.prepare(`
      SELECT city, province, venue, totalScans, todayScans, status, latestTime, deviceInfo 
      FROM scan_points 
      WHERE (LOWER(brand) = LOWER(?) OR LOWER(brand) = LOWER(?)) 
        AND (LOWER(productType) LIKE ? ESCAPE '\\' OR batchId IN (${batchIds.length ? batchIds.map(() => '?').join(',') : "''"}))
      ORDER BY totalScans DESC
      LIMIT 4
    `).all(prod.brandName, brand?.name || prod.brandName, escapedSkuLike, ...(batchIds.length ? batchIds : [])) as any[];

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
    return sendInternalError(res, 'GET /api/products/:id/relational', error);
  }
});

app.post('/api/products', (req, res) => {
  try {
    const p = req.body || {};
    const cleanBrandName = sanitizeStringInput(p.brandName, 120);
    const cleanBrandId = p.brandId ? sanitizeStringInput(p.brandId, 80) : null;
    const cleanSku = sanitizeStringInput(p.sku, 200);
    if (!cleanBrandName || !cleanSku) {
      return res.status(400).json({ error: 'Nama brand dan nama SKU wajib diisi.' });
    }
    if (!assertBrandAccess(req, res, cleanBrandName, cleanBrandId)) return;

    const imgCheck = validateSafeImageSource(p.image);
    if (!imgCheck.valid) {
      return res.status(400).json({ error: imgCheck.error || 'Format gambar produk tidak valid.' });
    }

    const cleanId = sanitizeStringInput(p.id, 80) || `prod-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const createdAt = sanitizeStringInput(p.createdAt, 80) || new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
    const skuCode = sanitizeStringInput(p.skuCode, 80) || `SKU-${Date.now().toString().slice(-4)}`;
    const cleanCategory = sanitizeStringInput(p.category, 160) || 'Umum';
    const cleanDesc = p.description ? sanitizeStringInput(p.description, 1500) : null;

    db.prepare(`
      INSERT INTO products (id, brandId, brandName, sku, skuCode, category, isB2B, description, createdAt, image)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(cleanId, cleanBrandId, cleanBrandName, cleanSku, skuCode, cleanCategory, p.isB2B ? 1 : 0, cleanDesc, createdAt, imgCheck.value);
    res.json({
      id: cleanId,
      brandId: cleanBrandId,
      brandName: cleanBrandName,
      sku: cleanSku,
      skuCode,
      category: cleanCategory,
      description: cleanDesc,
      createdAt,
      isB2B: Boolean(p.isB2B),
      image: imgCheck.value,
    });
  } catch (error) {
    return sendInternalError(res, 'POST /api/products', error);
  }
});

app.put('/api/products/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: 'Product tidak ditemukan' });
    }
    if (!assertBrandAccess(req, res, existing.brandName, existing.brandId)) return;

    const p = req.body || {};
    const brandId = p.brandId !== undefined ? (p.brandId ? sanitizeStringInput(p.brandId, 80) : null) : existing.brandId;
    const brandName = p.brandName !== undefined ? sanitizeStringInput(p.brandName, 120) : existing.brandName;
    if (!assertBrandAccess(req, res, brandName, brandId)) return;

    let nextImage = existing.image;
    if (p.image !== undefined) {
      const imgCheck = validateSafeImageSource(p.image);
      if (!imgCheck.valid) {
        return res.status(400).json({ error: imgCheck.error || 'Format gambar produk tidak valid.' });
      }
      nextImage = imgCheck.value;
    }

    const sku = p.sku !== undefined ? sanitizeStringInput(p.sku, 200) : existing.sku;
    const skuCode = p.skuCode !== undefined ? sanitizeStringInput(p.skuCode, 80) : (existing.skuCode || `SKU-${id.toUpperCase()}`);
    const category = p.category !== undefined ? sanitizeStringInput(p.category, 160) : existing.category;
    const isB2B = p.isB2B !== undefined ? (p.isB2B ? 1 : 0) : existing.isB2B;
    const description = p.description !== undefined ? (p.description ? sanitizeStringInput(p.description, 1500) : null) : existing.description;

    db.prepare(`
      UPDATE products 
      SET brandId = ?, brandName = ?, sku = ?, skuCode = ?, category = ?, isB2B = ?, description = ?, image = ?
      WHERE id = ?
    `).run(brandId, brandName, sku, skuCode, category, isB2B, description, nextImage, id);

    res.json({
      id,
      brandId,
      brandName,
      sku,
      skuCode,
      category,
      isB2B: Boolean(isB2B),
      description,
      image: nextImage,
      createdAt: existing.createdAt
    });
  } catch (error) {
    return sendInternalError(res, 'PUT /api/products/:id', error);
  }
});

app.delete('/api/products/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT id, brandId, brandName FROM products WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: 'Product tidak ditemukan' });
    }
    if (!assertBrandAccess(req, res, existing.brandName, existing.brandId)) return;

    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    return sendInternalError(res, 'DELETE /api/products/:id', error);
  }
});

// ==========================================
// REST API ENDPOINTS: NOTIFIKASI SISTEM & AKTIVITAS
// ==========================================

// Helper: Parser timestamp fleksibel untuk pengurutan kronologis lintas sumber notifikasi
const ID_MONTH_MAP: Record<string, number> = {
  jan: 0, januari: 0, january: 0,
  feb: 1, februari: 1, february: 1,
  mar: 2, maret: 2, march: 2,
  apr: 3, april: 3,
  mei: 4, may: 4,
  jun: 5, juni: 5, june: 5,
  jul: 6, juli: 6, july: 6,
  agu: 7, agt: 7, agustus: 7, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  okt: 9, oktober: 9, oct: 9, october: 9,
  nov: 10, november: 10,
  des: 11, desember: 11, dec: 11, december: 11,
};

function parseFlexibleTimeMs(input: unknown, nowMs: number): number | null {
  if (typeof input === 'number' && Number.isFinite(input) && input > 1_000_000_000_000) {
    return input;
  }
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  // 1. Format relatif bahasa Indonesia / Inggris
  if (lower === 'baru saja' || lower === 'just now') return nowMs;

  const relMatch = lower.match(/^(\d+)\s*(detik|menit|jam|hari|minggu|bulan)\s*(yang\s*)?lalu$/);
  if (relMatch) {
    const qty = Number(relMatch[1]);
    const unit = relMatch[2];
    const mult =
      unit === 'detik' ? 1_000 :
      unit === 'menit' ? 60_000 :
      unit === 'jam' ? 3_600_000 :
      unit === 'hari' ? 86_400_000 :
      unit === 'minggu' ? 7 * 86_400_000 :
      30 * 86_400_000;
    return nowMs - qty * mult;
  }

  const dayRelMatch = lower.match(/^(hari ini|kemarin)(?:[\s,]+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?)?/);
  if (dayRelMatch) {
    const base = new Date(nowMs);
    if (dayRelMatch[1] === 'kemarin') {
      base.setDate(base.getDate() - 1);
    }
    if (dayRelMatch[2] !== undefined && dayRelMatch[3] !== undefined) {
      base.setHours(Number(dayRelMatch[2]), Number(dayRelMatch[3]), Number(dayRelMatch[4] || 0), 0);
    } else if (dayRelMatch[1] === 'kemarin') {
      base.setHours(12, 0, 0, 0);
    }
    return base.getTime();
  }

  // 2. Format tanggal lokal Indonesia: "05 Nov 2026, 10:45" / "18 Nov 2026 23.25 WIB" / "07 Nov 2026, 14:15:20 WITA"
  const idDateMatch = raw.match(
    /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})(?:[\s,]+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?)?(?:\s*(?:WIB|WITA|WIT))?$/i
  );
  if (idDateMatch) {
    const day = Number(idDateMatch[1]);
    const monthIdx = ID_MONTH_MAP[idDateMatch[2].toLowerCase()];
    const year = Number(idDateMatch[3]);
    if (monthIdx !== undefined && year >= 2000 && day >= 1 && day <= 31) {
      const hh = idDateMatch[4] !== undefined ? Number(idDateMatch[4]) : 0;
      const mm = idDateMatch[5] !== undefined ? Number(idDateMatch[5]) : 0;
      const ss = idDateMatch[6] !== undefined ? Number(idDateMatch[6]) : 0;
      return new Date(year, monthIdx, day, hh, mm, ss, 0).getTime();
    }
  }

  // 3. Format YYYY-MM-DD (tanggal saja)
  const isoDateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateOnly) {
    return new Date(Number(isoDateOnly[1]), Number(isoDateOnly[2]) - 1, Number(isoDateOnly[3]), 0, 0, 0, 0).getTime();
  }

  // 4. ISO datetime standar lainnya
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

// =========================================================================
// CENTRALIZED EVENT-DRIVEN NOTIFICATION ENGINE + REAL-TIME SSE HUB (2-ROLE RBAC)
// =========================================================================

interface NotificationStreamClient {
  id: string;
  res: express.Response;
  userId: string;
  role: string;
  isGlobal: boolean;
  canManageUsers: boolean;
  ownedBrandNames: Set<string>;
  ownedBrandIds: Set<string>;
}

const notificationStreamClients = new Map<string, NotificationStreamClient>();

function formatRelativeTimeId(tsMs: number, nowMs = Date.now()): string {
  if (!Number.isFinite(tsMs) || tsMs <= 0) return 'Baru saja';
  const diffSec = Math.floor((nowMs - tsMs) / 1000);
  if (diffSec < 45) return 'Baru saja';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} mnt lalu`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} jam lalu`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) return 'Kemarin';
  if (diffDay < 7) return `${diffDay} hari lalu`;
  return new Date(tsMs).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function canUserAccessNotificationRow(
  row: any,
  ctx: {
    userId: string;
    isGlobal: boolean;
    canManageUsers: boolean;
    ownedBrandNames: Set<string>;
    ownedBrandIds: Set<string>;
  }
): boolean {
  const audience = String(row.audience || 'brand_scope');
  if (audience === 'super_admin') {
    return ctx.canManageUsers;
  }
  if (audience === 'user') {
    return Boolean(ctx.userId && row.targetUserId && row.targetUserId === ctx.userId);
  }
  if (audience === 'brand_scope') {
    if (ctx.isGlobal) return true;
    if (row.brandId && ctx.ownedBrandIds.has(String(row.brandId).trim())) return true;
    if (row.brandName && ctx.ownedBrandNames.has(String(row.brandName).trim().toLowerCase())) return true;
    return false;
  }
  return true;
}

function formatNotificationRowForClient(row: any, readIds: Set<string>, nowMs = Date.now()) {
  let meta: Record<string, any> = {};
  if (row.metadata) {
    try {
      meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
    } catch (_) {}
  }

  const isReset = row.type === 'password_reset';
  const isActuallyRead =
    readIds.has(row.id) || (isReset && row.status && row.status !== 'Menunggu');
  const createdTs = Number(row.createdAtTs) || nowMs;

  return {
    id: row.id,
    sourceId: row.entityId || row.id,
    category: row.type === 'scan_anomaly' ? 'scan' : row.type,
    type: row.type,
    severity: row.severity || 'info',
    audience: row.audience || 'brand_scope',
    title: row.title,
    subtitle: row.subtitle || '',
    description: row.description || '',
    timestamp: new Date(createdTs).toLocaleString('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }) + ' WIB',
    timeAgo: formatRelativeTimeId(createdTs, nowMs),
    sortTimestamp: createdTs,
    status: row.status || 'info',
    isRead: isActuallyRead,
    brand: row.brandName || meta.brand || undefined,
    user: meta.user || undefined,
    batchId: meta.batchId || undefined,
    changes: meta.changes || undefined,
    deviceInfo: meta.deviceInfo || undefined,
    tagNumber: meta.tagNumber || undefined,
    city: meta.city || undefined,
    venue: meta.venue || undefined,
    anomalyReason: meta.anomalyReason || undefined,
  };
}

function broadcastNotificationSse(eventType: 'created' | 'updated', row: any) {
  if (notificationStreamClients.size === 0) return;
  for (const [clientId, client] of notificationStreamClients.entries()) {
    try {
      if (
        !canUserAccessNotificationRow(row, {
          userId: client.userId,
          isGlobal: client.isGlobal,
          canManageUsers: client.canManageUsers,
          ownedBrandNames: client.ownedBrandNames,
          ownedBrandIds: client.ownedBrandIds,
        })
      ) {
        continue;
      }
      const payload = JSON.stringify({
        event: eventType,
        id: row.id,
        type: row.type,
        severity: row.severity,
        createdAtTs: row.createdAtTs,
      });
      client.res.write(`event: notification\ndata: ${payload}\n\n`);
    } catch (_) {
      notificationStreamClients.delete(clientId);
    }
  }
}

function broadcastReadSyncSse(userId: string) {
  if (!userId || notificationStreamClients.size === 0) return;
  const payload = JSON.stringify({ event: 'read_sync', userId, ts: Date.now() });
  for (const [clientId, client] of notificationStreamClients.entries()) {
    if (client.userId !== userId) continue;
    try {
      client.res.write(`event: read_sync\ndata: ${payload}\n\n`);
    } catch (_) {
      notificationStreamClients.delete(clientId);
    }
  }
}

let lastNotificationPruneTs = 0;
function pruneOldNotificationsIfNeeded() {
  const now = Date.now();
  if (now - lastNotificationPruneTs < 10 * 60_000) return;
  lastNotificationPruneTs = now;
  try {
    const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;
    db.prepare(
      "DELETE FROM notifications WHERE createdAtTs < ? AND NOT (type = 'password_reset' AND status = 'Menunggu')"
    ).run(ninetyDaysAgo);
    db.prepare(`
      DELETE FROM notifications
      WHERE id NOT IN (
        SELECT id FROM notifications ORDER BY createdAtTs DESC LIMIT 500
      )
      AND NOT (type = 'password_reset' AND status = 'Menunggu')
    `).run();
  } catch (_) {}
}

function createSystemNotification(input: {
  id?: string;
  type: 'password_reset' | 'scan_anomaly' | 'scan' | 'edit' | 'system';
  severity?: 'critical' | 'warning' | 'info';
  audience: 'super_admin' | 'brand_scope' | 'user' | 'all';
  targetUserId?: string | null;
  brandName?: string | null;
  brandId?: string | null;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  status?: string;
  metadata?: Record<string, any> | null;
  dedupeKey?: string | null;
  dedupeWindowMs?: number;
  createdAtTs?: number;
}) {
  try {
    const nowTs = input.createdAtTs || Date.now();
    if (input.dedupeKey && (input.dedupeWindowMs ?? 60_000) > 0) {
      const windowStart = nowTs - (input.dedupeWindowMs ?? 60_000);
      const recentDup = db.prepare(
        'SELECT id FROM notifications WHERE dedupeKey = ? AND createdAtTs >= ? LIMIT 1'
      ).get(input.dedupeKey, windowStart) as { id: string } | undefined;
      if (recentDup) {
        return null;
      }
    }

    const id =
      input.id ||
      `ntf-${nowTs}-${crypto.randomBytes(3).toString('hex')}`;
    const row = {
      id,
      type: input.type,
      severity: input.severity || 'info',
      audience: input.audience,
      targetUserId: input.targetUserId || null,
      brandName: input.brandName || null,
      brandId: input.brandId || null,
      title: sanitizeStringInput(input.title, 200),
      subtitle: input.subtitle ? sanitizeStringInput(input.subtitle, 240) : null,
      description: input.description ? sanitizeStringInput(input.description, 500) : null,
      entityType: input.entityType || null,
      entityId: input.entityId || null,
      status: input.status || 'info',
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      dedupeKey: input.dedupeKey || null,
      createdAtTs: nowTs,
    };

    db.prepare(`
      INSERT OR REPLACE INTO notifications (
        id, type, severity, audience, targetUserId, brandName, brandId,
        title, subtitle, description, entityType, entityId, status, metadata, dedupeKey, createdAtTs
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.id,
      row.type,
      row.severity,
      row.audience,
      row.targetUserId,
      row.brandName,
      row.brandId,
      row.title,
      row.subtitle,
      row.description,
      row.entityType,
      row.entityId,
      row.status,
      row.metadata,
      row.dedupeKey,
      row.createdAtTs
    );

    pruneOldNotificationsIfNeeded();
    broadcastNotificationSse('created', row);
    return row;
  } catch (err) {
    console.warn('Gagal menulis notifikasi sistem:', err);
    return null;
  }
}

function updateSystemNotificationByEntity(
  entityType: string,
  entityId: string,
  patch: { status?: string; description?: string; severity?: 'critical' | 'warning' | 'info' }
) {
  try {
    const existing = db.prepare(
      'SELECT * FROM notifications WHERE entityType = ? AND entityId = ? ORDER BY createdAtTs DESC LIMIT 1'
    ).get(entityType, entityId) as any;
    if (!existing) return;

    const nextStatus = patch.status ?? existing.status;
    const nextDesc = patch.description !== undefined ? sanitizeStringInput(patch.description, 500) : existing.description;
    const nextSeverity = patch.severity ?? existing.severity;

    db.prepare(
      'UPDATE notifications SET status = ?, description = ?, severity = ? WHERE id = ?'
    ).run(nextStatus, nextDesc, nextSeverity, existing.id);

    broadcastNotificationSse('updated', {
      ...existing,
      status: nextStatus,
      description: nextDesc,
      severity: nextSeverity,
    });
  } catch (_) {}
}

let hasCheckedNotifBackfill = false;
function ensureNotificationsBackfilled() {
  if (hasCheckedNotifBackfill) return;
  hasCheckedNotifBackfill = true;

  try {
    const flagRow = db.prepare("SELECT value FROM system_settings WHERE key = 'notifications_backfilled_v1'").get() as { value: string } | undefined;
    if (flagRow?.value === '1') return;

    const countRow = db.prepare('SELECT COUNT(*) as count FROM notifications').get() as { count: number };
    if (countRow && countRow.count > 0) {
      db.prepare("INSERT OR REPLACE INTO system_settings (key, value, updatedAt) VALUES ('notifications_backfilled_v1', '1', ?)")
        .run(new Date().toISOString());
      return;
    }

    const nowMs = Date.now();
    const batchBrandRows = db.prepare('SELECT batchId, id, brand FROM batches').all() as Array<{ batchId: string; id: string; brand: string }>;
    const batchBrandMap = new Map<string, string>();
    for (const b of batchBrandRows) {
      if (b.batchId && b.brand) batchBrandMap.set(b.batchId, b.brand);
      if (b.id && b.brand) batchBrandMap.set(b.id, b.brand);
    }

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO notifications (
        id, type, severity, audience, targetUserId, brandName, brandId,
        title, subtitle, description, entityType, entityId, status, metadata, dedupeKey, createdAtTs
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const backfillTx = db.transaction(() => {
      // 1. Backfill password_reset_requests -> audience: 'super_admin'
      const resetRows = db.prepare(`
        SELECT pr.*, u.name AS userName, u.email AS userEmail, u.role AS userRole, u.avatar AS avatar
        FROM password_reset_requests pr
        LEFT JOIN users u ON u.id = pr.userId
      `).all() as any[];
      for (const r of resetRows) {
        const ts =
          parseFlexibleTimeMs(r.createdAtTs, nowMs) ??
          parseFlexibleTimeMs(r.requestedAt, nowMs) ??
          nowMs;
        const rName = r.userName || 'Pengguna';
        const rEmail = r.userEmail || '-';
        const rRole = normalizeRole(r.userRole || 'Admin Brand');
        insertStmt.run(
          `notif-reset-${r.id}`,
          'password_reset',
          r.status === 'Menunggu' ? 'warning' : 'info',
          'super_admin',
          null,
          null,
          null,
          `Permintaan Reset Password: ${rName}`,
          `${rEmail} · ${rRole}`,
          r.actionNote || 'Pengguna mengajukan permohonan pemulihan/reset kata sandi akun',
          'password_reset',
          r.id,
          r.status || 'Menunggu',
          JSON.stringify({
            user: {
              id: r.userId,
              name: rName,
              email: rEmail,
              role: rRole,
              avatar: r.avatar || null,
            },
          }),
          null,
          ts
        );
      }

      // 2. Backfill scan_points -> audience: 'brand_scope'
      const scanRows = db.prepare('SELECT * FROM scan_points').all() as any[];
      for (const s of scanRows) {
        let latestHistoryTime: string | null = null;
        if (s.scanHistory) {
          try {
            const parsedHistory = JSON.parse(s.scanHistory);
            if (Array.isArray(parsedHistory) && parsedHistory[0]?.scannedAt) {
              latestHistoryTime = String(parsedHistory[0].scannedAt);
            }
          } catch (_) {}
        }
        const ts =
          parseFlexibleTimeMs(s.latestTime, nowMs) ??
          parseFlexibleTimeMs(latestHistoryTime, nowMs) ??
          parseFlexibleTimeMs(s.createdAt, nowMs) ??
          nowMs;
        const isSuspicious = s.status === 'suspicious';
        insertStmt.run(
          `notif-scan-${s.id}`,
          isSuspicious ? 'scan_anomaly' : 'scan',
          isSuspicious ? 'critical' : 'info',
          'brand_scope',
          null,
          s.brand || null,
          null,
          isSuspicious ? 'Peringatan Anomali Scan Tag' : 'Aktivitas Scan Tag Berhasil',
          `${s.venue ? s.venue + ' · ' : ''}${s.city}, ${s.province}`,
          `Tag ${s.latestTagId || '-'} dipindai untuk produk ${s.productType || s.brand} (${s.todayScans} scan hari ini)`,
          'scan_point',
          s.id,
          s.status || 'valid',
          JSON.stringify({
            deviceInfo: s.deviceInfo,
            brand: s.brand,
            tagNumber: s.latestTagId,
            city: s.city,
            venue: s.venue,
            anomalyReason: s.anomalyReason,
          }),
          null,
          ts
        );
      }

      // 3. Backfill audit_logs -> brand_scope jika terkait batch, super_admin jika sistem
      const auditRows = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 60').all() as any[];
      for (const a of auditRows) {
        let parsedChanges: any[] = [];
        try { parsedChanges = JSON.parse(a.changes); } catch (_) {}
        const fieldSummary = parsedChanges.map((c: any) => `${c.field}: "${c.old}" → "${c.new}"`).join(', ');
        const parsedLabelTs = parseFlexibleTimeMs(a.timestamp, nowMs);
        const numericId = Number(a.id);
        const ts =
          parsedLabelTs !== null && Number.isFinite(numericId) && Math.abs(numericId - parsedLabelTs) <= 12 * 3_600_000
            ? numericId
            : parsedLabelTs ?? (Number.isFinite(numericId) ? numericId : nowMs);
        const matchedBrand = batchBrandMap.get(a.batchId) || null;
        insertStmt.run(
          `notif-edit-${a.id}`,
          'edit',
          String(a.reason || '').toLowerCase().includes('suspend') ? 'warning' : 'info',
          matchedBrand ? 'brand_scope' : 'super_admin',
          null,
          matchedBrand,
          null,
          `Pengeditan Data: ${a.batchId}`,
          `Dilakukan oleh ${a.user}${matchedBrand ? ` · ${matchedBrand}` : ''}`,
          a.reason ? `${a.reason}${fieldSummary ? ` (${fieldSummary})` : ''}` : fieldSummary || 'Pembaruan data batch',
          'audit_log',
          String(a.id),
          'edited',
          JSON.stringify({
            user: a.user,
            batchId: a.batchId,
            brand: matchedBrand,
            changes: parsedChanges,
          }),
          null,
          ts
        );
      }
    });
    backfillTx();
    db.prepare("INSERT OR REPLACE INTO system_settings (key, value, updatedAt) VALUES ('notifications_backfilled_v1', '1', ?)")
      .run(new Date().toISOString());
  } catch (err) {
    console.warn('Gagal backfill tabel notifications:', err);
  }
}

// Jalankan backfill satu kali saat startup jika tabel notifications masih kosong
ensureNotificationsBackfilled();

// GET /api/notifications/stream - Real-Time Server-Sent Events (SSE) terisolasi sesuai 2 hak akses
app.get('/api/notifications/stream', (req, res) => {
  const authUser = (req as any).authUser || resolveSessionUser(req);
  if (!authUser?.id) {
    return res.status(401).json({ error: 'Sesi login tidak valid.' });
  }

  const scope = getUserBrandScope(req);
  const canManageUsers = hasPermission(authUser.role, 'users.manage', getRbacMatrix());

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const clientId = `${authUser.id}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  notificationStreamClients.set(clientId, {
    id: clientId,
    res,
    userId: authUser.id,
    role: authUser.role,
    isGlobal: scope.isGlobal,
    canManageUsers,
    ownedBrandNames: scope.ownedBrandNames,
    ownedBrandIds: scope.ownedBrandIds,
  });

  res.write(
    `event: connected\ndata: ${JSON.stringify({
      role: authUser.role,
      isGlobal: scope.isGlobal,
      canManageUsers,
    })}\n\n`
  );

  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch (_) {
      clearInterval(heartbeat);
      notificationStreamClients.delete(clientId);
    }
  }, 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    notificationStreamClients.delete(clientId);
  });
});

// GET /api/notifications - Terpusat dari tabel notifications dengan filter 2 hak akses, kategori, & pagination
app.get('/api/notifications', (req, res) => {
  try {
    ensureNotificationsBackfilled();

    const authUser = (req as any).authUser || resolveSessionUser(req);
    const currentUserId = authUser?.id || '';
    const scope = getUserBrandScope(req);
    const matrix = getRbacMatrix();
    const canManageUsers = Boolean(authUser && hasPermission(authUser.role, 'users.manage', matrix));
    const nowMs = Date.now();

    const rawCategory = String(req.query.category || 'all').toLowerCase();
    const category = ['all', 'important', 'reset', 'scan', 'edit'].includes(rawCategory)
      ? rawCategory
      : 'all';
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const readIdsRows = currentUserId
      ? (db.prepare('SELECT notificationId FROM read_notifications WHERE userId = ?').all(currentUserId) as { notificationId: string }[])
      : [];
    const readIds = new Set(readIdsRows.map((r) => r.notificationId));

    const allRows = db.prepare('SELECT * FROM notifications ORDER BY createdAtTs DESC LIMIT 300').all() as any[];
    const accessCtx = {
      userId: currentUserId,
      isGlobal: scope.isGlobal,
      canManageUsers,
      ownedBrandNames: scope.ownedBrandNames,
      ownedBrandIds: scope.ownedBrandIds,
    };

    const accessibleItems = allRows
      .filter((row) => canUserAccessNotificationRow(row, accessCtx))
      .map((row) => formatNotificationRowForClient(row, readIds, nowMs));

    const isImportantItem = (item: any) =>
      item.severity === 'critical' ||
      item.severity === 'warning' ||
      (item.category === 'password_reset' && item.status === 'Menunggu') ||
      (item.category === 'scan' && item.status === 'suspicious');

    const counts = {
      all: accessibleItems.length,
      important: accessibleItems.filter(isImportantItem).length,
      reset: accessibleItems.filter((i) => i.category === 'password_reset').length,
      scan: accessibleItems.filter((i) => i.category === 'scan').length,
      edit: accessibleItems.filter((i) => i.category === 'edit' || i.category === 'system').length,
    };

    const filteredItems = accessibleItems.filter((item) => {
      if (category === 'important') return isImportantItem(item);
      if (category === 'reset') return item.category === 'password_reset';
      if (category === 'scan') return item.category === 'scan';
      if (category === 'edit') return item.category === 'edit' || item.category === 'system';
      return true;
    });

    const pagedItems = filteredItems.slice(offset, offset + limit);
    const unreadCount = accessibleItems.filter((item) => !item.isRead).length;
    const pendingResetCount = accessibleItems.filter(
      (item) => item.category === 'password_reset' && item.status === 'Menunggu'
    ).length;

    const managedBrandRows = !scope.isGlobal && currentUserId
      ? (db.prepare('SELECT name FROM brands WHERE ownerId = ?').all(currentUserId) as { name: string }[])
      : [];

    res.json({
      unreadCount,
      pendingResetCount,
      importantCount: counts.important,
      counts,
      total: filteredItems.length,
      hasMore: offset + limit < filteredItems.length,
      roleScope: {
        role: authUser?.role || 'Admin Brand',
        isGlobal: scope.isGlobal,
        canManageUsers,
        managedBrands: managedBrandRows.map((b) => b.name),
      },
      notifications: pagedItems,
    });
  } catch (error) {
    return sendInternalError(res, 'GET /api/notifications', error);
  }
});

// Mark notification(s) as read (per-user di read_notifications + sinkronisasi SSE antar tab)
app.post('/api/notifications/mark-read', (req, res) => {
  try {
    ensureNotificationsBackfilled();
    const { id, all, ids } = req.body || {};
    const authUser = (req as any).authUser || resolveSessionUser(req);
    if (!authUser?.id) {
      return res.status(401).json({ success: false, error: 'Sesi pengguna tidak valid.' });
    }

    const userId = authUser.id;
    const scope = getUserBrandScope(req);
    const canManageUsers = hasPermission(authUser.role, 'users.manage', getRbacMatrix());
    const readAtIso = new Date().toISOString();
    const insertRead = db.prepare(
      'INSERT OR IGNORE INTO read_notifications (userId, notificationId, readAt) VALUES (?, ?, ?)'
    );

    if (all) {
      const accessCtx = {
        userId,
        isGlobal: scope.isGlobal,
        canManageUsers,
        ownedBrandNames: scope.ownedBrandNames,
        ownedBrandIds: scope.ownedBrandIds,
      };
      const allRows = db.prepare('SELECT id, audience, targetUserId, brandName, brandId FROM notifications').all() as any[];
      const accessibleIds = allRows
        .filter((row) => canUserAccessNotificationRow(row, accessCtx))
        .map((row) => row.id);

      const markAllTx = db.transaction(() => {
        for (const notifId of accessibleIds) {
          insertRead.run(userId, notifId, readAtIso);
        }
      });
      markAllTx();
    } else if (Array.isArray(ids)) {
      const safeIds = ids.slice(0, 500).filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length <= 120);
      const markTx = db.transaction(() => {
        for (const notifId of safeIds) {
          insertRead.run(userId, notifId, readAtIso);
        }
      });
      markTx();
    } else if (typeof id === 'string' && id.length > 0 && id.length <= 120) {
      insertRead.run(userId, id, readAtIso);
    }

    broadcastReadSyncSse(userId);
    res.json({ success: true });
  } catch (error) {
    return sendInternalError(res, 'POST /api/notifications/mark-read', error);
  }
});

// Get password reset requests
app.get('/api/password-resets', (_req, res) => {
  try {
    const rows = db.prepare(`
      SELECT pr.id, pr.userId, u.name AS userName, u.email AS userEmail, u.role AS userRole, u.avatar AS avatar,
             pr.requestedAt, pr.status, pr.actionNote, pr.createdAtTs
      FROM password_reset_requests pr
      LEFT JOIN users u ON u.id = pr.userId
      ORDER BY pr.rowid DESC
    `).all();
    res.json(rows);
  } catch (error) {
    return sendInternalError(res, 'GET /api/password-resets', error);
  }
});

// Create new password reset request (rate-limited + anti-user-enumeration!)
app.post('/api/password-resets', passwordResetRateLimiter, (req, res) => {
  try {
    const { identifier, userEmail, reason } = req.body || {};
    const lookupKey = sanitizeStringInput(identifier || userEmail || '', 160).toLowerCase();
    const usernameLookup = lookupKey.startsWith('@') ? lookupKey.slice(1) : lookupKey;
    if (!lookupKey) {
      return res.status(400).json({ success: false, error: 'Masukkan alamat email atau username akun Anda.' });
    }

    const matchedUser = db.prepare(
      "SELECT id, name, email, role, avatar, status FROM users WHERE LOWER(email) = ? OR (username IS NOT NULL AND username != '' AND LOWER(username) = ?) LIMIT 1"
    ).get(lookupKey, usernameLookup) as any;

    const genericSuccessMessage =
      'Permohonan reset kata sandi telah diterima dan akan segera diproses oleh administrator.';

    if (!matchedUser || (matchedUser.status || 'Aktif') === 'Nonaktif') {
      // Respon seragam untuk mencegah enumerasi akun & kebocoran nama/email pengguna
      return res.json({
        success: true,
        message: genericSuccessMessage,
      });
    }

    const nowTs = Date.now();
    const newId = `pr-${nowTs}-${crypto.randomBytes(2).toString('hex')}`;
    const requestedAt = new Date(nowTs).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) + ' WIB';
    const sanitizedReason =
      sanitizeStringInput(reason, 300) || 'Permohonan lupa kata sandi melalui halaman login';
    db.prepare(`
      INSERT INTO password_reset_requests (id, userId, requestedAt, status, actionNote, createdAtTs)
      VALUES (?, ?, ?, 'Menunggu', ?, ?)
    `).run(
      newId,
      matchedUser.id,
      requestedAt,
      sanitizedReason,
      nowTs
    );

    createSystemNotification({
      id: `notif-reset-${newId}`,
      type: 'password_reset',
      severity: 'warning',
      audience: 'super_admin',
      title: `Permintaan Reset Password: ${matchedUser.name}`,
      subtitle: `${matchedUser.email} · ${normalizeRole(matchedUser.role)}`,
      description: sanitizedReason,
      entityType: 'password_reset',
      entityId: newId,
      status: 'Menunggu',
      createdAtTs: nowTs,
      metadata: {
        user: {
          id: matchedUser.id,
          name: matchedUser.name,
          email: matchedUser.email,
          role: normalizeRole(matchedUser.role),
          avatar: matchedUser.avatar || null,
        },
      },
    });

    return res.json({
      success: true,
      requestedAt,
      message: genericSuccessMessage,
    });
  } catch (error) {
    return sendInternalError(res, 'POST /api/password-resets', error);
  }
});

// Respond to password reset request (Real Password Update + Session Revocation + HTML-escaped Email)
app.post('/api/password-resets/:id/respond', async (req, res) => {
  try {
    const { id } = req.params;
    const { action, actionNote } = req.body || {};
    if (action !== 'approve' && action !== 'reject') {
      return res.status(400).json({ success: false, error: 'Aksi persetujuan tidak valid.' });
    }

    const actor = getActorFromRequest(req);
    const resetReq = db.prepare(`
      SELECT pr.*, u.name AS userName, u.email AS userEmail, u.role AS userRole, u.avatar AS avatar
      FROM password_reset_requests pr
      LEFT JOIN users u ON u.id = pr.userId
      WHERE pr.id = ?
    `).get(id) as any;
    if (!resetReq) {
      return res.status(404).json({ success: false, error: 'Permintaan reset sandi tidak ditemukan.' });
    }

    const targetUserRow = db.prepare(
      'SELECT id, name, username, email, phone, role, avatar, status, createdAt FROM users WHERE id = ? LIMIT 1'
    ).get(resetReq.userId || '') as any;

    const formattedTargetUser = targetUserRow
      ? { ...targetUserRow, role: normalizeRole(targetUserRow.role) }
      : null;

    if (resetReq.status && resetReq.status !== 'Menunggu') {
      return res.status(409).json({
        success: false,
        alreadyProcessed: true,
        status: resetReq.status,
        error: `Permintaan reset sandi ini sudah diproses sebelumnya (${resetReq.status}).`,
        targetUser: formattedTargetUser,
      });
    }

    const originalReason = resetReq.actionNote || 'Permohonan lupa kata sandi melalui halaman login';
    const nowStr = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) + ' WIB';
    const newStatus = action === 'approve' ? 'Disetujui' : 'Ditolak';
    let tempPassword: string | null = null;
    let emailSent = false;
    let note = sanitizeStringInput(actionNote, 500);
    const targetName = resetReq.userName || targetUserRow?.name || 'Pengguna';
    const targetEmail = resetReq.userEmail || targetUserRow?.email || '';

    if (action === 'approve') {
      // Generate sandi sementara acak 12 karakter yang aman secara kriptografis (crypto.randomInt)
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
      let generated = '';
      for (let i = 0; i < 12; i++) {
        generated += alphabet[crypto.randomInt(0, alphabet.length)];
      }
      tempPassword = generated;
      const hashedPwd = hashPassword(tempPassword);

      if (targetUserRow) {
        db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPwd, targetUserRow.id);
        // Cabut seluruh sesi lama akun tersebut segera setelah sandi direset
        revokeAllUserSessions(targetUserRow.id);
      }

      if (targetEmail && targetEmail.includes('@')) {
        const settings = getActiveSystemSettings();
        const emailCfg: NotificationConfig = {
          ...settings.notifications,
          emailRecipients: targetEmail,
        };
        const mailRes = await sendRealAlertChannel(
          'email',
          emailCfg,
          'Kata Sandi Sementara Akun Anda Telah Diterbitkan',
          `Halo ${targetName},\n\nPermintaan reset kata sandi Anda telah disetujui oleh ${getNotificationActorLabel(actor)} pada ${nowStr}.\nKata sandi sementara baru Anda: ${tempPassword}\n\nSegera ubah kata sandi Anda setelah masuk.`,
          `Halo <b>${escapeHtml(targetName)}</b>,\nPermintaan reset kata sandi Anda telah disetujui oleh <b>${escapeHtml(getNotificationActorLabel(actor))}</b> pada ${escapeHtml(nowStr)}.\nKata sandi sementara baru Anda: <code>${escapeHtml(tempPassword)}</code>\nSegera ubah kata sandi setelah masuk.`
        );
        emailSent = mailRes.success;
      }

      if (!note) {
        const actorLabel = getNotificationActorLabel(actor);
        note = emailSent
          ? `Kata sandi akun telah diperbarui dan dikirim ke email ${targetEmail} oleh ${actorLabel} (${nowStr}).`
          : `Kata sandi sementara baru telah diterapkan ke database oleh ${actorLabel} (${nowStr}). Bagikan sandi sementara kepada pengguna karena SMTP server belum aktif.`;
      }
    } else {
      if (!note) {
        note = `Permintaan reset ditolak oleh ${getNotificationActorLabel(actor)} (${nowStr}).`;
      }
    }

    db.prepare(`
      UPDATE password_reset_requests 
      SET status = ?, actionNote = ? 
      WHERE id = ?
    `).run(newStatus, note, id);

    updateSystemNotificationByEntity('password_reset', id, {
      status: newStatus,
      description: note,
      severity: action === 'approve' ? 'info' : 'warning',
    });

    if (targetUserRow?.id) {
      const actorLabel = getNotificationActorLabel(actor);
      createSystemNotification({
        type: 'system',
        severity: action === 'approve' ? 'info' : 'warning',
        audience: 'user',
        targetUserId: targetUserRow.id,
        title: action === 'approve' ? 'Permohonan Reset Kata Sandi Disetujui' : 'Permohonan Reset Kata Sandi Ditolak',
        subtitle: `Diproses oleh ${actorLabel}`,
        description:
          action === 'approve'
            ? `Kata sandi sementara baru untuk akun Anda telah diterbitkan pada ${nowStr}.`
            : note,
        entityType: 'user',
        entityId: targetUserRow.id,
        status: newStatus,
        metadata: { actor: actorLabel, userId: targetUserRow.id, requestId: id },
      });
    }

    if (actor.id) {
      db.prepare('INSERT OR IGNORE INTO read_notifications (userId, notificationId, readAt) VALUES (?, ?, ?)')
        .run(actor.id, `notif-reset-${id}`, new Date().toISOString());
      broadcastReadSyncSse(actor.id);
    }

    try {
      db.prepare(`
        INSERT INTO audit_logs (id, batchId, timestamp, user, reason, changes)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        Date.now(),
        'AUTH-RESET',
        nowStr,
        actor.name,
        `${newStatus} Permintaan Reset Sandi: ${resetReq.userName}`,
        JSON.stringify([
          { field: 'Pengguna', old: resetReq.userEmail, new: newStatus },
          { field: 'Pengiriman Email', old: '-', new: action === 'approve' ? (emailSent ? 'Terkirim' : 'Sandi diperbarui di DB (SMTP belum aktif)') : 'Tidak diperlukan' }
        ])
      );
    } catch (_) {}

    res.json({
      success: true,
      status: newStatus,
      actionNote: note,
      originalReason,
      requestedAt: resetReq.requestedAt,
      emailSent,
      tempPassword,
      targetUser: formattedTargetUser,
    });
  } catch (error) {
    return sendInternalError(res, 'POST /api/password-resets/:id/respond', error);
  }
});

// ==========================================
// REST API ENDPOINTS: KATEGORI PRODUK (3 LEVEL CRUD)
// ==========================================

// Get all categories sorted by level, insertion order
app.get('/api/categories', (_req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM categories ORDER BY level ASC, rowid ASC').all();
    res.json(rows);
  } catch (error) {
    return sendInternalError(res, 'GET /api/categories', error);
  }
});

// Create category
app.post('/api/categories', (req, res) => {
  try {
    const { name, parentId, level } = req.body || {};
    const safeName = sanitizeStringInput(name, 120);
    if (!safeName) {
      return res.status(400).json({ error: 'Nama kategori wajib diisi' });
    }
    const parsedLevel = Math.min(3, Math.max(1, parseInt(level, 10) || 1));
    const newId = `cat-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const createdAt = new Date().toISOString();

    db.prepare(`
      INSERT INTO categories (id, name, parentId, level, createdAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      newId,
      safeName,
      parentId ? sanitizeStringInput(parentId, 120) : null,
      parsedLevel,
      createdAt
    );

    const created = db.prepare('SELECT * FROM categories WHERE id = ?').get(newId);
    res.json(created);
  } catch (error) {
    return sendInternalError(res, 'POST /api/categories', error);
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
    const { name, specSchema } = req.body || {};
    const finalName = name !== undefined ? sanitizeStringInput(name, 120) : existing.name;
    if (!finalName) {
      return res.status(400).json({ error: 'Nama kategori wajib diisi' });
    }
    const finalSchema = specSchema !== undefined 
      ? (typeof specSchema === 'string' ? specSchema.slice(0, 50_000) : JSON.stringify(specSchema).slice(0, 50_000)) 
      : existing.specSchema;

    db.prepare(`
      UPDATE categories 
      SET name = ?, specSchema = ?
      WHERE id = ?
    `).run(finalName, finalSchema, id);

    const updated = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
    res.json(updated);
  } catch (error) {
    return sendInternalError(res, 'PUT /api/categories/:id', error);
  }
});

// Update category spec schema specifically
app.put('/api/categories/:id/specs', (req, res) => {
  try {
    const { id } = req.params;
    const { specSchema } = req.body || {};
    const finalSchema = (typeof specSchema === 'string' ? specSchema : JSON.stringify(specSchema || [])).slice(0, 50_000);
    
    let existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as any;
    
    if (!existing) {
      existing = db.prepare('SELECT * FROM categories WHERE LOWER(name) = LOWER(?)').get(id) as any;
    }

    if (!existing) {
      const safeName = sanitizeStringInput(id, 120) || 'Kategori Baru';
      const newId = id.startsWith('cat-') ? sanitizeStringInput(id, 120) : `cat-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
      db.prepare(`
        INSERT INTO categories (id, name, parentId, level, createdAt, specSchema)
        VALUES (?, ?, NULL, 1, ?, ?)
      `).run(newId, safeName, new Date().toISOString().split('T')[0], finalSchema);
      existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(newId);
      return res.json(existing);
    }

    db.prepare('UPDATE categories SET specSchema = ? WHERE id = ?').run(finalSchema, existing.id);
    const updated = db.prepare('SELECT * FROM categories WHERE id = ?').get(existing.id);
    res.json(updated);
  } catch (error) {
    return sendInternalError(res, 'PUT /api/categories/:id/specs', error);
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
    return sendInternalError(res, 'DELETE /api/categories/:id', error);
  }
});

// ==============================================================
// PENGATURAN SISTEM, BACKUP, ALERT ANOMALI, & KEBIJAKAN TELEMETRI
// ==============================================================

const DEFAULT_SETTINGS = DEFAULT_SYSTEM_SETTINGS;

// GET /api/settings - Mendapatkan pengaturan sistem
app.get('/api/settings', (_req, res) => {
  try {
    const row = db.prepare("SELECT value, updatedAt FROM system_settings WHERE key = 'app_settings'").get() as any;
    if (row && row.value) {
      const parsed = JSON.parse(row.value);
      return res.json({ ...mergeSystemSettings(parsed), updatedAt: row.updatedAt });
    }
    res.json({ ...DEFAULT_SETTINGS, updatedAt: 'Belum pernah diubah' });
  } catch (error) {
    return sendInternalError(res, 'GET /api/settings', error);
  }
});

// PUT /api/settings - Menyimpan perubahan pengaturan sistem (dengan validasi Anti-SSRF)
app.put('/api/settings', (req, res) => {
  try {
    const newSettings = req.body;
    if (!newSettings || typeof newSettings !== 'object') {
      return res.status(400).json({ error: 'Payload pengaturan tidak valid' });
    }

    const merged = mergeSystemSettings(newSettings);

    // Validasi Anti-SSRF untuk URL Gateway/Webhook eksternal
    const gwUrl = (merged.notifications?.whatsappGatewayUrl || '').trim();
    if (gwUrl) {
      const gwCheck = validatePublicWebhookUrl(gwUrl);
      if (!gwCheck.valid) {
        return res.status(400).json({
          error: `URL WhatsApp Gateway ditolak demi keamanan (Anti-SSRF): ${gwCheck.error || 'URL tidak diizinkan.'}`,
        });
      }
      merged.notifications.whatsappGatewayUrl = gwCheck.url;
    }

    const updatedAt = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) + ' WIB';
    const jsonStr = JSON.stringify(merged);

    db.prepare(`
      INSERT INTO system_settings (key, value, updatedAt)
      VALUES ('app_settings', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
    `).run(jsonStr, updatedAt);

    // Catat log audit perubahan pengaturan sistem dengan aktor aktual dari sesi
    const actor = getActorFromRequest(req);
    const logId = Date.now();
    db.prepare(`
      INSERT INTO audit_logs (id, batchId, timestamp, user, reason, changes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      logId,
      'SYSTEM-CONFIG',
      updatedAt,
      actor.name,
      'Pembaruan Kebijakan Keamanan & Pengaturan Sistem',
      JSON.stringify([
        { field: 'Ambang Batas Anomali', old: 'Versi Sebelumnya', new: `${merged.anomalyThreshold.warningMaxScans}x Waspada, ≥${merged.anomalyThreshold.suspiciousMinScans}x Palsu, Cooldown ${merged.anomalyThreshold.cooldownSeconds}s` },
        { field: 'Mode Telemetri GPS', old: 'Versi Sebelumnya', new: `${merged.locationPolicy.mode} (Max ±${merged.locationPolicy.maxAccuracyMeters}m, ID Only: ${merged.locationPolicy.enforceIndonesiaOnly ? 'Ya' : 'Tidak'}, Anti-Mock: ${merged.locationPolicy.detectMockLocation ? 'Ya' : 'Tidak'})` },
        { field: 'Peringatan Notifikasi', old: 'Versi Sebelumnya', new: `Email: ${merged.notifications.emailEnabled ? 'Aktif' : 'Nonaktif'}, Telegram/WA: Dilewati` }
      ])
    );

    res.json({ success: true, settings: { ...merged, updatedAt } });
  } catch (error) {
    return sendInternalError(res, 'PUT /api/settings', error);
  }
});

// POST /api/settings/test-alert - Pengiriman REAL uji coba alert anomali instan (Telegram & WA API dilewati sementara)
app.post('/api/settings/test-alert', heavyOpsRateLimiter, async (req, res) => {
  try {
    const { channel, target, config } = req.body || {};
    if (!['email', 'telegram', 'whatsapp'].includes(channel)) {
      return res.status(400).json({ success: false, error: 'Channel notifikasi tidak valid.' });
    }

    const now = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) + ' WIB';
    if (channel === 'telegram' || channel === 'whatsapp') {
      const label = channel === 'telegram' ? 'Telegram Bot' : 'WhatsApp Gateway';
      return res.status(200).json({
        success: true,
        skipped: true,
        message: `Integrasi API ${label} dilewati sementara sehingga tidak mengirim permintaan ke server eksternal.`,
        timestamp: now,
      });
    }

    const active = getActiveSystemSettings();
    const effectiveNotif: NotificationConfig = {
      ...active.notifications,
      ...(config && typeof config === 'object' ? config : {}),
    };
    if (target) {
      effectiveNotif.emailRecipients = sanitizeStringInput(target, 320);
    }

    const channelName = 'Email Security';
    const subject = '[UJI COBA] Peringatan Keamanan Sistem Telemetri';
    const plainText = `Uji coba pengiriman peringatan keamanan berhasil terhubung.\nChannel: ${channelName}\nWaktu: ${now}`;
    const htmlBody = `<b>[UJI COBA] Peringatan Keamanan</b>\nChannel: ${escapeHtml(channelName)}\nWaktu: ${escapeHtml(now)}\nStatus: Koneksi peringatan instan aktif dan siap menerima laporan anomali.`;

    const result = await sendRealAlertChannel('email', effectiveNotif, subject, plainText, htmlBody);

    db.prepare(`
      INSERT INTO audit_logs (id, batchId, timestamp, user, reason, changes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      Date.now(),
      'ALERT-TEST',
      now,
      'System Alert Engine',
      `Uji Coba Pengiriman Notifikasi Anomali (${channelName})`,
      JSON.stringify([
        { field: 'Channel', old: '-', new: channelName },
        { field: 'Tujuan', old: '-', new: result.target || '-' },
        { field: 'Status Uji Coba', old: 'Menunggu', new: result.success ? `Terkirim (${result.detail})` : `Gagal (${result.detail})` }
      ])
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.detail,
        timestamp: now,
      });
    }

    res.json({
      success: true,
      message: result.detail,
      timestamp: now,
    });
  } catch (error) {
    return sendInternalError(res, 'POST /api/settings/test-alert', error);
  }
});

// Helper escape nilai SQL aman untuk MySQL / MariaDB (phpMyAdmin / Niagahoster)
function escapeMySqlValue(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : 'NULL';
  if (typeof val === 'boolean') return val ? '1' : '0';
  const str = String(val)
    .replace(/\\/g, '\\\\')
    .replace(/\0/g, '\\0')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\x1a/g, '\\Z')
    .replace(/'/g, "\\'");
  return `'${str}'`;
}

function buildMySqlInsertBlocks(tableName: string, columns: string[], rows: any[], chunkSize = 100): string {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const colList = columns.map((c) => `\`${c}\``).join(', ');
  const blocks: string[] = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const values = chunk
      .map((row) => `(${columns.map((c) => escapeMySqlValue(row[c])).join(', ')})`)
      .join(',\n');
    blocks.push(`INSERT INTO \`${tableName}\` (${colList}) VALUES\n${values};`);
  }
  return blocks.join('\n\n') + '\n';
}

function generateMySqlDump(tables: {
  batches: any[];
  tags: any[];
  scanPoints: any[];
  scanActivities: any[];
  auditLogs: any[];
  users: any[];
  brands: any[];
  products: any[];
  passwordResetRequests: any[];
  readNotifications: any[];
  categories: any[];
  systemSettings: any[];
}, backupDate: string): string {
  const sections: string[] = [
    `-- ==============================================================`,
    `-- SUMAS DATABASE BACKUP (MySQL / MariaDB - phpMyAdmin Ready)`,
    `-- Kompatibel dengan hPanel Niagahoster (MySQL 5.7+ / MariaDB 10.3+)`,
    `-- Dibuat pada: ${backupDate}`,
    `-- ==============================================================`,
    ``,
    `SET NAMES utf8mb4;`,
    `SET TIME_ZONE = '+07:00';`,
    `SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';`,
    `SET FOREIGN_KEY_CHECKS = 0;`,
    ``,
    `DROP TABLE IF EXISTS \`tags\`;`,
    `DROP TABLE IF EXISTS \`batches\`;`,
    `DROP TABLE IF EXISTS \`scan_points\`;`,
    `DROP TABLE IF EXISTS \`scan_activities\`;`,
    `DROP TABLE IF EXISTS \`audit_logs\`;`,
    `DROP TABLE IF EXISTS \`users\`;`,
    `DROP TABLE IF EXISTS \`brands\`;`,
    `DROP TABLE IF EXISTS \`products\`;`,
    `DROP TABLE IF EXISTS \`password_reset_requests\`;`,
    `DROP TABLE IF EXISTS \`read_notifications\`;`,
    `DROP TABLE IF EXISTS \`categories\`;`,
    `DROP TABLE IF EXISTS \`system_settings\`;`,
    ``,
    `CREATE TABLE \`batches\` (`,
    `  \`id\` VARCHAR(191) NOT NULL,`,
    `  \`batchId\` VARCHAR(191) NOT NULL,`,
    `  \`date\` VARCHAR(191) NOT NULL,`,
    `  \`project\` VARCHAR(255) DEFAULT NULL,`,
    `  \`sku\` VARCHAR(255) NOT NULL,`,
    `  \`brand\` VARCHAR(191) NOT NULL,`,
    `  \`qty\` INT NOT NULL DEFAULT 0,`,
    `  \`specs\` LONGTEXT DEFAULT NULL,`,
    `  \`pinLength\` INT NOT NULL DEFAULT 8,`,
    `  \`status\` VARCHAR(64) NOT NULL DEFAULT 'Aktif',`,
    `  \`isB2B\` TINYINT(1) NOT NULL DEFAULT 0,`,
    `  \`redirectUrl\` TEXT DEFAULT NULL,`,
    `  \`qrType\` VARCHAR(32) DEFAULT 'dynamic',`,
    `  \`requirePin\` TINYINT(1) DEFAULT 1,`,
    `  \`enableGps\` TINYINT(1) DEFAULT 1,`,
    `  PRIMARY KEY (\`id\`),`,
    `  KEY \`idx_batches_batchId\` (\`batchId\`),`,
    `  KEY \`idx_batches_brand\` (\`brand\`)`,
    `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    ``,
    buildMySqlInsertBlocks(
      'batches',
      ['id', 'batchId', 'date', 'project', 'sku', 'brand', 'qty', 'specs', 'pinLength', 'status', 'isB2B', 'redirectUrl', 'qrType', 'requirePin', 'enableGps'],
      tables.batches
    ),
    `CREATE TABLE \`tags\` (`,
    `  \`id\` VARCHAR(191) NOT NULL,`,
    `  \`batchId\` VARCHAR(191) NOT NULL,`,
    `  \`tagNumber\` VARCHAR(191) NOT NULL,`,
    `  \`pin\` VARCHAR(64) NOT NULL,`,
    `  \`status\` VARCHAR(64) NOT NULL DEFAULT 'Tersedia',`,
    `  \`project\` VARCHAR(255) DEFAULT NULL,`,
    `  \`specs\` TEXT DEFAULT NULL,`,
    `  \`codeType\` VARCHAR(191) DEFAULT NULL,`,
    `  \`warranty\` VARCHAR(191) DEFAULT NULL,`,
    `  \`prodCode\` VARCHAR(191) DEFAULT NULL,`,
    `  \`note\` TEXT DEFAULT NULL,`,
    `  \`allocatedAt\` VARCHAR(191) DEFAULT NULL,`,
    `  PRIMARY KEY (\`id\`),`,
    `  KEY \`idx_tags_batchId\` (\`batchId\`),`,
    `  KEY \`idx_tags_status\` (\`status\`),`,
    `  KEY \`idx_tags_tagNumber\` (\`tagNumber\`),`,
    `  KEY \`idx_tags_pin\` (\`pin\`)`,
    `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    ``,
    buildMySqlInsertBlocks(
      'tags',
      ['id', 'batchId', 'tagNumber', 'pin', 'status', 'project', 'specs', 'codeType', 'warranty', 'prodCode', 'note', 'allocatedAt'],
      tables.tags
    ),
    `CREATE TABLE \`scan_points\` (`,
    `  \`id\` VARCHAR(191) NOT NULL,`,
    `  \`city\` VARCHAR(191) NOT NULL,`,
    `  \`province\` VARCHAR(191) NOT NULL,`,
    `  \`venue\` VARCHAR(255) DEFAULT NULL,`,
    `  \`lat\` DOUBLE NOT NULL,`,
    `  \`lng\` DOUBLE NOT NULL,`,
    `  \`totalScans\` INT NOT NULL DEFAULT 0,`,
    `  \`todayScans\` INT NOT NULL DEFAULT 0,`,
    `  \`brand\` VARCHAR(191) NOT NULL,`,
    `  \`productType\` VARCHAR(255) DEFAULT NULL,`,
    `  \`batchId\` VARCHAR(191) DEFAULT NULL,`,
    `  \`latestTagId\` VARCHAR(191) DEFAULT NULL,`,
    `  \`pin\` VARCHAR(64) DEFAULT NULL,`,
    `  \`latestTime\` VARCHAR(191) DEFAULT NULL,`,
    `  \`isB2B\` TINYINT(1) DEFAULT 0,`,
    `  \`status\` VARCHAR(64) DEFAULT 'valid',`,
    `  \`anomalyReason\` TEXT DEFAULT NULL,`,
    `  \`deviceInfo\` VARCHAR(255) DEFAULT NULL,`,
    `  \`scanHistory\` LONGTEXT DEFAULT NULL,`,
    `  \`createdAt\` VARCHAR(191) DEFAULT NULL,`,
    `  PRIMARY KEY (\`id\`),`,
    `  KEY \`idx_scan_points_status\` (\`status\`),`,
    `  KEY \`idx_scan_points_brand\` (\`brand\`),`,
    `  KEY \`idx_scan_points_tagId\` (\`latestTagId\`)`,
    `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    ``,
    buildMySqlInsertBlocks(
      'scan_points',
      ['id', 'city', 'province', 'venue', 'lat', 'lng', 'totalScans', 'todayScans', 'brand', 'productType', 'batchId', 'latestTagId', 'pin', 'latestTime', 'isB2B', 'status', 'anomalyReason', 'deviceInfo', 'scanHistory', 'createdAt'],
      tables.scanPoints
    ),
    `CREATE TABLE \`scan_activities\` (`,
    `  \`id\` INT NOT NULL AUTO_INCREMENT,`,
    `  \`rangeType\` VARCHAR(32) NOT NULL,`,
    `  \`label\` VARCHAR(191) NOT NULL,`,
    `  \`fullDate\` VARCHAR(191) NOT NULL,`,
    `  \`scans\` INT NOT NULL DEFAULT 0,`,
    `  \`valid\` INT NOT NULL DEFAULT 0,`,
    `  \`topBrand\` VARCHAR(191) NOT NULL,`,
    `  \`sortOrder\` INT NOT NULL DEFAULT 0,`,
    `  PRIMARY KEY (\`id\`),`,
    `  KEY \`idx_scan_activities_range\` (\`rangeType\`, \`sortOrder\`)`,
    `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    ``,
    buildMySqlInsertBlocks(
      'scan_activities',
      ['id', 'rangeType', 'label', 'fullDate', 'scans', 'valid', 'topBrand', 'sortOrder'],
      tables.scanActivities
    ),
    `CREATE TABLE \`audit_logs\` (`,
    `  \`id\` BIGINT NOT NULL,`,
    `  \`batchId\` VARCHAR(191) NOT NULL,`,
    `  \`timestamp\` VARCHAR(191) NOT NULL,`,
    `  \`user\` VARCHAR(191) NOT NULL,`,
    `  \`reason\` TEXT NOT NULL,`,
    `  \`changes\` LONGTEXT NOT NULL,`,
    `  PRIMARY KEY (\`id\`),`,
    `  KEY \`idx_audit_logs_batchId\` (\`batchId\`)`,
    `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    ``,
    buildMySqlInsertBlocks(
      'audit_logs',
      ['id', 'batchId', 'timestamp', 'user', 'reason', 'changes'],
      tables.auditLogs
    ),
    `CREATE TABLE \`users\` (`,
    `  \`id\` VARCHAR(191) NOT NULL,`,
    `  \`name\` VARCHAR(191) NOT NULL,`,
    `  \`username\` VARCHAR(191) DEFAULT NULL,`,
    `  \`email\` VARCHAR(191) NOT NULL,`,
    `  \`phone\` VARCHAR(64) DEFAULT NULL,`,
    `  \`role\` VARCHAR(64) NOT NULL,`,
    `  \`avatar\` LONGTEXT DEFAULT NULL,`,
    `  \`status\` VARCHAR(64) DEFAULT 'Aktif',`,
    `  \`createdAt\` VARCHAR(191) DEFAULT NULL,`,
    `  \`password\` TEXT DEFAULT NULL,`,
    `  PRIMARY KEY (\`id\`),`,
    `  KEY \`idx_users_email\` (\`email\`)`,
    `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    ``,
    buildMySqlInsertBlocks(
      'users',
      ['id', 'name', 'username', 'email', 'phone', 'role', 'avatar', 'status', 'createdAt', 'password'],
      tables.users
    ),
    `CREATE TABLE \`brands\` (`,
    `  \`id\` VARCHAR(191) NOT NULL,`,
    `  \`name\` VARCHAR(191) NOT NULL,`,
    `  \`logo\` LONGTEXT DEFAULT NULL,`,
    `  \`ownerId\` VARCHAR(191) NOT NULL,`,
    `  \`description\` TEXT DEFAULT NULL,`,
    `  \`category\` VARCHAR(191) DEFAULT NULL,`,
    `  \`businessType\` VARCHAR(64) DEFAULT 'Retail',`,
    `  \`status\` VARCHAR(64) NOT NULL DEFAULT 'Aktif',`,
    `  \`createdAt\` VARCHAR(191) NOT NULL,`,
    `  PRIMARY KEY (\`id\`),`,
    `  KEY \`idx_brands_ownerId\` (\`ownerId\`)`,
    `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    ``,
    buildMySqlInsertBlocks(
      'brands',
      ['id', 'name', 'logo', 'ownerId', 'description', 'category', 'businessType', 'status', 'createdAt'],
      tables.brands
    ),
    `CREATE TABLE \`products\` (`,
    `  \`id\` VARCHAR(191) NOT NULL,`,
    `  \`brandId\` VARCHAR(191) DEFAULT NULL,`,
    `  \`brandName\` VARCHAR(191) NOT NULL,`,
    `  \`sku\` VARCHAR(255) NOT NULL,`,
    `  \`category\` VARCHAR(255) DEFAULT NULL,`,
    `  \`isB2B\` TINYINT(1) DEFAULT 0,`,
    `  \`description\` TEXT DEFAULT NULL,`,
    `  \`createdAt\` VARCHAR(191) DEFAULT NULL,`,
    `  \`skuCode\` VARCHAR(191) DEFAULT NULL,`,
    `  \`image\` LONGTEXT DEFAULT NULL,`,
    `  PRIMARY KEY (\`id\`)`,
    `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    ``,
    buildMySqlInsertBlocks(
      'products',
      ['id', 'brandId', 'brandName', 'sku', 'category', 'isB2B', 'description', 'createdAt', 'skuCode', 'image'],
      tables.products
    ),
    `CREATE TABLE \`password_reset_requests\` (`,
    `  \`id\` VARCHAR(191) NOT NULL,`,
    `  \`userId\` VARCHAR(191) DEFAULT NULL,`,
    `  \`requestedAt\` VARCHAR(191) NOT NULL,`,
    `  \`status\` VARCHAR(64) NOT NULL DEFAULT 'Menunggu',`,
    `  \`actionNote\` TEXT DEFAULT NULL,`,
    `  \`createdAtTs\` BIGINT DEFAULT NULL,`,
    `  PRIMARY KEY (\`id\`)`,
    `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    ``,
    buildMySqlInsertBlocks(
      'password_reset_requests',
      ['id', 'userId', 'requestedAt', 'status', 'actionNote', 'createdAtTs'],
      tables.passwordResetRequests
    ),
    `CREATE TABLE \`read_notifications\` (`,
    `  \`userId\` VARCHAR(191) NOT NULL,`,
    `  \`notificationId\` VARCHAR(191) NOT NULL,`,
    `  \`readAt\` VARCHAR(191) NOT NULL,`,
    `  PRIMARY KEY (\`userId\`, \`notificationId\`),`,
    `  KEY \`idx_read_notifications_user\` (\`userId\`)`,
    `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    ``,
    buildMySqlInsertBlocks('read_notifications', ['userId', 'notificationId', 'readAt'], tables.readNotifications),
    `CREATE TABLE \`categories\` (`,
    `  \`id\` VARCHAR(191) NOT NULL,`,
    `  \`name\` VARCHAR(191) NOT NULL,`,
    `  \`parentId\` VARCHAR(191) DEFAULT NULL,`,
    `  \`level\` INT NOT NULL,`,
    `  \`createdAt\` VARCHAR(191) NOT NULL,`,
    `  \`specSchema\` LONGTEXT DEFAULT NULL,`,
    `  PRIMARY KEY (\`id\`),`,
    `  KEY \`idx_categories_parent\` (\`parentId\`),`,
    `  KEY \`idx_categories_level\` (\`level\`)`,
    `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    ``,
    buildMySqlInsertBlocks(
      'categories',
      ['id', 'name', 'parentId', 'level', 'createdAt', 'specSchema'],
      tables.categories
    ),
    `CREATE TABLE \`system_settings\` (`,
    `  \`key\` VARCHAR(191) NOT NULL,`,
    `  \`value\` LONGTEXT NOT NULL,`,
    `  \`updatedAt\` VARCHAR(191) NOT NULL,`,
    `  PRIMARY KEY (\`key\`)`,
    `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    ``,
    buildMySqlInsertBlocks('system_settings', ['key', 'value', 'updatedAt'], tables.systemSettings),
    `SET FOREIGN_KEY_CHECKS = 1;`,
    ``
  ];

  return sections.join('\n');
}

function updateLastBackupTimestamp(backupDate: string) {
  try {
    const settingsRow = db.prepare("SELECT value FROM system_settings WHERE key = 'app_settings'").get() as any;
    const current = settingsRow?.value ? JSON.parse(settingsRow.value) : structuredClone(DEFAULT_SETTINGS);
    current.backupInfo = { ...DEFAULT_SETTINGS.backupInfo, ...(current.backupInfo || {}), lastBackupDate: backupDate };
    db.prepare(`
      INSERT INTO system_settings (key, value, updatedAt)
      VALUES ('app_settings', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
    `).run(JSON.stringify(current), backupDate);
  } catch (_) {}
}

// GET /api/settings/backup - Unduh arsip cadangan (?format=mysql | sqlite | json)
app.get('/api/settings/backup', heavyOpsRateLimiter, async (req, res) => {
  try {
    const format = String(req.query.format || 'json').toLowerCase();
    const backupDate = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) + ' WIB';
    const timestampIso = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    updateLastBackupTimestamp(backupDate);

    // 1. FORMAT SQLITE BINARY SNAPSHOT (.sqlite) - Aman untuk WAL Mode & bersih dari rahasia/sesi
    if (format === 'sqlite' || format === 'db') {
      const tempFile = path.join(os.tmpdir(), `sumas-backup-${Date.now()}-${crypto.randomBytes(8).toString('hex')}.sqlite`);
      try {
        await db.backup(tempFile);
        // Bersihkan tabel sensitif (server_secrets & user_sessions) dari snapshot sebelum diunduh
        const snapDb = new Database(tempFile);
        try {
          snapDb.exec('DROP TABLE IF EXISTS server_secrets; DROP TABLE IF EXISTS user_sessions;');
        } finally {
          snapDb.close();
        }
        const buffer = await fs.promises.readFile(tempFile);
        res.setHeader('Content-Type', 'application/vnd.sqlite3');
        res.setHeader('Content-Disposition', `attachment; filename="sumas-backup-${timestampIso}.sqlite"`);
        res.setHeader('X-Backup-Date', encodeURIComponent(backupDate));
        res.send(buffer);
      } finally {
        fs.promises.unlink(tempFile).catch(() => {});
      }
      return;
    }

    // Ambil seluruh 12 tabel aplikasi (tidak pernah menyertakan server_secrets / user_sessions)
    const batches = db.prepare('SELECT * FROM batches').all();
    const tags = db.prepare('SELECT * FROM tags').all();
    const scanPoints = db.prepare('SELECT * FROM scan_points').all();
    const scanActivities = db.prepare('SELECT * FROM scan_activities').all();
    const categories = db.prepare('SELECT * FROM categories').all();
    const brands = db.prepare('SELECT * FROM brands').all();
    const products = db.prepare('SELECT * FROM products').all();
    const passwordResetRequests = db.prepare('SELECT * FROM password_reset_requests').all();
    const readNotifications = db.prepare('SELECT * FROM read_notifications').all();
    const auditLogs = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC').all();
    const systemSettings = db.prepare('SELECT * FROM system_settings').all();
    const settingsRow = db.prepare("SELECT value, updatedAt FROM system_settings WHERE key = 'app_settings'").get() as any;

    // 2. FORMAT SQL DUMP MYSQL / PHPMYADMIN (.sql) - Siap impor langsung ke hPanel Niagahoster
    if (format === 'mysql' || format === 'sql') {
      const usersFull = db.prepare('SELECT * FROM users').all();
      const sqlContent = generateMySqlDump(
        {
          batches,
          tags,
          scanPoints,
          scanActivities,
          auditLogs,
          users: usersFull,
          brands,
          products,
          passwordResetRequests,
          readNotifications,
          categories,
          systemSettings
        },
        backupDate
      );

      res.setHeader('Content-Type', 'application/sql; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="sumas-backup-mysql-${timestampIso}.sql"`);
      res.setHeader('X-Backup-Date', encodeURIComponent(backupDate));
      res.send(sqlContent);
      return;
    }

    // 3. FORMAT JSON FULL APP BACKUP (.json) - Untuk Restore 1-Klik di Dashboard
    const usersSafe = db.prepare('SELECT id, name, username, email, phone, role, avatar, status, createdAt FROM users').all();

    const payload = {
      system: 'Sumas Anti-Counterfeiting Platform',
      version: '2.6.0-Enterprise',
      backupGeneratedAt: backupDate,
      summary: {
        totalBatches: batches.length,
        totalTags: tags.length,
        totalScanPoints: scanPoints.length,
        totalScanActivities: scanActivities.length,
        totalCategories: categories.length,
        totalBrands: brands.length,
        totalProducts: products.length,
        totalUsers: usersSafe.length,
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
        users: usersSafe,
        auditLogs,
        passwordResetRequests,
        readNotifications,
        settings: settingsRow?.value ? JSON.parse(settingsRow.value) : DEFAULT_SETTINGS
      }
    };

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="sumas-backup-${timestampIso}.json"`);
    res.setHeader('X-Backup-Date', encodeURIComponent(backupDate));
    res.send(JSON.stringify(payload, null, 2));
  } catch (error) {
    return sendInternalError(res, 'GET /api/settings/backup', error);
  }
});

// POST /api/settings/restore - Pulihkan seluruh tabel database dari berkas cadangan JSON (dibatasi & tervalidasi)
app.post('/api/settings/restore', heavyOpsRateLimiter, (req, res) => {
  try {
    const backup = req.body;
    if (!backup || !backup.data || !backup.system) {
      return res.status(400).json({ error: 'Format berkas cadangan tidak valid atau rusak.' });
    }

    const {
      batches,
      tags,
      scanPoints,
      scanActivities,
      categories,
      brands,
      products,
      users,
      auditLogs,
      passwordResetRequests,
      readNotifications,
      settings
    } = backup.data;

    const restoredStats = {
      batches: 0,
      tags: 0,
      scanPoints: 0,
      scanActivities: 0,
      categories: 0,
      brands: 0,
      products: 0,
      users: 0,
      auditLogs: 0
    };

    const restoreTx = db.transaction(() => {
      if (Array.isArray(batches)) {
        if (batches.length > 5_000) throw new Error('BATCH_LIMIT_EXCEEDED');
        db.prepare('DELETE FROM batches').run();
        const insertBatch = db.prepare(`
          INSERT INTO batches (id, batchId, date, project, sku, brand, qty, specs, pinLength, status, isB2B, redirectUrl, qrType, requirePin, enableGps)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const b of batches) {
          const urlCheck = validateHttpUrl(b.redirectUrl);
          const safeRedirectUrl = urlCheck.valid ? urlCheck.url : 'https://cek.sumas.id/';
          insertBatch.run(
            sanitizeStringInput(b.id, 120),
            sanitizeStringInput(b.batchId, 120),
            sanitizeStringInput(b.date, 80),
            b.project ? sanitizeStringInput(b.project, 180) : null,
            sanitizeStringInput(b.sku, 200),
            sanitizeStringInput(b.brand, 120),
            Math.max(0, Math.min(25_000, Number(b.qty) || 0)),
            b.specs ?? null,
            Math.max(4, Math.min(16, Number(b.pinLength) || 8)),
            sanitizeStringInput(b.status, 40) || 'Aktif',
            b.isB2B ? 1 : 0,
            safeRedirectUrl,
            b.qrType === 'static' ? 'static' : 'dynamic',
            b.requirePin === 0 || b.requirePin === false ? 0 : 1,
            b.enableGps === 0 || b.enableGps === false ? 0 : 1
          );
          restoredStats.batches++;
        }
      }

      if (Array.isArray(tags)) {
        db.prepare('DELETE FROM tags').run();
        const insertTag = db.prepare(`
          INSERT INTO tags (id, batchId, tagNumber, pin, status, project, specs, codeType, warranty, prodCode, note, allocatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const t of tags) {
          insertTag.run(
            t.id,
            t.batchId,
            t.tagNumber,
            t.pin,
            t.status || 'Tersedia',
            t.project ?? null,
            t.specs ?? null,
            t.codeType ?? null,
            t.warranty ?? null,
            t.prodCode ?? null,
            t.note ?? null,
            t.allocatedAt ?? null
          );
          restoredStats.tags++;
        }
      }

      if (Array.isArray(scanPoints)) {
        db.prepare('DELETE FROM scan_points').run();
        const insertScan = db.prepare(`
          INSERT INTO scan_points (id, city, province, venue, lat, lng, totalScans, todayScans, brand, productType, batchId, latestTagId, pin, latestTime, isB2B, status, anomalyReason, deviceInfo, scanHistory, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const s of scanPoints) {
          const historyStr = s.scanHistory
            ? (typeof s.scanHistory === 'string' ? s.scanHistory : JSON.stringify(s.scanHistory))
            : null;
          insertScan.run(
            s.id,
            s.city || '',
            s.province || '',
            s.venue ?? null,
            Number(s.lat) || 0,
            Number(s.lng) || 0,
            Number(s.totalScans) || 0,
            Number(s.todayScans) || 0,
            s.brand || '',
            s.productType ?? null,
            s.batchId ?? null,
            s.latestTagId ?? null,
            s.pin ?? null,
            s.latestTime ?? null,
            s.isB2B ? 1 : 0,
            s.status || 'valid',
            s.anomalyReason ?? null,
            s.deviceInfo ?? null,
            historyStr,
            s.createdAt ?? null
          );
          restoredStats.scanPoints++;
        }
      }

      if (Array.isArray(scanActivities)) {
        db.prepare('DELETE FROM scan_activities').run();
        const insertActivity = db.prepare(`
          INSERT INTO scan_activities (rangeType, label, fullDate, scans, valid, topBrand, sortOrder)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const a of scanActivities) {
          insertActivity.run(
            a.rangeType || '7d',
            a.label || '',
            a.fullDate || '',
            Number(a.scans) || 0,
            Number(a.valid) || 0,
            a.topBrand || '',
            Number(a.sortOrder) || 0
          );
          restoredStats.scanActivities++;
        }
      }

      if (Array.isArray(categories)) {
        db.prepare('DELETE FROM categories').run();
        const insertCat = db.prepare(`
          INSERT INTO categories (id, name, parentId, level, createdAt, specSchema)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const c of categories) {
          insertCat.run(
            c.id,
            c.name,
            c.parentId ?? null,
            Number(c.level) || 1,
            c.createdAt || new Date().toISOString().split('T')[0],
            c.specSchema ?? null
          );
          restoredStats.categories++;
        }
      }

      if (Array.isArray(brands)) {
        db.prepare('DELETE FROM brands').run();
        const insertBrand = db.prepare(`
          INSERT INTO brands (id, name, logo, ownerId, description, category, businessType, status, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const br of brands) {
          const logoCheck = validateSafeImageSource(br.logo);
          insertBrand.run(
            sanitizeStringInput(br.id, 120),
            sanitizeStringInput(br.name, 120),
            logoCheck.valid ? logoCheck.value : null,
            sanitizeStringInput(br.ownerId, 120),
            br.description ? sanitizeStringInput(br.description, 1000) : null,
            br.category ? sanitizeStringInput(br.category, 160) : null,
            sanitizeStringInput(br.businessType, 60) || 'Retail',
            sanitizeStringInput(br.status, 40) || 'Aktif',
            sanitizeStringInput(br.createdAt, 60) || new Date().toISOString().split('T')[0]
          );
          restoredStats.brands++;
        }
      }

      if (Array.isArray(products)) {
        db.prepare('DELETE FROM products').run();
        const insertProd = db.prepare(`
          INSERT INTO products (id, brandId, brandName, sku, category, isB2B, description, createdAt, skuCode, image)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const p of products) {
          const imgCheck = validateSafeImageSource(p.image);
          insertProd.run(
            sanitizeStringInput(p.id, 120),
            p.brandId ? sanitizeStringInput(p.brandId, 120) : null,
            sanitizeStringInput(p.brandName, 120),
            sanitizeStringInput(p.sku, 200),
            p.category ? sanitizeStringInput(p.category, 160) : null,
            p.isB2B ? 1 : 0,
            p.description ? sanitizeStringInput(p.description, 1000) : null,
            p.createdAt ? sanitizeStringInput(p.createdAt, 60) : null,
            p.skuCode ? sanitizeStringInput(p.skuCode, 100) : null,
            imgCheck.valid ? imgCheck.value : null
          );
          restoredStats.products++;
        }
      }

      if (Array.isArray(users) && users.length > 0) {
        // Pertahankan hash password scrypt yang sudah ada di DB; tolak password plaintext dari berkas JSON
        const existingPasswords = new Map<string, string | null>();
        const existingRows = db.prepare('SELECT id, email, password FROM users').all() as any[];
        for (const row of existingRows) {
          existingPasswords.set(row.id, row.password ?? null);
          if (row.email) existingPasswords.set(row.email.toLowerCase(), row.password ?? null);
        }
        db.prepare('DELETE FROM users').run();
        const insertUser = db.prepare(`
          INSERT INTO users (id, name, username, email, phone, role, avatar, status, createdAt, password)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const u of users) {
          const incomingHash = typeof u.password === 'string' && u.password.startsWith('scrypt:') ? u.password : null;
          const preservedPwd =
            incomingHash ??
            existingPasswords.get(u.id) ??
            (u.email ? existingPasswords.get(String(u.email).toLowerCase()) : null) ??
            null;
          const avatarCheck = validateSafeImageSource(u.avatar);
          insertUser.run(
            sanitizeStringInput(u.id, 120),
            sanitizeStringInput(u.name, 120),
            u.username ? sanitizeStringInput(u.username, 80) : null,
            sanitizeStringInput(u.email, 160),
            u.phone ? sanitizeStringInput(u.phone, 40) : null,
            normalizeRole(u.role),
            avatarCheck.valid ? avatarCheck.value : null,
            u.status === 'Nonaktif' ? 'Nonaktif' : 'Aktif',
            u.createdAt ? sanitizeStringInput(u.createdAt, 60) : null,
            preservedPwd
          );
          restoredStats.users++;
        }
      }

      if (Array.isArray(auditLogs)) {
        db.prepare('DELETE FROM audit_logs').run();
        const insertLog = db.prepare(`
          INSERT INTO audit_logs (id, batchId, timestamp, user, reason, changes)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const l of auditLogs) {
          const changesStr = typeof l.changes === 'string' ? l.changes : JSON.stringify(l.changes || []);
          insertLog.run(l.id, l.batchId || '', l.timestamp || '', l.user || 'System', l.reason || '', changesStr);
          restoredStats.auditLogs++;
        }
      }

      if (Array.isArray(passwordResetRequests)) {
        db.prepare('DELETE FROM password_reset_requests').run();
        const insertReset = db.prepare(`
          INSERT INTO password_reset_requests (id, userId, requestedAt, status, actionNote, createdAtTs)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const r of passwordResetRequests) {
          insertReset.run(
            r.id,
            r.userId ?? null,
            r.requestedAt || '',
            r.status || 'Menunggu',
            r.actionNote ?? null,
            r.createdAtTs ? Number(r.createdAtTs) : null
          );
        }
      }

      if (Array.isArray(readNotifications)) {
        db.prepare('DELETE FROM read_notifications').run();
        const insertRead = db.prepare(
          'INSERT OR IGNORE INTO read_notifications (userId, notificationId, readAt) VALUES (?, ?, ?)'
        );
        const restoredAt = new Date().toISOString();
        const currentUsers = db.prepare('SELECT id FROM users').all() as Array<{ id: string }>;
        for (const rn of readNotifications) {
          if (rn && typeof rn === 'object' && rn.userId && rn.notificationId) {
            insertRead.run(String(rn.userId), String(rn.notificationId), String(rn.readAt || restoredAt));
          } else {
            // Kompatibilitas cadangan format lama ({ id } / string)
            const legacyId = typeof rn === 'string' ? rn : rn?.id;
            if (legacyId) {
              for (const u of currentUsers) {
                insertRead.run(u.id, String(legacyId), restoredAt);
              }
            }
          }
        }
      }

      if (settings && typeof settings === 'object') {
        const safeSettings = mergeSystemSettings(settings);
        const gwUrl = (safeSettings.notifications?.whatsappGatewayUrl || '').trim();
        if (gwUrl && !validatePublicWebhookUrl(gwUrl).valid) {
          safeSettings.notifications.whatsappGatewayUrl = '';
        }
        const now = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) + ' WIB';
        db.prepare(`
          INSERT INTO system_settings (key, value, updatedAt)
          VALUES ('app_settings', ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
        `).run(JSON.stringify(safeSettings), now);
      }
    });

    restoreTx();

    res.json({
      success: true,
      restored: restoredStats,
      message: `Pemulihan lengkap berhasil! ${restoredStats.batches} batch, ${restoredStats.tags} tag, ${restoredStats.brands} brand, ${restoredStats.products} SKU, dan ${restoredStats.categories} kategori telah dipulihkan.`
    });
  } catch (error) {
    return sendInternalError(res, 'POST /api/settings/restore', error);
  }
});

// Fallback 404 JSON untuk endpoint /api/* yang tidak terdaftar (mencegah fallback HTML dari SPA router)
app.use('/api', (_req, res) => {
  return res.status(404).json({
    success: false,
    error: 'Endpoint API tidak ditemukan.',
  });
});

// Global Express JSON/Body Error Handler (mencegah kebocoran stack trace HTML pada malformed JSON / payload terlalu besar)
app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!err) return next();
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({
      success: false,
      error: 'Ukuran payload permintaan melebihi batas keamanan server.',
    });
  }
  if (err instanceof SyntaxError && (err as any).status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: 'Format JSON permintaan tidak valid.',
    });
  }
  return sendInternalError(res, 'EXPRESS_GLOBAL_ERROR', err);
});

// ==============================================================
// REAL SCHEDULED DAILY AUTO-BACKUP & RETENTION PRUNING
// ==============================================================
async function runScheduledAutoBackup() {
  try {
    const settings = getActiveSystemSettings();
    if (!settings.backupInfo.autoBackupDaily) return;

    const backupsDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const todayFile = path.join(backupsDir, `auto-backup-${todayStr}.sqlite`);

    if (!fs.existsSync(todayFile)) {
      await db.backup(todayFile);
      const backupDate = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) + ' WIB';
      const updated = {
        ...settings,
        backupInfo: { ...settings.backupInfo, lastBackupDate: backupDate },
      };
      db.prepare(`
        INSERT INTO system_settings (key, value, updatedAt)
        VALUES ('app_settings', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
      `).run(JSON.stringify(updated), backupDate);
    }

    // Prune auto-backups older than retentionDays
    const retentionDays = Math.max(1, Number(settings.backupInfo.retentionDays) || 30);
    const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(backupsDir);
    for (const file of files) {
      if (!file.startsWith('auto-backup-') || !file.endsWith('.sqlite')) continue;
      const fullPath = path.join(backupsDir, file);
      const stat = fs.statSync(fullPath);
      if (stat.mtimeMs < cutoffMs) {
        try { fs.unlinkSync(fullPath); } catch (_) {}
      }
    }
  } catch (err) {
    console.error('Auto-backup harian gagal:', err);
  }
}

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
    // Jalankan pengecekan cadangan otomatis harian saat server aktif dan setiap 6 jam
    void runScheduledAutoBackup();
    setInterval(() => {
      void runScheduledAutoBackup();
    }, 6 * 60 * 60 * 1000);
  });

  // Mitigasi Slowloris / Slow-HTTP DDoS dengan batas waktu koneksi ketat
  server.keepAliveTimeout = 30_000;
  server.headersTimeout = 35_000;
  server.requestTimeout = 30_000;

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use.`);
    } else {
      console.error('Server listen error:', err);
    }
  });
}

process.on('unhandledRejection', (reason) => {
  console.error('[SERVER UNHANDLED REJECTION]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[SERVER UNCAUGHT EXCEPTION]', err);
});

startServer();
