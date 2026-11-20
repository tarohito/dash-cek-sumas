import crypto from 'node:crypto';
import {
  DEFAULT_ROLE_PERMISSIONS,
  hasPermission,
  mergeRbacMatrix,
  normalizeRole,
  type RbacMatrix,
} from './rbac.ts';
import {
  DEFAULT_SYSTEM_SETTINGS,
  mergeSystemSettings,
  type GeoIpResult,
  type NotificationConfig,
  type SystemSettingsConfig,
} from './securityPolicy.ts';

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean }>;
  run(): Promise<{ success: boolean; meta?: any }>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
  batch(statements: D1PreparedStatementLike[]): Promise<any[]>;
}

export interface EdgeEnv {
  DB: D1DatabaseLike;
  SESSION_SECRET?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  WHATSAPP_API_TOKEN?: string;
  TELEGRAM_BOT_TOKEN?: string;
}

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DUMMY_SCRYPT_SALT = 'sumas_dummy_salt_v1_000000000000';

export function jsonResponse(
  data: any,
  status = 200,
  extraHeaders: Record<string, string> = {}
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}

export function corsOptions(request: Request) {
  const origin = request.headers.get('Origin') || '';
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers['Vary'] = 'Origin';
  }
  return new Response(null, { status: 204, headers });
}

export function escapeHtml(input: unknown): string {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}

export function escapeLikePattern(input: string): string {
  return String(input || '').replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export function sanitizeStringInput(input: unknown, maxLength = 500): string {
  if (input === null || input === undefined) return '';
  return String(input)
    .replace(/\0/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
    .slice(0, maxLength);
}

export function validateHttpUrl(
  rawUrl: unknown,
  options: { allowEmpty?: boolean; defaultUrl?: string; maxLength?: number } = {}
): { valid: boolean; url: string; error?: string } {
  const maxLen = options.maxLength ?? 2048;
  const trimmed = sanitizeStringInput(rawUrl, maxLen);
  if (!trimmed) {
    if (options.allowEmpty) return { valid: true, url: options.defaultUrl ?? '' };
    return { valid: false, url: '', error: 'URL tidak boleh kosong.' };
  }
  if (/[\s<>'"`]/.test(trimmed)) {
    return { valid: false, url: '', error: 'URL mengandung karakter tidak valid.' };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { valid: false, url: '', error: 'URL hanya boleh menggunakan protokol http:// atau https://.' };
    }
    if (parsed.username || parsed.password) {
      return { valid: false, url: '', error: 'URL tidak boleh mengandung kredensial tertanam.' };
    }
    return { valid: true, url: parsed.toString() };
  } catch {
    return { valid: false, url: '', error: 'Format URL tidak valid.' };
  }
}

function isPrivateOrReservedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').trim();
  if (!host) return true;
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'metadata.google.internal' ||
    host === 'metadata' ||
    host === '::1' ||
    host === '::' ||
    host.startsWith('fc') ||
    host.startsWith('fd') ||
    host.startsWith('fe80:')
  ) {
    return true;
  }
  if (/^(0x[0-9a-f]+|\d+)$/i.test(host)) return true;
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [a, b] = [Number(ipv4Match[1]), Number(ipv4Match[2])];
    if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  return false;
}

export function validatePublicWebhookUrl(rawUrl: unknown): { valid: boolean; url: string; error?: string } {
  const base = validateHttpUrl(rawUrl, { allowEmpty: false, maxLength: 1024 });
  if (!base.valid) return base;
  try {
    const parsed = new URL(base.url);
    if (isPrivateOrReservedHostname(parsed.hostname)) {
      return {
        valid: false,
        url: '',
        error: 'URL tujuan tidak diizinkan mengarah ke jaringan lokal, localhost, atau alamat privat.',
      };
    }
    return base;
  } catch {
    return { valid: false, url: '', error: 'Format URL gateway tidak valid.' };
  }
}

