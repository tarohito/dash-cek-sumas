-- ==========================================
-- Cloudflare D1 Database Schema for SUMAS
-- ==========================================

CREATE TABLE batches (
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
    redirectUrl TEXT DEFAULT 'https://cek.sumas.id/verify',
    qrType TEXT DEFAULT 'dynamic',
    requirePin INTEGER DEFAULT 1,
    enableGps INTEGER DEFAULT 1
  );

CREATE TABLE tags (
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

CREATE TABLE scan_points (
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
  , pin TEXT, scanHistory TEXT);

CREATE TABLE scan_activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rangeType TEXT NOT NULL,
    label TEXT NOT NULL,
    fullDate TEXT NOT NULL,
    scans INTEGER NOT NULL,
    valid INTEGER NOT NULL,
    topBrand TEXT NOT NULL,
    sortOrder INTEGER NOT NULL
  );

CREATE TABLE audit_logs (
    id INTEGER PRIMARY KEY,
    batchId TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    user TEXT NOT NULL,
    reason TEXT NOT NULL,
    changes TEXT NOT NULL
  );

CREATE TABLE users (
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

CREATE TABLE brands (
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

CREATE TABLE products (
    id TEXT PRIMARY KEY,
    brandId TEXT,
    brandName TEXT NOT NULL,
    sku TEXT NOT NULL,
    category TEXT,
    isB2B INTEGER DEFAULT 0
  , description TEXT, skuCode TEXT, createdAt TEXT, image TEXT);

CREATE TABLE password_reset_requests (
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

CREATE TABLE read_notifications (
    id TEXT PRIMARY KEY
  );

CREATE TABLE categories (
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
  , specSchema TEXT);

CREATE INDEX idx_tags_batchId ON tags(batchId);
CREATE INDEX idx_tags_status ON tags(status);
CREATE INDEX idx_tags_search ON tags(batchId, status, tagNumber);
CREATE INDEX idx_tags_pin ON tags(pin);
CREATE INDEX idx_scan_points_status ON scan_points(status);
CREATE INDEX idx_scan_points_brand ON scan_points(brand);
CREATE INDEX idx_scan_activities_range ON scan_activities(rangeType, sortOrder);
CREATE INDEX idx_audit_logs_batchId ON audit_logs(batchId);
CREATE INDEX idx_categories_parent ON categories(parentId);
CREATE INDEX idx_categories_level ON categories(level);
CREATE INDEX idx_scan_points_tagId ON scan_points(latestTagId);
CREATE INDEX idx_scan_points_pin ON scan_points(pin);
