// Favorite (starred) rooms: pure helpers plus small localStorage-backed
// load/save wrappers. Kept side-effect free (storage is passed in) so it runs
// safely under SSR and is unit-testable without a DOM.

/** localStorage key holding the JSON array of favorited room ids. */
export const FAVORITES_KEY = 'snellview:favorites';

/**
 * Stable identity for a room. Mirrors the `room.eid ?? room.name` key used
 * everywhere else in the UI, coerced to a string so it survives JSON round-trips.
 *
 * @param {{eid?: number|string|null, name?: string}} room
 * @returns {string}
 */
export function roomId(room) {
  return String(room.eid ?? room.name);
}

/**
 * @param {string[]} ids currently-favorited room ids
 * @param {{eid?: number|string|null, name?: string}} room
 * @returns {boolean}
 */
export function hasFavorite(ids, room) {
  return ids.includes(roomId(room));
}

/**
 * Add or remove a room from the favorites list, returning a new array. Never
 * mutates the input.
 *
 * @param {string[]} ids
 * @param {{eid?: number|string|null, name?: string}} room
 * @returns {string[]}
 */
export function toggleFavorite(ids, room) {
  const id = roomId(room);
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/**
 * Return a new array with favorited rooms floated to the top, preserving the
 * incoming order within both the favorited and non-favorited groups (stable).
 *
 * @template {{eid?: number|string|null, name?: string}} R
 * @param {R[]} rooms already-sorted rooms
 * @param {string[]} ids favorited room ids
 * @returns {R[]}
 */
export function pinFavoritesFirst(rooms, ids) {
  if (ids.length === 0) return [...rooms];
  const favs = rooms.filter((r) => ids.includes(roomId(r)));
  const rest = rooms.filter((r) => !ids.includes(roomId(r)));
  return [...favs, ...rest];
}

/**
 * Read the favorites list from a Storage-like object. Tolerates missing
 * storage, absent keys, corrupt JSON, and non-array/non-string payloads —
 * always returning a clean string array.
 *
 * @param {Storage|null|undefined} storage
 * @returns {string[]}
 */
export function loadFavorites(storage) {
  if (!storage) return [];
  try {
    const raw = storage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => typeof x === 'string');
  } catch {
    return [];
  }
}

/**
 * Persist the favorites list to a Storage-like object. No-ops (never throws) if
 * storage is unavailable or writing fails (e.g. private mode / quota).
 *
 * @param {Storage|null|undefined} storage
 * @param {string[]} ids
 */
export function saveFavorites(storage, ids) {
  if (!storage) return;
  try {
    storage.setItem(FAVORITES_KEY, JSON.stringify(ids));
  } catch {
    // Best-effort persistence; a failed write shouldn't break the UI.
  }
}
