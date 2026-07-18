import { test, expect, vi } from 'vitest';
import { createClassroomService } from './classrooms.js';

const H = (h, m = 0) => h * 3600 + m * 60;

const NAMES = ['Ryder Hall 126', 'Snell Library 005', 'EXP 320'];

const SCHEDULES = {
  'Ryder Hall 126': {
    tuesday: [{ startDate: '2026-05-06', endDate: '2026-08-16', time: { start: H(17, 50), end: H(20, 20) } }],
  },
  'Snell Library 005': {},
  'EXP 320': {
    friday: [{ startDate: '2026-05-06', endDate: '2026-08-16', time: { start: H(9), end: H(10) } }],
  },
};

function makeDeps() {
  return {
    fetchList: vi.fn().mockResolvedValue(NAMES),
    fetchSchedule: vi.fn((name) => Promise.resolve(SCHEDULES[name])),
    now: () => 1_000,
  };
}

test('buildAvailability returns the classroom payload with computed free ranges', async () => {
  const deps = makeDeps();
  const { buildAvailability } = createClassroomService(deps);

  const result = await buildAvailability('2026-07-17'); // a Friday

  expect(result.ok).toBe(true);
  expect(result.date).toBe('2026-07-17');
  expect(result.generatedAt).toBe(new Date(1_000).toISOString());
  expect(result.rooms).toEqual([
    {
      name: 'Ryder Hall 126',
      grouping: 'Ryder Hall',
      capacity: null,
      bookUrl: null,
      // Tuesday-only class; Friday is free for the whole open window.
      ranges: [{ start: '2026-07-17 07:00:00', end: '2026-07-17 23:00:00' }],
    },
    {
      name: 'Snell Library 005',
      grouping: 'Snell Library',
      capacity: null,
      bookUrl: null,
      ranges: [{ start: '2026-07-17 07:00:00', end: '2026-07-17 23:00:00' }],
    },
    {
      name: 'EXP 320',
      grouping: 'EXP',
      capacity: null,
      bookUrl: null,
      ranges: [
        { start: '2026-07-17 07:00:00', end: '2026-07-17 09:00:00' },
        { start: '2026-07-17 10:00:00', end: '2026-07-17 23:00:00' },
      ],
    },
  ]);
});

test('cold start fetches every room once, then serves from cache within the TTL', async () => {
  const deps = makeDeps();
  const { buildAvailability } = createClassroomService(deps);

  await buildAvailability('2026-07-17');
  await buildAvailability('2026-07-18');

  expect(deps.fetchList).toHaveBeenCalledTimes(1);
  expect(deps.fetchSchedule).toHaveBeenCalledTimes(3);
});

test('concurrent cold-start callers share a single warm', async () => {
  const deps = makeDeps();
  const { buildAvailability } = createClassroomService(deps);

  const [a, b] = await Promise.all([
    buildAvailability('2026-07-17'),
    buildAvailability('2026-07-17'),
  ]);

  expect(a.rooms).toHaveLength(3);
  expect(b.rooms).toHaveLength(3);
  expect(deps.fetchList).toHaveBeenCalledTimes(1);
  expect(deps.fetchSchedule).toHaveBeenCalledTimes(3);
});

test('the warm respects the concurrency limit', async () => {
  const names = Array.from({ length: 20 }, (_, i) => `Hall ${i}`);
  let inFlight = 0;
  let maxInFlight = 0;
  const deps = {
    fetchList: vi.fn().mockResolvedValue(names),
    fetchSchedule: vi.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return {};
    }),
    now: () => 1_000,
  };
  const { buildAvailability } = createClassroomService(deps);

  await buildAvailability('2026-07-17');

  expect(deps.fetchSchedule).toHaveBeenCalledTimes(20);
  expect(maxInFlight).toBeGreaterThan(1); // actually parallel
  expect(maxInFlight).toBeLessThanOrEqual(8); // but bounded
});

test('past the TTL it serves stale schedules and re-warms in the background', async () => {
  let clock = 1_000;
  const deps = { ...makeDeps(), now: () => clock };
  const { buildAvailability } = createClassroomService(deps);

  await buildAvailability('2026-07-17');
  expect(deps.fetchSchedule).toHaveBeenCalledTimes(3);

  clock += 25 * 60 * 60 * 1000; // past the 24h TTL
  const stale = await buildAvailability('2026-07-17');
  expect(stale.rooms).toHaveLength(3); // served immediately from cache

  await vi.waitFor(() => expect(deps.fetchSchedule).toHaveBeenCalledTimes(6));
});

test('a room whose schedule fetch fails is dropped from the payload and retried later', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  let clock = 1_000;
  const deps = {
    fetchList: vi.fn().mockResolvedValue(NAMES),
    fetchSchedule: vi.fn((name) =>
      name === 'EXP 320' ? Promise.reject(new Error('upstream 500')) : Promise.resolve(SCHEDULES[name])
    ),
    now: () => clock,
  };
  const { buildAvailability } = createClassroomService(deps);

  const first = await buildAvailability('2026-07-17');
  expect(first.rooms.map((r) => r.name)).toEqual(['Ryder Hall 126', 'Snell Library 005']);

  // The failed room was never cached, so the next build re-warms it.
  deps.fetchSchedule.mockImplementation((name) => Promise.resolve(SCHEDULES[name]));
  const second = await buildAvailability('2026-07-17');
  await vi.waitFor(() => {
    expect(deps.fetchSchedule).toHaveBeenCalledWith('EXP 320');
  });
  expect(second.rooms.map((r) => r.name)).toEqual(['Ryder Hall 126', 'Snell Library 005']);

  const third = await buildAvailability('2026-07-17');
  expect(third.rooms.map((r) => r.name)).toEqual(NAMES);
});

test('loadForDate wraps a successful build with initial + null error', async () => {
  const deps = makeDeps();
  const { loadForDate } = createClassroomService(deps);

  const result = await loadForDate('2026-07-17');

  expect(result.date).toBe('2026-07-17');
  expect(result.error).toBeNull();
  expect(result.initial.ok).toBe(true);
});

test('loadForDate never throws: an upstream failure becomes a friendly error', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const deps = {
    fetchList: vi.fn(() => Promise.reject(new Error('rooms.lftq.in down'))),
    fetchSchedule: vi.fn(),
    now: () => 0,
  };
  const { loadForDate } = createClassroomService(deps);

  const result = await loadForDate('2026-07-17');

  expect(result).toEqual({
    date: '2026-07-17',
    initial: null,
    error: 'Could not load classroom schedules. Try again shortly.',
  });
});