export function validateSafeImageSource(
  rawSrc: unknown,
  maxChars = 3 * 1024 * 1024
): { valid: boolean; value: string | null; error?: string } {
  if (rawSrc === null || rawSrc === undefined || rawSrc === '') {
    return { valid: true, value: null };
  }
  if (typeof rawSrc !== 'string') {
    return { valid: false, value: null, error: 'Format sumber gambar tidak valid.' };
  }
  const trimmed = rawSrc.replace(/\0/g, '').trim();
  if (!trimmed) return { valid: true, value: null };
  if (trimmed.length > maxChars) {
    return { valid: false, value: null, error: 'Ukuran gambar melebihi batas maksimal (2 MB).' };
  }
  if (trimmed.startsWith('/assets/') && !trimmed.includes('..') && !/[\s<>'"`]/.test(trimmed)) {
    return { valid: true, value: trimmed };
  }
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i.test(trimmed)) {
    return { valid: true, value: trimmed };
  }
  if (/^https?:\/\//i.test(trimmed)) {
    const checked = validateHttpUrl(trimmed, { maxLength: 2048 });
    if (checked.valid) return { valid: true, value: checked.url };
  }
  return {
    valid: false,
    value: null,
    error: 'Sumber gambar tidak diizinkan. Gunakan PNG/JPG/WebP/GIF atau URL HTTPS yang valid.',
  };
}

export function hashPassword(password: string): string {
  if (!password || !password.trim()) return '';
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password.trim(), salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
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

export function performDummyPasswordWork(password: string) {
  try {
    crypto.scryptSync(password || 'dummy', DUMMY_SCRYPT_SALT, 64);
  } catch (_) {}
}

export async function getOrCreateD1SessionSecret(db: any, env: EdgeEnv): Promise<string> {
  if (env.SESSION_SECRET && env.SESSION_SECRET.trim().length >= 32) {
    return env.SESSION_SECRET.trim();
  }
  try {
    const existing = (await db
      .prepare("SELECT value FROM server_secrets WHERE key = 'session_hmac_secret'")
      .first()) as { value?: string } | null;
    if (existing?.value && existing.value.length >= 64) {
      return existing.value;
    }
    const generated = crypto.randomBytes(32).toString('hex');
    await db
      .prepare(
        "INSERT OR REPLACE INTO server_secrets (key, value, createdAt) VALUES ('session_hmac_secret', ?, ?)"
      )
      .bind(generated, new Date().toISOString())
      .run();
    return generated;
  } catch {
    return crypto.randomBytes(32).toString('hex');
  }
}

export function hashSessionToken(rawToken: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(rawToken).digest('hex');
}

export function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get('Cookie') || '';
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      try {
        result[k] = decodeURIComponent(v);
      } catch (_) {
        result[k] = v;
      }
    }
  }
  return result;
}

export function extractSessionToken(request: Request): string | null {
  const cookies = parseCookies(request);
  if (cookies.sumas_session && cookies.sumas_session.length >= 32 && cookies.sumas_session.length <= 256) {
    return cookies.sumas_session;
  }
  const authHeader = (request.headers.get('Authorization') || '').trim();
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer.length >= 32 && bearer.length <= 256) {
      return bearer;
    }
  }
  return null;
}

