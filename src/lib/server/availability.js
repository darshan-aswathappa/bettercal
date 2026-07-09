// Availability builder: combines LibCal room metadata with the parsed free
// ranges for a date, behind a small in-memory TTL cache. Extracted from the
// old Node http server so the SvelteKit endpoint and the SSR load can share it.

import { fetchRooms as realFetchRooms, fetchGrid as realFetchGrid } from './libcal.js';
import { freeRangesByRoom, rangesForDate } from '../slots.js';

const ROOMS_TTL_MS = 60 * 60 * 1000; // room metadata changes rarely
const GRID_TTL_MS = 30 * 1000; // availability changes constantly

export function nextDay(date) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Create an availability service with its own cache. The LibCal client and
 * clock are injectable so the cache and payload can be tested in isolation.
 *
 * @param {object} deps
 * @param {() => Promise<Array>} deps.fetchRooms
 * @param {(start: string, end: string) => Promise<Array>} deps.fetchGrid
 * @param {() => number} [deps.now]
 */
export function createAvailabilityService({
  fetchRooms = realFetchRooms,
  fetchGrid = realFetchGrid,
  now = () => Date.now(),
} = {}) {
  const cache = new Map();

  async function cached(key, ttlMs, loader) {
    const hit = cache.get(key);
    if (hit && now() - hit.at < ttlMs) return hit.value;
    const value = await loader();
    cache.set(key, { at: now(), value });
    return value;
  }

  /** @param {string} date YYYY-MM-DD */
  async function buildAvailability(date) {
    const [rooms, slots] = await Promise.all([
      cached('rooms', ROOMS_TTL_MS, fetchRooms),
      cached(`grid:${date}`, GRID_TTL_MS, () => fetchGrid(date, nextDay(date))),
    ]);

    const ranges = freeRangesByRoom(slots);
    const payload = rooms.map((room) => ({
      ...room,
      ranges: rangesForDate(ranges.get(room.eid) ?? [], date),
    }));

    return {
      ok: true,
      date,
      generatedAt: new Date(now()).toISOString(),
      rooms: payload,
    };
  }

  // SSR-friendly wrapper: never throws, so a LibCal outage renders an error
  // state instead of a 500 page. Shape mirrors what +page.server.js returns.
  async function loadForDate(date) {
    try {
      const initial = await buildAvailability(date);
      return { date, initial, error: null };
    } catch (err) {
      console.error(`[bettercal] availability for ${date} failed:`, err);
      return { date, initial: null, error: 'Could not reach LibCal. Try again shortly.' };
    }
  }

  return { buildAvailability, loadForDate };
}

// Production singleton used by the endpoint and SSR load.
export const { buildAvailability, loadForDate } = createAvailabilityService();
