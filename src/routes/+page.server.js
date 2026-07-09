import { loadForDate } from '$lib/server/availability.js';
import { todayStr } from '$lib/format.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Server-side render the first payload so the page paints rooms immediately
// (no "Loading…" flash). Error handling lives in loadForDate, which never
// throws; client refetches handle later date changes / refreshes.
export async function load({ url }) {
  const param = url.searchParams.get('date');
  const date = param && DATE_RE.test(param) ? param : todayStr();
  return loadForDate(date);
}
