import { test, expect } from 'vitest';
import { SORT_OPTIONS, DEFAULT_SORT, normalizeSort, sortRooms } from './sort.js';

const rooms = [
  {
    name: 'Group Study 220',
    capacity: 4,
    ranges: [{ start: '2026-07-09 09:00:00', end: '2026-07-09 10:00:00' }], // 1h
  },
  {
    name: 'Group Study 130S',
    capacity: 8,
    ranges: [
      { start: '2026-07-09 09:00:00', end: '2026-07-09 11:00:00' }, // 2h
      { start: '2026-07-09 14:00:00', end: '2026-07-09 15:00:00' }, // 1h
    ],
  },
  {
    name: 'Silent 200',
    capacity: null,
    ranges: [{ start: '2026-07-09 10:00:00', end: '2026-07-09 13:00:00' }], // 3h
  },
];

test('SORT_OPTIONS exposes the three documented sorts with the default first', () => {
  expect(SORT_OPTIONS.map((o) => o.value)).toEqual(['name', 'longest', 'capacity']);
  expect(DEFAULT_SORT).toBe('name');
});

test('normalizeSort accepts known keys and falls back to the default for junk', () => {
  expect(normalizeSort('longest')).toBe('longest');
  expect(normalizeSort('capacity')).toBe('capacity');
  expect(normalizeSort('name')).toBe('name');
  expect(normalizeSort('bogus')).toBe(DEFAULT_SORT);
  expect(normalizeSort('')).toBe(DEFAULT_SORT);
  expect(normalizeSort(undefined)).toBe(DEFAULT_SORT);
});

test('sortRooms by name orders alphabetically with natural numeric ordering', () => {
  const out = sortRooms(rooms, 'name');
  expect(out.map((r) => r.name)).toEqual(['Group Study 130S', 'Group Study 220', 'Silent 200']);
});

test('sortRooms by "longest" ranks rooms by their single longest free range, descending', () => {
  const out = sortRooms(rooms, 'longest');
  // Silent 200 (3h) > Group Study 130S (2h) > Group Study 220 (1h)
  expect(out.map((r) => r.name)).toEqual(['Silent 200', 'Group Study 130S', 'Group Study 220']);
});

test('sortRooms by capacity orders largest first and sinks unknown capacity to the end', () => {
  const out = sortRooms(rooms, 'capacity');
  expect(out.map((r) => r.name)).toEqual(['Group Study 130S', 'Group Study 220', 'Silent 200']);
});

test('sortRooms does not mutate the input array', () => {
  const original = [...rooms];
  sortRooms(rooms, 'longest');
  expect(rooms).toEqual(original);
});

test('sortRooms treats an unknown sort key as the default (name)', () => {
  expect(sortRooms(rooms, 'bogus').map((r) => r.name)).toEqual(
    sortRooms(rooms, 'name').map((r) => r.name)
  );
});

test('sortRooms tolerates rooms with no ranges when sorting by longest', () => {
  const withEmpty = [{ name: 'Z', capacity: 2, ranges: [] }, ...rooms];
  const out = sortRooms(withEmpty, 'longest');
  expect(out[out.length - 1].name).toBe('Z'); // zero-length free time sinks to the bottom
});