export function buildSessionCookieFlags(request: Request, maxAgeSeconds: number): string {
  const url = new URL(request.url);
  const isHttps = url.protocol === 'https:';
  return isHttps
    ? `HttpOnly; Path=/; SameSite=Lax; Secure; Max-Age=${maxAgeSeconds}`
    : `HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export async function createD1UserSession(
  db: any,
  secret: string,
  userId: string,
  maxAgeSeconds: number,
  request: Request
): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(rawToken, secret);
  const now = Date.now();
  const expiresAt = now + maxAgeSeconds * 1000;
  const ipAddress = sanitizeStringInput(request.headers.get('cf-connecting-ip') || '0.0.0.0', 80);
  const userAgent = sanitizeStringInput(request.headers.get('user-agent') || '', 240);

  await db
    .prepare(
      'INSERT INTO user_sessions (tokenHash, userId, createdAt, expiresAt, ipAddress, userAgent) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .bind(tokenHash, userId, now, expiresAt, ipAddress, userAgent)
    .run();

  try {
    await db.prepare('DELETE FROM user_sessions WHERE expiresAt <= ?').bind(now).run();
    const activeSessions = (
      await db
        .prepare('SELECT tokenHash FROM user_sessions WHERE userId = ? ORDER BY createdAt DESC')
        .bind(userId)
        .all()
    ).results as { tokenHash: string }[];
    if (activeSessions.length > 10) {
      for (const stale of activeSessions.slice(10)) {
        await db.prepare('DELETE FROM user_sessions WHERE tokenHash = ?').bind(stale.tokenHash).run();
      }
    }
  } catch (_) {}

  return rawToken;
}

export async function revokeD1SessionByToken(db: any, secret: string, rawToken?: string | null) {
  if (!rawToken) return;
  try {
    const tokenHash = hashSessionToken(rawToken, secret);
    await db.prepare('DELETE FROM user_sessions WHERE tokenHash = ?').bind(tokenHash).run();
  } catch (_) {}
}

export async function revokeAllD1UserSessions(db: any, userId: string) {
  if (!userId) return;
  try {
    await db.prepare('DELETE FROM user_sessions WHERE userId = ?').bind(userId).run();
  } catch (_) {}
}

export async function resolveD1SessionUser(db: any, secret: string, request: Request): Promise<any | null> {
  const rawToken = extractSessionToken(request);
  if (!rawToken) return null;

  const tokenHash = hashSessionToken(rawToken, secret);
  const session = (await db
    .prepare('SELECT userId, expiresAt FROM user_sessions WHERE tokenHash = ? LIMIT 1')
    .bind(tokenHash)
    .first()) as { userId: string; expiresAt: number } | null;

  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    try {
      await db.prepare('DELETE FROM user_sessions WHERE tokenHash = ?').bind(tokenHash).run();
    } catch (_) {}
    return null;
  }

  const user = (await db
    .prepare('SELECT id, name, username, email, phone, role, avatar, status, createdAt FROM users WHERE id = ?')
    .bind(session.userId)
    .first()) as any;
  if (!user || (user.status || 'Aktif') === 'Nonaktif') {
    await revokeAllD1UserSessions(db, session.userId);
    return null;
  }
  return { ...user, role: normalizeRole(user.role) };
}

export async function getD1RbacMatrix(db: any): Promise<RbacMatrix> {
  try {
    const row = (await db
      .prepare("SELECT value FROM system_settings WHERE key = 'rbac_permissions'")
      .first()) as { value?: string } | null;
    if (row?.value) {
      return mergeRbacMatrix(JSON.parse(row.value));
    }
  } catch (_) {}
  return mergeRbacMatrix(DEFAULT_ROLE_PERMISSIONS);
}

export async function saveD1RbacMatrix(db: any, rawMatrix: Partial<Record<string, unknown>>): Promise<RbacMatrix> {
  const merged = mergeRbacMatrix(rawMatrix);
  const updatedAt = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) + ' WIB';
  await db
    .prepare(
      `INSERT INTO system_settings (key, value, updatedAt)
       VALUES ('rbac_permissions', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`
    )
    .bind(JSON.stringify(merged), updatedAt)
    .run();
  return merged;
}

export interface UserBrandScope {
  user: any | null;
  isGlobal: boolean;
  ownedBrandNames: Set<string>;
  ownedBrandIds: Set<string>;
}

export async function getD1UserBrandScope(db: any, user: any | null, matrix: RbacMatrix): Promise<UserBrandScope> {
  if (!user) {
    return { user: null, isGlobal: false, ownedBrandNames: new Set(), ownedBrandIds: new Set() };
  }
  const isGlobal = hasPermission(user.role, 'scope.all_brands', matrix);
  if (isGlobal) {
    return { user, isGlobal: true, ownedBrandNames: new Set(), ownedBrandIds: new Set() };
  }
  const rows = (
    await db.prepare('SELECT id, name FROM brands WHERE ownerId = ?').bind(user.id).all()
  ).results as { id: string; name: string }[];
  return {
    user,
    isGlobal: false,
    ownedBrandNames: new Set(rows.map((r) => String(r.name || '').trim().toLowerCase()).filter(Boolean)),
    ownedBrandIds: new Set(rows.map((r) => String(r.id || '').trim()).filter(Boolean)),
  };
}

export function canScopeAccessBrand(
  scope: UserBrandScope,
  brandName?: string | null,
  brandId?: string | null
): boolean {
  if (scope.isGlobal) return true;
  if (brandId && scope.ownedBrandIds.has(String(brandId).trim())) return true;
  if (brandName && scope.ownedBrandNames.has(String(brandName).trim().toLowerCase())) return true;
  return false;
}

export function assertD1BrandAccess(
  scope: UserBrandScope,
  brandName?: string | null,
  brandId?: string | null
): Response | null {
  if (canScopeAccessBrand(scope, brandName, brandId)) return null;
  return jsonResponse(
    {
      success: false,
      error: 'Akses ditolak. Anda hanya dapat mengakses data milik brand yang berada di bawah pengelolaan Anda.',
    },
    403
  );
}

export async function isBrandB2BD1(
  db: any,
  brandName?: string | null,
  batchIsB2B?: number | boolean | null
): Promise<boolean> {
  if (batchIsB2B === 1 || batchIsB2B === true) return true;
  if (batchIsB2B === 0 || batchIsB2B === false) return false;
  if (!brandName) return false;
  try {
    const row = (await db
      .prepare('SELECT businessType FROM brands WHERE LOWER(name) = ?')
      .bind(brandName.trim().toLowerCase())
      .first()) as { businessType?: string } | null;
    return row?.businessType === 'B2B';
  } catch (_) {
    return false;
  }
}

export function getNotificationActorLabel(actor: { name?: string; role?: string }): string {
  if (normalizeRole(actor.role) === 'Super Admin') return 'Administrator';
  return actor.name || 'Sistem';
}

export function generateTagsForBatchD1(
  batchId: string,
  _brand: string,
  qty: number,
  pinLength: number,
  allocatedCount = 0,
  projectName = ''
) {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const tags: any[] = [];
  for (let i = 0; i < qty; i++) {
    let pin = '';
    for (let j = 0; j < pinLength; j++) {
      pin += String(crypto.randomInt(0, 10));
    }
    let tagNumber = '';
    for (let k = 0; k < 8; k++) {
      tagNumber += chars.charAt(crypto.randomInt(0, chars.length));
    }
    const isUsed = i < allocatedCount;
    tags.push({
      id: `tag-${batchId}-${tagNumber}-${i}`,
      batchId,
      tagNumber,
      pin,
      status: isUsed ? 'Telah Digunakan' : 'Tersedia',
      project: isUsed ? projectName : null,
      specs: '-',
      codeType: '-',
      warranty: '-',
      prodCode: '-',
      note: '-',
      allocatedAt: null,
    });
  }
  return tags;
}

export async function insertBatchTagsD1(db: any, tags: any[]) {
  const stmt = db.prepare(
    `INSERT INTO tags (id, batchId, tagNumber, pin, status, project, specs, codeType, warranty, prodCode, note, allocatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const stmts = tags.map((t) =>
    stmt.bind(
      t.id,
      t.batchId,
      t.tagNumber,
      t.pin,
      t.status,
      t.project || null,
      t.specs || '-',
      t.codeType || '-',
      t.warranty || '-',
      t.prodCode || '-',
      t.note || '-',
      t.allocatedAt || null
    )
  );
  for (let i = 0; i < stmts.length; i += 80) {
    await db.batch(stmts.slice(i, i + 80));
  }
}

export async function createD1Notification(
  db: any,
  input: {
    id?: string;
    type: 'scan' | 'edit' | 'password_reset' | 'system';
    severity?: 'info' | 'warning' | 'critical';
    audience?: 'super_admin' | 'brand_scope' | 'user';
    targetUserId?: string | null;
    brandName?: string | null;
    brandId?: string | null;
    title: string;
    subtitle?: string;
    description?: string;
    entityType?: string | null;
    entityId?: string | null;
    status?: string;
    metadata?: Record<string, any> | null;
    dedupeKey?: string | null;
    dedupeWindowMs?: number;
    createdAtTs?: number;
  }
) {
  try {
    const now = input.createdAtTs || Date.now();
    if (input.dedupeKey) {
      const windowMs = input.dedupeWindowMs ?? 30_000;
      const existing = (await db
        .prepare('SELECT id, createdAtTs FROM notifications WHERE dedupeKey = ? ORDER BY createdAtTs DESC LIMIT 1')
        .bind(input.dedupeKey)
        .first()) as { id: string; createdAtTs: number } | null;
      if (existing && now - Number(existing.createdAtTs || 0) < windowMs) {
        return;
      }
    }

    const id = input.id || `notif-${now}-${crypto.randomBytes(3).toString('hex')}`;
    await db
      .prepare(
        `INSERT INTO notifications (id, type, severity, audience, targetUserId, brandName, brandId, title, subtitle, description, entityType, entityId, status, metadata, dedupeKey, createdAtTs)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        input.type,
        input.severity || 'info',
        input.audience || 'brand_scope',
        input.targetUserId || null,
        input.brandName || null,
        input.brandId || null,
        input.title,
        input.subtitle || '',
        input.description || '',
        input.entityType || null,
        input.entityId || null,
        input.status || 'info',
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.dedupeKey || null,
        now
      )
      .run();
  } catch (_) {}
}

export async function updateD1NotificationByEntity(
  db: any,
  entityType: string,
  entityId: string,
  updates: { status?: string; severity?: string; description?: string; metadata?: Record<string, any> }
) {
  try {
    const row = (await db
      .prepare('SELECT * FROM notifications WHERE entityType = ? AND entityId = ? ORDER BY createdAtTs DESC LIMIT 1')
      .bind(entityType, entityId)
      .first()) as any;
    if (!row) return;
    let prevMeta: any = {};
    try {
      if (row.metadata) prevMeta = JSON.parse(row.metadata);
    } catch (_) {}
    const mergedMeta = updates.metadata ? { ...prevMeta, ...updates.metadata } : prevMeta;
    await db
      .prepare('UPDATE notifications SET status = ?, severity = ?, description = ?, metadata = ? WHERE id = ?')
      .bind(
        updates.status ?? row.status,
        updates.severity ?? row.severity,
        updates.description ?? row.description,
        JSON.stringify(mergedMeta),
        row.id
      )
      .run();
  } catch (_) {}
}

export function canUserAccessNotificationRow(
  row: any,
  ctx: {
    userId: string;
    isGlobal: boolean;
    canManageUsers: boolean;
    ownedBrandNames: Set<string>;
    ownedBrandIds: Set<string>;
  }
): boolean {
  if (ctx.isGlobal) return true;
  if (row.audience === 'user') {
    return Boolean(ctx.userId && row.targetUserId === ctx.userId);
  }
  if (row.audience === 'super_admin') {
    return ctx.canManageUsers && row.type === 'password_reset';
  }
  const bId = String(row.brandId || '').trim();
  const bName = String(row.brandName || '').trim().toLowerCase();
  if (bId && ctx.ownedBrandIds.has(bId)) return true;
  if (bName && ctx.ownedBrandNames.has(bName)) return true;
  return false;
}

function formatRelativeTimeId(tsMs: number, nowMs: number): string {
  const diffSec = Math.max(0, Math.floor((nowMs - tsMs) / 1000));
  if (diffSec < 45) return 'Baru saja';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} menit lalu`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} jam lalu`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} hari lalu`;
  return new Date(tsMs).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
}

export function formatNotificationRowForClient(row: any, readIds: Set<string>, nowMs: number) {
  let meta: any = {};
  try {
    if (row.metadata) meta = JSON.parse(row.metadata);
  } catch (_) {}
  const createdTs = Number(row.createdAtTs) || nowMs;
  const isActionableReset = row.type === 'password_reset' && row.status === 'Menunggu';
  return {
    id: row.id,
    sourceId: row.entityId || row.id,
    category: row.type,
    severity: row.severity || 'info',
    audience: row.audience || 'brand_scope',
    brandName: row.brandName || null,
    title: row.title,
    subtitle: row.subtitle || '',
    description: row.description || '',
    timestamp: new Date(createdTs).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) + ' WIB',
    timeAgo: formatRelativeTimeId(createdTs, nowMs),
    createdAtTs: createdTs,
    status: row.status || 'info',
    isRead: isActionableReset ? false : readIds.has(row.id),
    user: meta.user || null,
    emailSent: meta.emailSent ?? null,
    tempPassword: meta.tempPassword ?? null,
    batchId: meta.batchId ?? null,
    brand: meta.brand ?? row.brandName ?? null,
    city: meta.city ?? null,
    province: meta.province ?? null,
    totalScans: meta.totalScans ?? null,
    todayScans: meta.todayScans ?? null,
    changes: Array.isArray(meta.changes) ? meta.changes : [],
  };
}

export async function loadActiveSettingsD1(db: any): Promise<SystemSettingsConfig> {
  try {
    const row = (await db
      .prepare("SELECT value FROM system_settings WHERE key = 'app_settings'")
      .first()) as { value: string } | null;
    if (row?.value) {
      return mergeSystemSettings(JSON.parse(row.value));
    }
  } catch (_) {}
  return mergeSystemSettings(DEFAULT_SYSTEM_SETTINGS);
}

export function getCfGeoIp(request: Request): GeoIpResult {
  const cf = (request as any).cf || {};
  if (Number.isFinite(Number(cf.latitude)) && Number.isFinite(Number(cf.longitude))) {
    return {
      city: String(cf.city || 'Lokasi IP'),
      province: String(cf.region || ''),
      countryCode: String(cf.country || 'ID').toUpperCase(),
      lat: Number(cf.latitude),
      lng: Number(cf.longitude),
      isp: String(cf.asOrganization || 'ISP Publik'),
      isFallbackDefault: false,
    };
  }
  return {
    city: 'Jakarta',
    province: 'DKI Jakarta',
    countryCode: 'ID',
    lat: -6.2088,
    lng: 106.8456,
    isp: 'ISP Publik',
    isFallbackDefault: true,
  };
}

export async function sendEdgeAlertChannel(
  env: EdgeEnv,
  channel: 'email' | 'telegram' | 'whatsapp',
  cfg: NotificationConfig,
  subject: string,
  plainText: string,
  htmlBody: string
) {
  if (channel === 'telegram' || channel === 'whatsapp') {
    const label = channel === 'telegram' ? 'Telegram Bot' : 'WhatsApp Gateway';
    return {
      success: true,
      target: '-',
      detail: `Integrasi API ${label} dilewati sementara sehingga tidak mengirim permintaan ke server eksternal.`,
    };
  }

  const recipients = (cfg.emailRecipients || '')
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes('@'));
  if (recipients.length === 0) {
    return { success: false, target: '-', detail: 'Alamat email penerima belum diisi atau tidak valid.' };
  }
  if (!env.RESEND_API_KEY) {
    return {
      success: false,
      target: recipients.join(', '),
      detail: 'RESEND_API_KEY belum dikonfigurasi pada Cloudflare Pages environment.',
    };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.RESEND_API_KEY}` },
    body: JSON.stringify({
      from: env.RESEND_FROM || 'Security Alert <onboarding@resend.dev>',
      to: recipients,
      subject,
      text: plainText,
      html: `<div style="font-family:sans-serif;line-height:1.6">${htmlBody.replace(/\n/g, '<br/>')}</div>`,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as any;
  if (res.ok && data?.id) {
    return {
      success: true,
      target: recipients.join(', '),
      detail: `Email terkirim via Resend API (id: ${data.id}).`,
    };
  }
  return {
    success: false,
    target: recipients.join(', '),
    detail: `Resend API menolak (${res.status}): ${data?.message || 'Periksa RESEND_API_KEY.'}`,
  };
}
