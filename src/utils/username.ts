// ==============================================================
// SHARED USERNAME VALIDATION & NORMALIZATION UTILITIES
// Used consistently by Frontend, Express backend, and Cloudflare Functions.
// ==============================================================

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

// Technical/route keywords reserved to avoid ambiguity with system routes/placeholders
const RESERVED_USERNAMES = new Set([
  'null',
  'undefined',
  'root',
  'system',
  'api',
  'auth',
  'login',
  'logout',
  'me',
  'anonymous',
]);

export interface UsernameRuleChecks {
  length: boolean;
  allowedChars: boolean;
  edgeAlnum: boolean;
  noConsecutiveSep: boolean;
  notReserved: boolean;
}

export interface UsernameValidationResult {
  valid: boolean;
  normalized: string;
  error?: string;
  checks: UsernameRuleChecks;
}

/**
 * Normalizes raw user input for username fields: trims whitespace, lowercases,
 * strips leading `@` prefixes, and removes internal whitespace.
 */
export function normalizeUsernameInput(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/\s+/g, '');
}

/**
 * Generates a compliant username slug suggestion from a display name.
 */
export function slugifyUsername(name: string): string {
  const ascii = String(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\.+|\.+$/g, '');

  return ascii.slice(0, USERNAME_MAX_LENGTH).replace(/\.+$/g, '');
}

/**
 * Validates a username against standard rules:
 * - 3 to 30 characters
 * - lowercase letters (a-z), digits (0-9), dot (.), underscore (_), hyphen (-)
 * - starts and ends with alphanumeric character [a-z0-9]
 * - no consecutive separators (e.g., .., __, --, ._)
 * - not a reserved technical keyword
 */
export function validateUsernameFormat(raw: unknown): UsernameValidationResult {
  const normalized = normalizeUsernameInput(raw);

  const length =
    normalized.length >= USERNAME_MIN_LENGTH &&
    normalized.length <= USERNAME_MAX_LENGTH;
  const allowedChars = normalized.length > 0 && /^[a-z0-9._-]+$/.test(normalized);
  const edgeAlnum =
    normalized.length > 0 &&
    /^[a-z0-9]/.test(normalized) &&
    /[a-z0-9]$/.test(normalized);
  const noConsecutiveSep = normalized.length > 0 && !/[._-]{2}/.test(normalized);
  const notReserved = normalized.length > 0 && !RESERVED_USERNAMES.has(normalized);

  const checks: UsernameRuleChecks = {
    length,
    allowedChars,
    edgeAlnum,
    noConsecutiveSep,
    notReserved,
  };

  if (!normalized) {
    return { valid: false, normalized, error: 'Username wajib diisi.', checks };
  }
  if (!allowedChars) {
    return {
      valid: false,
      normalized,
      error: 'Hanya boleh huruf kecil (a-z), angka (0-9), titik (.), garis bawah (_), atau tanda hubung (-).',
      checks,
    };
  }
  if (!edgeAlnum) {
    return {
      valid: false,
      normalized,
      error: 'Harus diawali dan diakhiri huruf atau angka (tidak boleh diawali/diakhiri ., _, -).',
      checks,
    };
  }
  if (!noConsecutiveSep) {
    return {
      valid: false,
      normalized,
      error: 'Tidak boleh ada dua tanda pemisah berurutan (mis. .., __, --, ._).',
      checks,
    };
  }
  if (!length) {
    return {
      valid: false,
      normalized,
      error: `Panjang username harus ${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} karakter.`,
      checks,
    };
  }
  if (!notReserved) {
    return {
      valid: false,
      normalized,
      error: 'Username tersebut termasuk kata sistem yang tidak dapat digunakan.',
      checks,
    };
  }

  return { valid: true, normalized, checks };
}
