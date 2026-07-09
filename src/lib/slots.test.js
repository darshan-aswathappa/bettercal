import { test, expect } from 'vitest';
import { freeRangesByRoom, rangesForDate, rangeCoversWindow } from './slots.js';

const slot = (start, end, itemId = 1, className) => ({
  start,
  end,
  itemId,
  ...(className ? { className } : {}),
});

test('merges contiguous free slots into one range', () => {
  const ranges = freeRangesByRoom([
    slot('2026-07-09 09:00:00', '2026-07-09 09:15:00'),
    slot('2026-07-09 09:15:00', '2026-07-09 09:30:00'),
    slot('2026-07-09 09:30:00', '2026-07-09 09:45:00'),
  ]);
  expect(ranges.get(1)).toEqual([
    { start: '2026-07-09 09:00:00', end: '2026-07-09 09:45:00' },
  ]);
});

test('splits ranges at gaps', () => {
  const ranges = freeRangesByRoom([
    slot('2026-07-09 09:00:00', '2026-07-09 09:15:00'),
    slot('2026-07-09 10:00:00', '2026-07-09 10:15:00'),
  ]);
  expect(ranges.get(1)).toEqual([
    { start: '2026-07-09 09:00:00', end: '2026-07-09 09:15:00' },
    { start: '2026-07-09 10:00:00', end: '2026-07-09 10:15:00' },
  ]);
});

test('excludes booked and checkout slots, splitting around them', () => {
  const ranges = freeRangesByRoom([
    slot('2026-07-09 09:00:00', '2026-07-09 09:15:00'),
    slot('2026-07-09 09:15:00', '2026-07-09 09:30:00', 1, 's-lc-eq-r-unavailable'),
    slot('2026-07-09 09:30:00', '2026-07-09 09:45:00'),
    slot('2026-07-09 09:45:00', '2026-07-09 10:00:00', 1, 's-lc-eq-checkout'),
  ]);
  expect(ranges.get(1)).toEqual([
    { start: '2026-07-09 09:00:00', end: '2026-07-09 09:15:00' },
    { start: '2026-07-09 09:30:00', end: '2026-07-09 09:45:00' },
  ]);
});

test('keeps rooms separate and handles out-of-order input', () => {
  const ranges = freeRangesByRoom([
    slot('2026-07-09 09:15:00', '2026-07-09 09:30:00', 2),
    slot('2026-07-09 09:00:00', '2026-07-09 09:15:00', 2),
    slot('2026-07-09 09:00:00', '2026-07-09 09:15:00', 1),
  ]);
  expect(ranges.get(2)).toEqual([
    { start: '2026-07-09 09:00:00', end: '2026-07-09 09:30:00' },
  ]);
  expect(ranges.get(1)).toEqual([
    { start: '2026-07-09 09:00:00', end: '2026-07-09 09:15:00' },
  ]);
});

test('room with no free slots yields no entry', () => {
  const ranges = freeRangesByRoom([
    slot('2026-07-09 09:00:00', '2026-07-09 09:15:00', 1, 's-lc-eq-r-unavailable'),
  ]);
  expect(ranges.get(1)).toBeUndefined();
});

test('rangesForDate keeps only the requested date', () => {
  const ranges = [
    { start: '2026-07-08 21:15:00', end: '2026-07-08 21:45:00' },
    { start: '2026-07-09 08:00:00', end: '2026-07-09 12:00:00' },
  ];
  expect(rangesForDate(ranges, '2026-07-09')).toEqual([
    { start: '2026-07-09 08:00:00', end: '2026-07-09 12:00:00' },
  ]);
});

test('rangeCoversWindow: full window must be inside the free range', () => {
  const range = { start: '2026-07-09 09:00:00', end: '2026-07-09 12:00:00' };
  // fully inside
  expect(rangeCoversWindow(range, '2026-07-09 10:00:00', '2026-07-09 11:00:00')).toBe(true);
  // exact edges
  expect(rangeCoversWindow(range, '2026-07-09 09:00:00', '2026-07-09 12:00:00')).toBe(true);
  // spills past the end
  expect(rangeCoversWindow(range, '2026-07-09 11:00:00', '2026-07-09 13:00:00')).toBe(false);
  // starts before the range
  expect(rangeCoversWindow(range, '2026-07-09 08:00:00', '2026-07-09 10:00:00')).toBe(false);
});

test('rangeCoversWindow: instant (no end) needs the room free at that moment', () => {
  const range = { start: '2026-07-09 09:00:00', end: '2026-07-09 12:00:00' };
  expect(rangeCoversWindow(range, '2026-07-09 09:00:00', null)).toBe(true);
  expect(rangeCoversWindow(range, '2026-07-09 11:59:00', null)).toBe(true);
  // end is exclusive — not free at exactly the end boundary
  expect(rangeCoversWindow(range, '2026-07-09 12:00:00', null)).toBe(false);
  expect(rangeCoversWindow(range, '2026-07-09 12:30:00', null)).toBe(false);
});
