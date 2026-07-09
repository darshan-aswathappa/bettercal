// Client-side filtering of the availability payload. Lifted from public/app.js
// and reshaped to take plain values instead of reading DOM inputs directly.

export const CAPACITY_BANDS = {
  '1-4': [1, 4],
  '5-8': [5, 8],
};

/**
 * @param {Array<{grouping?:string, capacity?:number|null}>} rooms
 * @param {{style?: string, capacity?: string}} filter
 */
export function applyFilters(rooms, { style, capacity } = {}) {
  const band = capacity ? CAPACITY_BANDS[capacity] : undefined;
  return rooms.filter((room) => {
    if (style && room.grouping !== style) return false;
    if (band && (room.capacity == null || room.capacity < band[0] || room.capacity > band[1])) {
      return false;
    }
    return true;
  });
}

/**
 * Read the From/To time filter. Returns null when no time window is set.
 * `from`/`to` in the result are LibCal-style "YYYY-MM-DD HH:mm:ss" strings.
 *
 * @param {{date: string, from: string, to: string}} state
 */
export function getWindow({ date, from, to } = {}) {
  if (!from) return null;
  const start = `${date} ${from}:00`;
  const end = to ? `${date} ${to}:00` : null;
  const invalid = end != null && end <= start;
  return { from: start, to: end, invalid };
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Validate filter values coming from the URL query string (untrusted). Returns
 * empty strings for anything malformed so a shared link can't inject junk.
 *
 * @param {URLSearchParams} params
 */
export function readFilterParams(params) {
  const from = TIME_RE.test(params.get('from') ?? '') ? params.get('from') : '';
  const to = TIME_RE.test(params.get('to') ?? '') ? params.get('to') : '';
  const style = params.get('style') ?? '';
  const capacityRaw = params.get('capacity') ?? '';
  const capacity = Object.prototype.hasOwnProperty.call(CAPACITY_BANDS, capacityRaw)
    ? capacityRaw
    : '';
  return { from, to, style, capacity };
}

/**
 * Serialize the current filter state to a query string, mirroring app.js's
 * syncUrl: omit today's date, drop "to" without "from", drop empty values.
 *
 * @param {{date, from, to, style, capacity}} state
 * @param {string} today YYYY-MM-DD
 */
export function buildFilterQuery({ date, from, to, style, capacity }, today) {
  const params = new URLSearchParams();
  if (date && date !== today) params.set('date', date);
  if (from) params.set('from', from);
  if (to && from) params.set('to', to);
  if (style) params.set('style', style);
  if (capacity) params.set('capacity', capacity);
  return params.toString();
}
