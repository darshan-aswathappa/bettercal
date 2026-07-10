// Sorting for the room list. Pure and side-effect free so it can run in both
// SSR and the browser, and be unit-tested without a DOM.

import { parseTs } from './format.js';

/** The user-selectable sorts, default first. `value` doubles as the URL param. */
export const SORT_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'longest', label: 'Free for longest' },
  { value: 'capacity', label: 'Capacity' },
];

export const DEFAULT_SORT = 'name';

/** Coerce an untrusted sort key (URL/query) to a known one. */
export function normalizeSort(value) {
  return SORT_OPTIONS.some((o) => o.value === value) ? value : DEFAULT_SORT;
}

// Longest single free range in the room, in milliseconds. A room with no free
// ranges scores 0 so it sinks to the bottom of a "free for longest" sort.
function longestRangeMs(room) {
  return (room.ranges ?? []).reduce((max, r) => {
    const len = parseTs(r.end) - parseTs(r.start);
    return len > max ? len : max;
  }, 0);
}

/**
 * Return a new array of rooms ordered by the given sort key. Never mutates the
 * input. Unknown keys fall back to the default (name) sort.
 *
 * @param {Array<{name?:string, capacity?:number|null, ranges?:Array}>} rooms
 * @param {string} sortKey
 */
export function sortRooms(rooms, sortKey) {
  const list = [...rooms];
  switch (normalizeSort(sortKey)) {
    case 'longest':
      return list.sort((a, b) => longestRangeMs(b) - longestRangeMs(a));
    case 'capacity':
      // Largest rooms first; unknown capacity (null) sorts last.
      return list.sort((a, b) => (b.capacity ?? -1) - (a.capacity ?? -1));
    default:
      return list.sort((a, b) =>
        (a.name ?? '').localeCompare(b.name ?? '', undefined, { numeric: true })
      );
  }
}
