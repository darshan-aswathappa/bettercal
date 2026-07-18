// Classroom availability service: combines the rooms.lftq.in room list with
// per-room class schedules behind a two-tier in-memory cache, then projects
// free ranges for a date. Mirrors availability.js (LibCal) in shape so the
// SvelteKit endpoint and SSR load can share it, and so the client sees the
// exact same payload structure for both tabs.
//
// Upstream serves Cache-Control: max-age=86400 — semester schedules change
// rarely — so both tiers use a 24h TTL. The first request warms the schedule
// cache (~195 rooms, fetched with bounded concurrency); later TTL expiries
// re-warm in the background (stale-while-revalidate) so no user request ever
// blocks on a full refresh.

import { parseRoomName, freeRangesForDate } from '../classrooms.js';

export const CLASSROOMS_BASE = 'https://rooms.lftq.in';

const LIST_TTL_MS = 24 * 60 * 60 * 1000;
const SCHEDULE_TTL_MS = 24 * 60 * 60 * 1000;
const WARM_CONCURRENCY = 8;

/** Fetch the array of room names ("Building Name 307"). */
export async function fetchRoomList(base = CLASSROOMS_BASE) {
  const res = await fetch(`${base}/api/rooms`);
  if (!res.ok) {
    throw new Error(`rooms.lftq.in rooms list returned ${res.status}`);
  }
  const names = await res.json();
  if (!Array.isArray(names) || names.length === 0) {
    throw new Error('Unexpected rooms list response shape');
  }
  return names;
}

/** Fetch one room's weekday-keyed schedule of recurring class blocks. */
export async function fetchRoomSchedule(name, base = CLASSROOMS_BASE) {
  const res = await fetch(`${base}/api/room/${encodeURIComponent(name)}`);
  if (!res.ok) {
    throw new Error(`rooms.lftq.in schedule for ${name} returned ${res.status}`);
  }
  return res.json();
}

// Minimal promise pool: run fn over items with at most `limit` in flight.
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Create a classroom availability service with its own cache. The upstream
 * client and clock are injectable so the cache and payload can be tested in
 * isolation.
 *
 * @param {object} deps
 * @param {() => Promise<string[]>} deps.fetchList
 * @param {(name: string) => Promise<object>} deps.fetchSchedule
 * @param {() => number} [deps.now]
 */
export function createClassroomService({
  fetchList = fetchRoomList,
  fetchSchedule = fetchRoomSchedule,
  now = () => Date.now(),
} = {}) {
  let listCache = null; // { at, names }
  let listPromise = null; // in-flight list fetch, shared by concurrent callers
  const schedules = new Map(); // name -> { at, data }
  let warming = null; // single-flight warm promise

  async function roomNames() {
    if (listCache && now() - listCache.at < LIST_TTL_MS) return listCache.names;
    if (!listPromise) {
      listPromise = fetchList()
        .then((names) => {
          listCache = { at: now(), names };
          return names;
        })
        .finally(() => {
          listPromise = null;
        });
    }
    return listPromise;
  }

  const isFresh = (name) => {
    const hit = schedules.get(name);
    return hit && now() - hit.at < SCHEDULE_TTL_MS;
  };

  // Fetch every missing/stale schedule. Single-flight: concurrent callers
  // share one warm. A room that fails stays uncached (retried on the next
  // warm) rather than sinking the whole refresh.
  function warm() {
    if (warming) return warming;
    warming = (async () => {
      try {
        const names = await roomNames();
        const stale = names.filter((name) => !isFresh(name));
        await mapLimit(stale, WARM_CONCURRENCY, async (name) => {
          try {
            const data = await fetchSchedule(name);
            schedules.set(name, { at: now(), data });
          } catch (err) {
            console.error(`[snellview] classroom schedule for ${name} failed:`, err);
          }
        });
      } finally {
        warming = null;
      }
    })();
    return warming;
  }

  /** @param {string} date YYYY-MM-DD */
  async function buildAvailability(date) {
    const names = await roomNames();
    if (!names.every(isFresh)) {
      if (schedules.size === 0) {
        // Cold start: block so the first payload is complete.
        await warm();
      } else {
        // Stale-while-revalidate: serve what's cached, refresh behind it.
        warm().catch((err) => console.error('[snellview] classroom re-warm failed:', err));
      }
    }

    const rooms = names
      .filter((name) => schedules.has(name))
      .map((name) => ({
        name,
        grouping: parseRoomName(name).building,
        capacity: null,
        bookUrl: null,
        ranges: freeRangesForDate(schedules.get(name).data, date),
      }));

    return {
      ok: true,
      date,
      generatedAt: new Date(now()).toISOString(),
      rooms,
    };
  }

  // SSR-friendly wrapper: never throws, so an upstream outage renders an error
  // state instead of a 500 page. Shape mirrors availability.js's loadForDate.
  async function loadForDate(date) {
    try {
      const initial = await buildAvailability(date);
      return { date, initial, error: null };
    } catch (err) {
      console.error(`[snellview] classroom availability for ${date} failed:`, err);
      return { date, initial: null, error: 'Could not load classroom schedules. Try again shortly.' };
    }
  }

  return { buildAvailability, loadForDate };
}

// Production singleton used by the endpoint and SSR load.
export const { buildAvailability, loadForDate } = createClassroomService();
