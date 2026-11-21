-- ==========================================
-- Cloudflare D1 Database Schema for SUMAS
-- ==========================================

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

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY,
    batchId TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    user TEXT NOT NULL,
    reason TEXT NOT NULL,
    changes TEXT NOT NULL
  );

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
  , password TEXT);

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

CREATE INDEX IF NOT EXISTS idx_tags_batchId ON tags(batchId);
CREATE INDEX IF NOT EXISTS idx_tags_status ON tags(status);
CREATE INDEX IF NOT EXISTS idx_tags_search ON tags(batchId, status, tagNumber);
CREATE INDEX IF NOT EXISTS idx_tags_pin ON tags(pin);
CREATE INDEX IF NOT EXISTS idx_scan_points_status ON scan_points(status);
CREATE INDEX IF NOT EXISTS idx_scan_points_brand ON scan_points(brand);
CREATE INDEX IF NOT EXISTS idx_scan_points_tagId ON scan_points(latestTagId);
CREATE INDEX IF NOT EXISTS idx_scan_points_pin ON scan_points(pin);
CREATE INDEX IF NOT EXISTS idx_scan_activities_range ON scan_activities(rangeType, sortOrder);
CREATE INDEX IF NOT EXISTS idx_audit_logs_batchId ON audit_logs(batchId);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(createdAtTs DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_audience ON notifications(audience, createdAtTs DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_entity ON notifications(entityType, entityId);
CREATE INDEX IF NOT EXISTS idx_notifications_dedupe ON notifications(dedupeKey, createdAtTs DESC);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parentId);
CREATE INDEX IF NOT EXISTS idx_categories_level ON categories(level);
CREATE INDEX IF NOT EXISTS idx_user_sessions_userId ON user_sessions(userId);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expiresAt ON user_sessions(expiresAt);
CREATE INDEX IF NOT EXISTS idx_read_notifications_user ON read_notifications(userId);
CREATE INDEX IF NOT EXISTS idx_batches_batchId ON batches(batchId);
CREATE INDEX IF NOT EXISTS idx_batches_brand ON batches(brand);
CREATE INDEX IF NOT EXISTS idx_tags_tagNumber ON tags(tagNumber);
CREATE INDEX IF NOT EXISTS idx_brands_ownerId ON brands(ownerId);
CREATE INDEX IF NOT EXISTS idx_products_brandId ON products(brandId);
