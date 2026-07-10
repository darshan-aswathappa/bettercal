// Watchlist client helpers: the browser's manage token + remembered email
// (localStorage, mirroring favorites.js — storage is always passed in so this
// stays SSR-safe and unit-testable), plus thin fetch wrappers over the
// watchlist API routes.

/** localStorage key holding this browser's watchlist manage token. */
export const WATCHLIST_TOKEN_KEY = 'snellview:watchlist-token';
/** localStorage key remembering the last email used to join a watchlist. */
export const WATCHLIST_EMAIL_KEY = 'snellview:watchlist-email';

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * The browser's manage token — created on first use, persisted, and reused so
 * all of this browser's watchlist entries stay reachable. Falls back to a
 * fresh per-call token if storage is unavailable (private mode / quota).
 *
 * @param {Storage|null|undefined} storage
 * @returns {string}
 */
export function getOrCreateToken(storage) {
  const fresh = () => crypto.randomUUID();
  if (!storage) return fresh();
  try {
    const existing = storage.getItem(WATCHLIST_TOKEN_KEY);
    if (existing && TOKEN_RE.test(existing)) return existing;
    const token = fresh();
    storage.setItem(WATCHLIST_TOKEN_KEY, token);
    return token;
  } catch {
    return fresh();
  }
}

/**
 * @param {Storage|null|undefined} storage
 * @returns {string} last email used, or ''
 */
export function loadEmail(storage) {
  if (!storage) return '';
  try {
    return storage.getItem(WATCHLIST_EMAIL_KEY) ?? '';
  } catch {
    return '';
  }
}

/**
 * @param {Storage|null|undefined} storage
 * @param {string} email
 */
export function saveEmail(storage, email) {
  if (!storage) return;
  try {
    storage.setItem(WATCHLIST_EMAIL_KEY, email);
  } catch {
    // best-effort; a failed write shouldn't break the join flow
  }
}

/**
 * Idempotency key for one join submission. Generate ONCE per distinct
 * submission and reuse it across retries of that submission (double-clicks,
 * timeouts) so the server returns the same watchlist instead of a duplicate.
 */
export function newRequestId() {
  return crypto.randomUUID();
}

async function post(path, body, fetchFn) {
  const res = await fetchFn(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await res.json();
  if (!res.ok || !payload.ok) {
    throw new Error(payload.error || `Request failed (${res.status})`);
  }
  return payload;
}

/**
 * Join a watchlist. Resolves to {ok, watchlistId, groupId, dedup}.
 *
 * @param {{date:string, from:string, to:string, style?:string, capacity?:string,
 *          email:string, token:string, requestId:string}} entry
 * @param {typeof fetch} [fetchFn]
 */
export function joinWatchlist(entry, fetchFn = fetch) {
  return post('/api/watchlist', entry, fetchFn);
}

/**
 * All of this browser's entries (any status), newest first.
 *
 * @param {string} token
 * @param {typeof fetch} [fetchFn]
 * @returns {Promise<Array<object>>}
 */
export async function listWatchlists(token, fetchFn = fetch) {
  const res = await fetchFn(`/api/watchlist?token=${encodeURIComponent(token)}`);
  const payload = await res.json();
  if (!res.ok || !payload.ok) {
    throw new Error(payload.error || `Request failed (${res.status})`);
  }
  return payload.entries;
}

/**
 * Cancel one ACTIVE entry owned by this token.
 *
 * @param {string} id watchlist id
 * @param {string} token
 * @param {typeof fetch} [fetchFn]
 */
export function cancelWatchlist(id, token, fetchFn = fetch) {
  return post('/api/watchlist/cancel', { id, token }, fetchFn);
}
