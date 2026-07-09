import { test, expect, vi } from 'vitest';
import { createAvailabilityService, nextDay } from './availability.js';

const ROOMS = [
  { eid: 101, gid: 0, name: 'Group Study 130S', grouping: 'Group Study Rooms', capacity: 6, bookUrl: 'https://x/101' },
  { eid: 102, gid: 0, name: 'Silent 200', grouping: 'Individual Silent Study', capacity: 1, bookUrl: 'https://x/102' },
];

// itemId matches room eid; two contiguous free slots for 101, none for 102.
const SLOTS = [
  { start: '2026-07-09 09:00:00', end: '2026-07-09 09:15:00', itemId: 101 },
  { start: '2026-07-09 09:15:00', end: '2026-07-09 09:30:00', itemId: 101 },
];

function makeDeps() {
  return {
    fetchRooms: vi.fn().mockResolvedValue(ROOMS),
    fetchGrid: vi.fn().mockResolvedValue(SLOTS),
    now: () => 1_000,
  };
}

test('nextDay advances the calendar day', () => {
  expect(nextDay('2026-07-09')).toBe('2026-07-10');
  expect(nextDay('2026-12-31')).toBe('2027-01-01');
});

test('buildAvailability returns the room payload with merged ranges', async () => {
  const deps = makeDeps();
  const { buildAvailability } = createAvailabilityService(deps);

  const result = await buildAvailability('2026-07-09');

  expect(result.ok).toBe(true);
  expect(result.date).toBe('2026-07-09');
  expect(result.generatedAt).toBe(new Date(1_000).toISOString());
  expect(result.rooms).toEqual([
    { ...ROOMS[0], ranges: [{ start: '2026-07-09 09:00:00', end: '2026-07-09 09:30:00' }] },
    { ...ROOMS[1], ranges: [] },
  ]);
});

test('passes the [date, nextDay) window to fetchGrid', async () => {
  const deps = makeDeps();
  const { buildAvailability } = createAvailabilityService(deps);

  await buildAvailability('2026-07-09');

  expect(deps.fetchGrid).toHaveBeenCalledWith('2026-07-09', '2026-07-10');
});

test('caches within TTL: repeated calls do not refetch', async () => {
  const deps = makeDeps();
  const { buildAvailability } = createAvailabilityService(deps);

  await buildAvailability('2026-07-09');
  await buildAvailability('2026-07-09');

  // rooms (1h TTL) and grid (30s TTL) both cached at now=1000, second call at now=1000
  expect(deps.fetchRooms).toHaveBeenCalledTimes(1);
  expect(deps.fetchGrid).toHaveBeenCalledTimes(1);
});

test('refetches the grid once its TTL has elapsed', async () => {
  let clock = 0;
  const deps = { ...makeDeps(), now: () => clock };
  const { buildAvailability } = createAvailabilityService(deps);

  await buildAvailability('2026-07-09');
  clock = 31_000; // past the 30s grid TTL, within the 1h rooms TTL
  await buildAvailability('2026-07-09');

  expect(deps.fetchGrid).toHaveBeenCalledTimes(2);
  expect(deps.fetchRooms).toHaveBeenCalledTimes(1);
});

test('loadForDate wraps a successful build with initial + null error', async () => {
  const deps = makeDeps();
  const { loadForDate } = createAvailabilityService(deps);

  const result = await loadForDate('2026-07-09');

  expect(result.date).toBe('2026-07-09');
  expect(result.error).toBeNull();
  expect(result.initial.ok).toBe(true);
});

test('loadForDate never throws: an upstream failure becomes a friendly error', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const deps = {
    fetchRooms: vi.fn().mockResolvedValue(ROOMS),
    fetchGrid: vi.fn(() => Promise.reject(new Error('LibCal down'))),
    now: () => 0,
  };
  const { loadForDate } = createAvailabilityService(deps);

  const result = await loadForDate('2026-07-09');

  expect(result).toEqual({
    date: '2026-07-09',
    initial: null,
    error: 'Could not reach LibCal. Try again shortly.',
  });
});
