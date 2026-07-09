import test from 'node:test';
import assert from 'node:assert/strict';
import { freeRangesByRoom, rangesForDate, rangeCoversWindow } from '../src/slots.js';

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
  assert.deepEqual(ranges.get(1), [
    { start: '2026-07-09 09:00:00', end: '2026-07-09 09:45:00' },
  ]);
});

test('splits ranges at gaps', () => {
  const ranges = freeRangesByRoom([
    slot('2026-07-09 09:00:00', '2026-07-09 09:15:00'),
    slot('2026-07-09 10:00:00', '2026-07-09 10:15:00'),
  ]);
  assert.deepEqual(ranges.get(1), [
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
  assert.deepEqual(ranges.get(1), [
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
  assert.deepEqual(ranges.get(2), [
    { start: '2026-07-09 09:00:00', end: '2026-07-09 09:30:00' },
  ]);
  assert.deepEqual(ranges.get(1), [
    { start: '2026-07-09 09:00:00', end: '2026-07-09 09:15:00' },
  ]);
});

test('room with no free slots yields no entry', () => {
  const ranges = freeRangesByRoom([
    slot('2026-07-09 09:00:00', '2026-07-09 09:15:00', 1, 's-lc-eq-r-unavailable'),
  ]);
  assert.equal(ranges.get(1), undefined);
});

test('rangesForDate keeps only the requested date', () => {
  const ranges = [
    { start: '2026-07-08 21:15:00', end: '2026-07-08 21:45:00' },
    { start: '2026-07-09 08:00:00', end: '2026-07-09 12:00:00' },
  ];
  assert.deepEqual(rangesForDate(ranges, '2026-07-09'), [
    { start: '2026-07-09 08:00:00', end: '2026-07-09 12:00:00' },
  ]);
});

test('rangeCoversWindow: full window must be inside the free range', () => {
  const range = { start: '2026-07-09 09:00:00', end: '2026-07-09 12:00:00' };
  // fully inside
  assert.equal(rangeCoversWindow(range, '2026-07-09 10:00:00', '2026-07-09 11:00:00'), true);
  // exact edges
  assert.equal(rangeCoversWindow(range, '2026-07-09 09:00:00', '2026-07-09 12:00:00'), true);
  // spills past the end
  assert.equal(rangeCoversWindow(range, '2026-07-09 11:00:00', '2026-07-09 13:00:00'), false);
  // starts before the range
  assert.equal(rangeCoversWindow(range, '2026-07-09 08:00:00', '2026-07-09 10:00:00'), false);
});

test('rangeCoversWindow: instant (no end) needs the room free at that moment', () => {
  const range = { start: '2026-07-09 09:00:00', end: '2026-07-09 12:00:00' };
  assert.equal(rangeCoversWindow(range, '2026-07-09 09:00:00', null), true);
  assert.equal(rangeCoversWindow(range, '2026-07-09 11:59:00', null), true);
  // end is exclusive — not free at exactly the end boundary
  assert.equal(rangeCoversWindow(range, '2026-07-09 12:00:00', null), false);
  assert.equal(rangeCoversWindow(range, '2026-07-09 12:30:00', null), false);
});
