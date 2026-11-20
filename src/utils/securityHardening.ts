import type express from 'express';
import net from 'net';

// ==============================================================
// DEFENSE-IN-DEPTH SECURITY HARDENING UTILITIES
// - Anti-DDoS Sliding-Window Rate Limiter (memory-bounded)
// - Brute-Force Login Lockout Tracker (IP + Identifier)
// - HTTP Security Headers & CSP
// - CSRF Origin/Host Verification
// - Prototype Pollution & Deep JSON Bomb Mitigation
// - XSS / HTML Escaping, SQL LIKE Escaping, Safe URL & Anti-SSRF
// ==============================================================

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

export function isValidIpAddress(ip: string): boolean {
  if (!ip || typeof ip !== 'string') return false;
  const cleaned = ip.replace(/^::ffff:/, '').trim();
  return net.isIP(cleaned) !== 0;
}

export function getSafeClientIp(req: express.Request): string {
  const cfIp = req.headers['cf-connecting-ip'];
  if (typeof cfIp === 'string') {
    const candidate = cfIp.trim().replace(/^::ffff:/, '');
    if (net.isIP(candidate) !== 0) return candidate;
  }
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string') {
    const first = xff.split(',')[0].trim().replace(/^::ffff:/, '');
    if (net.isIP(first) !== 0) return first;
  }
  const remote = String(req.socket?.remoteAddress || req.ip || '127.0.0.1').replace(/^::ffff:/, '').trim();
  return net.isIP(remote) !== 0 ? remote : '127.0.0.1';
}

// ==============================================================
// URL VALIDATION & ANTI-SSRF
// ==============================================================
function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local & cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a >= 224) return true; // Multicast & reserved
  return false;
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
  // Block pure numeric/hex/octal IP encodings (e.g. http://2130706433 or http://0x7f000001)
  if (/^(0x[0-9a-f]+|\d+)$/i.test(host)) return true;
  if (host.startsWith('::ffff:')) {
    const mapped = host.slice(7);
    if (net.isIPv4(mapped)) return isPrivateOrReservedIpv4(mapped);
    return true;
  }
  if (net.isIPv4(host)) {
    return isPrivateOrReservedIpv4(host);
  }
  if (net.isIPv6(host)) {
    return true; // Restrict direct IPv6 literals for external webhooks
  }
  return false;
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

export function validatePublicWebhookUrl(rawUrl: unknown): { valid: boolean; url: string; error?: string } {
  const base = validateHttpUrl(rawUrl, { allowEmpty: false, maxLength: 1024 });
  if (!base.valid) return base;
  try {
    const parsed = new URL(base.url);
    if (isPrivateOrReservedHostname(parsed.hostname)) {
      return {
        valid: false,
        url: '',
        error: 'URL tujuan tidak diizinkan mengarah ke jaringan lokal, localhost, atau alamat privat (proteksi SSRF).',
      };
    }
    return base;
  } catch {
    return { valid: false, url: '', error: 'Format URL gateway tidak valid.' };
  }
}

// Block Stored XSS via data:image/svg+xml or javascript: URIs in avatars, logos, and product images
export function validateSafeImageSource(
  rawSrc: unknown,
  maxChars = 3 * 1024 * 1024 // ~3MB base64 ceiling
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

  // Allow safe relative static asset paths (no path traversal)
  if (trimmed.startsWith('/assets/') && !trimmed.includes('..') && !/[\s<>'"`]/.test(trimmed)) {
    return { valid: true, value: trimmed };
  }

  // Allow ONLY raster base64 images (explicitly deny SVG data URIs which can carry <script>/onload XSS)
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i.test(trimmed)) {
    return { valid: true, value: trimmed };
  }

  // Allow valid http(s) image URLs
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

// ==============================================================
// PROTOTYPE POLLUTION & DEEP NESTING SANITIZER MIDDLEWARE
// ==============================================================
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function sanitizeObjectRecursive(value: unknown, depth = 0, maxDepth = 12): { ok: boolean; value: unknown } {
  if (depth > maxDepth) {
    return { ok: false, value: null };
  }
  if (value === null || value === undefined) return { ok: true, value };
  if (typeof value === 'string') {
    return { ok: true, value: value.replace(/\0/g, '') };
  }
  if (typeof value !== 'object') return { ok: true, value };

  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (let i = 0; i < value.length; i++) {
      const child = sanitizeObjectRecursive(value[i], depth + 1, maxDepth);
      if (!child.ok) return { ok: false, value: null };
      out.push(child.value);
    }
    return { ok: true, value: out };
  }

  const record = value as Record<string, unknown>;
  const clean: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    const child = sanitizeObjectRecursive(record[key], depth + 1, maxDepth);
    if (!child.ok) return { ok: false, value: null };
    clean[key] = child.value;
  }
  return { ok: true, value: clean };
}

