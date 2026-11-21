// ==============================================================
// DYNAMIC USER & BRAND INITIALS AVATAR UTILITIES
// Generates deterministic vibrant palette colors and 2-letter initials
// when an account or brand does not have an uploaded photo/logo.
// ==============================================================

const AVATAR_PALETTE_HEX = [
  'c28e62', // Warm Copper (Brand accent)
  '2563eb', // Royal Blue
  '059669', // Emerald
  '7c3aed', // Violet
  'e11d48', // Rose
  'd97706', // Amber
  '0891b2', // Cyan
  'db2777', // Pink
  '4f46e5', // Indigo
  '0d9488', // Teal
];

/**
 * Extracts crisp 2-letter initials from a person or brand name:
 * - Multi-word: first letter of first word + first letter of last word ("Budi Santoso" -> "BS")
 * - Single-word: first two characters ("Rina" -> "RI")
 */
export function getInitials(name?: string | null, fallback = 'U'): string {
  const cleaned = String(name || '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return fallback;
  const parts = cleaned.split(' ').filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase() || fallback;
}

/**
 * Computes a deterministic vibrant background hex color (without `#`) from a seed
 * such as user ID, email, or display name.
 */
export function getAvatarColorHex(seed?: string | null): string {
  const key = String(seed || '').trim().toLowerCase();
  if (!key) return AVATAR_PALETTE_HEX[0];
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const index = Math.abs(hash) % AVATAR_PALETTE_HEX.length;
  return AVATAR_PALETTE_HEX[index];
}

export function getAvatarColorCss(seed?: string | null): string {
  return `#${getAvatarColorHex(seed)}`;
}

export function getInitialsAvatar(
  name?: string | null,
  seed?: string | null,
  bgHex?: string
): string {
  const initials = getInitials(name, 'U');
  const hex = (bgHex || getAvatarColorHex(seed || name)).replace(/^#/, '');
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="50" fill="%23${hex}"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="%23ffffff" font-family="sans-serif" font-weight="bold" font-size="38">${initials}</text></svg>`;
}

export function getBrandInitialsLogo(
  name?: string | null,
  seed?: string | null,
  bgHex?: string
): string {
  const initials = getInitials(name, 'B');
  const hex = (bgHex || getAvatarColorHex(seed || name)).replace(/^#/, '');
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%23${hex}"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="%23ffffff" font-family="sans-serif" font-weight="bold" font-size="38">${initials}</text></svg>`;
}
