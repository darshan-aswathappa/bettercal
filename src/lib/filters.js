// Client-side filtering of the availability payload. Lifted from public/app.js
// and reshaped to take plain values instead of reading DOM inputs directly.

import { parseTs } from './format.js';
import { normalizeSort, DEFAULT_SORT } from './sort.js';

export const CAPACITY_BANDS = {
  '1-4': [1, 4],
  '5-8': [5, 8],
};

// Known LibCal room groupings at Snell. Single source for the Filters
// dropdown and the watchlist API's style whitelist.
export const STYLES = [
  'Group Study Rooms',
  'Graduate Group Study Rooms',
  'Individual Study',
  'Individual Silent Study',
];

// LibCal's Snell study-room booking bounds: it refuses anything shorter than
// 30 minutes and caps a single booking at 3 hours. We enforce the same limits
// so a window bettercal shows as "free" is one LibCal will actually let you book.
export const MIN_BOOKING_MINUTES = 30;
export const MAX_BOOKING_MINUTES = 180;

const WINDOW_ERRORS = {
  inverted: 'End time must be after start time.',
  'too-short': `LibCal needs at least ${MIN_BOOKING_MINUTES} minutes — widen your window.`,
  'too-long': `LibCal caps bookings at 3 hours — shorten your window.`,
};

/** User-facing message for a getWindow() reason, or '' when the window is fine. */
export function windowErrorMessage(reason) {
  return WINDOW_ERRORS[reason] ?? '';
}

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
 * `bookingRules` enforces LibCal's 30-minute/3-hour booking caps — meaningful
 * only for bookable library rooms; the classrooms tab passes false since those
 * rooms aren't LibCal-bookable and any window length is a valid search.
 *
 * @param {{date: string, from: string, to: string}} state
 * @param {{bookingRules?: boolean}} [options]
 */
export function getWindow({ date, from, to } = {}, { bookingRules = true } = {}) {
  if (!from) return null;
  const start = `${date} ${from}:00`;
  const end = to ? `${date} ${to}:00` : null;
  const reason = windowReason(start, end, bookingRules);
  return { from: start, to: end, invalid: reason != null, reason };
}

// Classify a built window. Open-ended windows (no end) are a search
// convenience, not a booking, so only the min/max caps on a concrete end
// matter here — and only when LibCal's booking rules apply at all.
function windowReason(start, end, bookingRules) {
  if (end == null) return null;
  if (end <= start) return 'inverted';
  if (!bookingRules) return null;
  const minutes = (parseTs(end) - parseTs(start)) / 60000;
  if (minutes < MIN_BOOKING_MINUTES) return 'too-short';
  if (minutes > MAX_BOOKING_MINUTES) return 'too-long';
  return null;
}

/** The two tabs of the app; 'library' is the default and never serialized. */
export const TABS = ['library', 'classrooms'];
export const DEFAULT_TAB = 'library';

/** Coerce an untrusted tab key (URL/query) to a known one. */
export function normalizeTab(value) {
  return TABS.includes(value) ? value : DEFAULT_TAB;
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
  const sort = normalizeSort(params.get('sort') ?? '');
  const tab = normalizeTab(params.get('tab') ?? '');
  return { from, to, style, capacity, sort, tab };
}

/**
 * Serialize the current filter state to a query string, mirroring app.js's
 * syncUrl: omit today's date, drop "to" without "from", drop empty values.
 *
 * @param {{tab, date, from, to, style, capacity, sort}} state
 * @param {string} today YYYY-MM-DD
 */
export function buildFilterQuery({ tab, date, from, to, style, capacity, sort }, today) {
  const params = new URLSearchParams();
  if (tab && tab !== DEFAULT_TAB) params.set('tab', tab);
  if (date && date !== today) params.set('date', date);
  if (from) params.set('from', from);
  if (to && from) params.set('to', to);
  if (style) params.set('style', style);
  if (capacity) params.set('capacity', capacity);
  if (sort && sort !== DEFAULT_SORT) params.set('sort', sort);
  return params.toString();
}