export function sanitizePayloadMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.body && typeof req.body === 'object') {
    const cleanedBody = sanitizeObjectRecursive(req.body, 0, 12);
    if (!cleanedBody.ok) {
      return res.status(400).json({ error: 'Struktur payload terlalu dalam atau tidak valid.' });
    }
    req.body = cleanedBody.value;
  }
  if (req.query && typeof req.query === 'object') {
    for (const key of Object.keys(req.query)) {
      if (FORBIDDEN_KEYS.has(key)) {
        delete (req.query as any)[key];
      }
    }
  }
  next();
}

// ==============================================================
// ANTI-DDOS MEMORY-BOUNDED SLIDING-WINDOW RATE LIMITER
// ==============================================================
interface RateBucket {
  count: number;
  resetAt: number;
}

export interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
  message?: string;
  maxBuckets?: number;
  skip?: (req: express.Request) => boolean;
}

export function createRateLimiter(options: RateLimiterOptions): express.RequestHandler {
  const buckets = new Map<string, RateBucket>();
  const maxBuckets = options.maxBuckets ?? 10_000;
  const message =
    options.message ||
    'Terlalu banyak permintaan dari jaringan Anda. Mohon tunggu beberapa saat sebelum mencoba lagi.';

  // Periodic cleanup to keep memory flat under spoofed IP floods
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets.entries()) {
      if (b.resetAt <= now) buckets.delete(k);
    }
  }, Math.min(options.windowMs, 60_000));
  if (typeof cleanupInterval.unref === 'function') {
    cleanupInterval.unref();
  }

  return (req, res, next) => {
    if (options.skip && options.skip(req)) return next();

    const ip = getSafeClientIp(req);
    const key = `${options.keyPrefix}:${ip}`;
    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      if (buckets.size >= maxBuckets) {
        // Evict oldest key to prevent OOM under distributed floods
        const oldestKey = buckets.keys().next().value;
        if (oldestKey) buckets.delete(oldestKey);
      }
      bucket = { count: 1, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    } else {
      bucket.count += 1;
    }

    const remaining = Math.max(0, options.maxRequests - bucket.count);
    const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

    res.setHeader('X-RateLimit-Limit', String(options.maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > options.maxRequests) {
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        success: false,
        error: message,
        retryAfterSeconds: retryAfterSec,
      });
    }

    next();
  };
}

// ==============================================================
// BRUTE-FORCE ACCOUNT LOCKOUT TRACKER
// ==============================================================
interface FailureEntry {
  count: number;
  firstAttemptAt: number;
  lockedUntil: number;
}

export class LoginAttemptTracker {
  private readonly entries = new Map<string, FailureEntry>();
  private readonly maxFailuresPerPair: number;
  private readonly maxFailuresPerIdentifier: number;
  private readonly windowMs: number;
  private readonly lockoutMs: number;
  private readonly maxEntries = 10_000;

  constructor(opts?: {
    maxFailuresPerPair?: number;
    maxFailuresPerIdentifier?: number;
    windowMs?: number;
    lockoutMs?: number;
  }) {
    this.maxFailuresPerPair = opts?.maxFailuresPerPair ?? 5;
    this.maxFailuresPerIdentifier = opts?.maxFailuresPerIdentifier ?? 10;
    this.windowMs = opts?.windowMs ?? 15 * 60 * 1000;
    this.lockoutMs = opts?.lockoutMs ?? 15 * 60 * 1000;

    const timer = setInterval(() => this.prune(), 5 * 60 * 1000);
    if (typeof timer.unref === 'function') timer.unref();
  }

  private prune() {
    const now = Date.now();
    for (const [k, e] of this.entries.entries()) {
      if (e.lockedUntil <= now && now - e.firstAttemptAt > this.windowMs) {
        this.entries.delete(k);
      }
    }
  }

  private keys(identifier: string, ip: string): [string, string] {
    const id = identifier.trim().toLowerCase().slice(0, 120);
    return [`pair:${ip}:${id}`, `acct:${id}`];
  }

  checkLocked(identifier: string, ip: string): { locked: boolean; retryAfterSeconds: number } {
    const now = Date.now();
    const [pairKey, acctKey] = this.keys(identifier, ip);
    for (const key of [pairKey, acctKey]) {
      const entry = this.entries.get(key);
      if (entry && entry.lockedUntil > now) {
        return {
          locked: true,
          retryAfterSeconds: Math.max(1, Math.ceil((entry.lockedUntil - now) / 1000)),
        };
      }
    }
    return { locked: false, retryAfterSeconds: 0 };
  }

