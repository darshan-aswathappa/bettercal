import { loadForDate } from '$lib/server/availability.js';
import { loadForDate as loadClassroomsForDate } from '$lib/server/classrooms.js';
import { todayStr } from '$lib/format.js';
import { normalizeTab } from '$lib/filters.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Server-side render the first payload so the page paints rooms immediately
// (no "Loading…" flash). Only the active tab's data is loaded; the client
// refetches when the tab changes. Error handling lives in the loadForDate
// wrappers, which never throw; client refetches handle later date changes.
export async function load({ url }) {
  const param = url.searchParams.get('date');
  const date = param && DATE_RE.test(param) ? param : todayStr();
  const tab = normalizeTab(url.searchParams.get('tab') ?? '');
  const data = tab === 'classrooms' ? await loadClassroomsForDate(date) : await loadForDate(date);
  return { ...data, tab };
}
