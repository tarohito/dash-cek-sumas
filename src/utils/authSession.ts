// =====================================================================
// AUTH SESSION TOKEN HELPER & SAFE apiFetch WRAPPER
// Menyediakan autentikasi ganda (Cookie HttpOnly + Authorization Bearer)
// tanpa memodifikasi window.fetch (aman pada lingkungan browser dengan
// getter-only window.fetch maupun embedded preview iframe).
// =====================================================================

const SESSION_TOKEN_KEY = 'sumas_session_token';

let inMemoryToken: string | null = null;

export function getStoredSessionToken(): string | null {
  if (inMemoryToken) return inMemoryToken;
  try {
    const fromSession = window.sessionStorage.getItem(SESSION_TOKEN_KEY);
    if (fromSession) {
      inMemoryToken = fromSession;
      return fromSession;
    }
  } catch (_) {}
  try {
    const fromLocal = window.localStorage.getItem(SESSION_TOKEN_KEY);
    if (fromLocal) {
      inMemoryToken = fromLocal;
      return fromLocal;
    }
  } catch (_) {}
  return null;
}

export function setStoredSessionToken(token?: string | null, rememberMe = true): void {
  const cleaned = typeof token === 'string' ? token.trim() : '';
  if (!cleaned) {
    clearStoredSessionToken();
    return;
  }
  inMemoryToken = cleaned;
  try {
    if (rememberMe) {
      window.localStorage.setItem(SESSION_TOKEN_KEY, cleaned);
      window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
    } else {
      window.sessionStorage.setItem(SESSION_TOKEN_KEY, cleaned);
      window.localStorage.removeItem(SESSION_TOKEN_KEY);
    }
  } catch (_) {
    // Fallback ke inMemoryToken jika browser membatasi storage di iframe
  }
}

export function clearStoredSessionToken(): void {
  inMemoryToken = null;
  try {
    window.localStorage.removeItem(SESSION_TOKEN_KEY);
  } catch (_) {}
  try {
    window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
  } catch (_) {}
}

function isSameOriginApiRequest(input: RequestInfo | URL): boolean {
  try {
    const rawUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (!rawUrl) return false;
    if (rawUrl.startsWith('/api/')) return true;
    const parsed = new URL(rawUrl, window.location.origin);
    return parsed.origin === window.location.origin && parsed.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!isSameOriginApiRequest(input)) {
    return globalThis.fetch(input, init);
  }

  const token = getStoredSessionToken();
  const nextInit: RequestInit = {
    ...init,
    credentials: init?.credentials ?? 'same-origin',
  };

  if (token) {
    const baseHeaders =
      init?.headers ?? (input instanceof Request ? input.headers : undefined);
    const headers = new Headers(baseHeaders);
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    nextInit.headers = headers;
  }

  return globalThis.fetch(input, nextInit);
}