  recordFailure(identifier: string, ip: string): { justLocked: boolean; remainingAttempts: number } {
    const now = Date.now();
    const [pairKey, acctKey] = this.keys(identifier, ip);

    const updateKey = (key: string, limit: number): FailureEntry => {
      let e = this.entries.get(key);
      if (!e || now - e.firstAttemptAt > this.windowMs) {
        if (this.entries.size >= this.maxEntries) {
          const oldest = this.entries.keys().next().value;
          if (oldest) this.entries.delete(oldest);
        }
        e = { count: 1, firstAttemptAt: now, lockedUntil: 0 };
      } else {
        e.count += 1;
      }
      if (e.count >= limit) {
        e.lockedUntil = now + this.lockoutMs;
      }
      this.entries.set(key, e);
      return e;
    };

    const pairEntry = updateKey(pairKey, this.maxFailuresPerPair);
    const acctEntry = updateKey(acctKey, this.maxFailuresPerIdentifier);
    const justLocked = pairEntry.lockedUntil > now || acctEntry.lockedUntil > now;
    const remainingAttempts = Math.max(0, this.maxFailuresPerPair - pairEntry.count);
    return { justLocked, remainingAttempts };
  }

  clearSuccess(identifier: string, ip: string) {
    const [pairKey, acctKey] = this.keys(identifier, ip);
    this.entries.delete(pairKey);
    this.entries.delete(acctKey);
  }
}

// ==============================================================
// HTTP SECURITY HEADERS & SENSITIVE FILE SHIELD
// ==============================================================
const BLOCKED_PATH_PATTERNS = [
  /\.sqlite($|-|\.)/i,
  /\.db($|\.)/i,
  /\/\.env/i,
  /\/\.git/i,
  /^\/backups(\/|$)/i,
  /^\/server\.ts$/i,
  /^\/package(-lock)?\.json$/i,
  /\.\.[/\\]/,
];

export function securityHeadersMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  // Block direct attempts to read DB files, backups, .env, .git, or traverse directories
  const decodedPath = (() => {
    try {
      return decodeURIComponent(req.path || '');
    } catch {
      return req.path || '';
    }
  })();

  if (BLOCKED_PATH_PATTERNS.some((re) => re.test(decodedPath) || re.test(req.originalUrl || ''))) {
    return res.status(404).json({ error: 'Not Found' });
  }

  // Baseline security headers (safe for embedded preview iframe on main SPA)
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), payment=(), usb=(), interest-cohort=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');

  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  if (isHttps) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Strict framing & no-cache policies for sensitive API responses
  if (req.path.startsWith('/api/')) {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'"
    );
  } else if (req.path.startsWith('/q/')) {
    // Hardened CSP for consumer QR verification page (allows embedded preview iframe)
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'"
    );
  }

  next();
}

// ==============================================================
// CSRF ORIGIN / HOST VERIFICATION MIDDLEWARE
// ==============================================================
export function csrfOriginGuardMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return next();
  }

  // Allow public QR consumer verification & telemetry endpoints
  const p = req.path;
  if (p === '/scans/record' || /^\/q\/[^/]+\/verify$/.test(p)) {
    return next();
  }

  const originHeader = typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
  const refererHeader = typeof req.headers.referer === 'string' ? req.headers.referer.trim() : '';
  const forwardedHost = typeof req.headers['x-forwarded-host'] === 'string' ? req.headers['x-forwarded-host'].split(',')[0].trim() : '';
  const requestHost = (forwardedHost || req.headers.host || '').toLowerCase();

  if (!requestHost) return next();

  const matchesHost = (urlStr: string): boolean => {
    try {
      const parsed = new URL(urlStr);
      const parsedHost = parsed.host.toLowerCase();
      if (parsedHost === requestHost) return true;
      const isLocalTarget = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/.test(requestHost);
      if (isLocalTarget && parsed.hostname.toLowerCase().endsWith('.run.app')) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  if (originHeader) {
    if (originHeader === 'null' || !matchesHost(originHeader)) {
      return res.status(403).json({
        success: false,
        error: 'Permintaan lintas domain (CSRF) ditolak oleh kebijakan keamanan server.',
      });
    }
  } else if (refererHeader && !matchesHost(refererHeader)) {
    return res.status(403).json({
      success: false,
      error: 'Sumber permintaan (Referer) tidak valid dan ditolak oleh kebijakan keamanan.',
    });
  }

  next();
}

// ==============================================================
// SAFE SERVER ERROR RESPONDER (NO STACK / SCHEMA LEAKAGE)
// ==============================================================
export function sendInternalError(
  res: express.Response,
  context: string,
  error: unknown,
  publicMessage = 'Terjadi kesalahan internal pada server. Silakan coba lagi.'
) {
  console.error(`[SECURITY/SERVER ERROR] ${context}:`, error);
  if (!res.headersSent) {
    res.status(500).json({ success: false, error: publicMessage });
  }
}
