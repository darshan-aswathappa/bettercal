import { test, expect } from 'vitest';
import {
  OPEN_SECONDS,
  CLOSE_SECONDS,
  weekdayOf,
  parseRoomName,
  fmtSeconds,
  blocksForDate,
  freeRangesForDate,
} from './classrooms.js';

const block = (startDate, endDate, start, end, extra = {}) => ({
  startDate,
  endDate,
  time: { start, end },
  ...extra,
});

const H = (h, m = 0) => h * 3600 + m * 60;

test('open window is 07:00–23:00', () => {
  expect(OPEN_SECONDS).toBe(H(7));
  expect(CLOSE_SECONDS).toBe(H(23));
});

test('weekdayOf resolves the weekday independent of timezone', () => {
  expect(weekdayOf('2026-07-17')).toBe('friday');
  expect(weekdayOf('2026-07-18')).toBe('saturday');
  expect(weekdayOf('2026-07-19')).toBe('sunday');
  expect(weekdayOf('2026-07-20')).toBe('monday');
  expect(weekdayOf('2026-02-28')).toBe('saturday');
  expect(weekdayOf('2024-02-29')).toBe('thursday'); // leap day
});

test('parseRoomName splits the trailing room token from the building', () => {
  expect(parseRoomName('Behrakis Health Sciences Cntr 307')).toEqual({
    building: 'Behrakis Health Sciences Cntr',
    room: '307',
  });
  expect(parseRoomName('West Village F 020')).toEqual({
    building: 'West Village F',
    room: '020',
  });
  expect(parseRoomName('EXP 460B')).toEqual({ building: 'EXP', room: '460B' });
  expect(parseRoomName('Single')).toEqual({ building: '', room: 'Single' });
});

test('fmtSeconds formats seconds since midnight as HH:MM:SS', () => {
  expect(fmtSeconds(H(7))).toBe('07:00:00');
  expect(fmtSeconds(64800)).toBe('18:00:00');
  expect(fmtSeconds(H(20, 30))).toBe('20:30:00');
  expect(fmtSeconds(H(23))).toBe('23:00:00');
});

test('blocksForDate picks only blocks whose recurrence window covers the date', () => {
  const schedule = {
    monday: [
      block('2026-05-06', '2026-08-16', H(18), H(20, 30)), // active both dates
      block('2026-05-06', '2026-06-21', H(9), H(10)), // ended before July
      block('2026-08-01', '2026-08-16', H(12), H(13)), // starts in August
    ],
  };
  expect(blocksForDate(schedule, '2026-07-20')).toEqual([{ start: H(18), end: H(20, 30) }]);
  expect(blocksForDate(schedule, '2026-05-11')).toEqual([
    { start: H(9), end: H(10) },
    { start: H(18), end: H(20, 30) },
  ]);
});

test('blocksForDate treats startDate and endDate as inclusive', () => {
  const schedule = { friday: [block('2026-07-10', '2026-07-24', H(9), H(10))] };
  expect(blocksForDate(schedule, '2026-07-10')).toHaveLength(1);
  expect(blocksForDate(schedule, '2026-07-24')).toHaveLength(1);
  expect(blocksForDate(schedule, '2026-07-17')).toHaveLength(1);
  expect(blocksForDate(schedule, '2026-07-03')).toHaveLength(0);
  expect(blocksForDate(schedule, '2026-07-31')).toHaveLength(0);
});

test('blocksForDate only looks at the matching weekday', () => {
  const schedule = { monday: [block('2026-05-06', '2026-08-16', H(9), H(10))] };
  expect(blocksForDate(schedule, '2026-07-21')).toEqual([]); // a Tuesday
});

test('blocksForDate merges overlapping and adjacent blocks', () => {
  const schedule = {
    wednesday: [
      block('2026-05-06', '2026-08-16', H(10), H(12)),
      block('2026-05-06', '2026-08-16', H(9), H(10, 30)), // overlaps
      block('2026-05-06', '2026-08-16', H(12), H(13)), // adjacent
      block('2026-05-06', '2026-08-16', H(15), H(16)), // separate
    ],
  };
  expect(blocksForDate(schedule, '2026-07-22')).toEqual([
    { start: H(9), end: H(13) },
    { start: H(15), end: H(16) },
  ]);
});

test('blocksForDate clips blocks to the open window and drops those outside it', () => {
  const schedule = {
    thursday: [
      block('2026-05-06', '2026-08-16', H(5), H(8)), // clipped to 07:00 start
      block('2026-05-06', '2026-08-16', H(22), H(24)), // clipped to 23:00 end
      block('2026-05-06', '2026-08-16', H(1), H(6)), // fully before open
    ],
  };
  expect(blocksForDate(schedule, '2026-07-23')).toEqual([
    { start: H(7), end: H(8) },
    { start: H(22), end: H(23) },
  ]);
});

test('blocksForDate handles a missing or empty schedule', () => {
  expect(blocksForDate(null, '2026-07-17')).toEqual([]);
  expect(blocksForDate(undefined, '2026-07-17')).toEqual([]);
  expect(blocksForDate({}, '2026-07-17')).toEqual([]);
});

test('freeRangesForDate complements the blocks within the open window', () => {
  const schedule = {
    friday: [block('2026-05-06', '2026-08-16', H(9), H(10, 30))],
  };
  expect(freeRangesForDate(schedule, '2026-07-17')).toEqual([
    { start: '2026-07-17 07:00:00', end: '2026-07-17 09:00:00' },
    { start: '2026-07-17 10:30:00', end: '2026-07-17 23:00:00' },
  ]);
});

test('freeRangesForDate: a day with no classes is free for the whole window', () => {
  const schedule = { monday: [block('2026-05-06', '2026-08-16', H(9), H(10))] };
  // Saturday has no schedule key at all.
  expect(freeRangesForDate(schedule, '2026-07-18')).toEqual([
    { start: '2026-07-18 07:00:00', end: '2026-07-18 23:00:00' },
  ]);
  expect(freeRangesForDate(null, '2026-07-18')).toEqual([
    { start: '2026-07-18 07:00:00', end: '2026-07-18 23:00:00' },
  ]);
});

test('freeRangesForDate: a fully-booked day yields no ranges', () => {
  const schedule = {
    friday: [
      block('2026-05-06', '2026-08-16', H(7), H(15)),
      block('2026-05-06', '2026-08-16', H(15), H(23)),
    ],
  };
  expect(freeRangesForDate(schedule, '2026-07-17')).toEqual([]);
});

test('freeRangesForDate: a date past every endDate is free all day', () => {
  const schedule = {
    friday: [block('2026-05-06', '2026-06-21', H(9), H(10))],
  };
  expect(freeRangesForDate(schedule, '2026-07-17')).toEqual([
    { start: '2026-07-17 07:00:00', end: '2026-07-17 23:00:00' },
  ]);
});

test('freeRangesForDate emits non-padded minutes correctly', () => {
  const schedule = {
    friday: [block('2026-05-06', '2026-08-16', H(9, 5), H(10, 45))],
  };
  expect(freeRangesForDate(schedule, '2026-07-17')).toEqual([
    { start: '2026-07-17 07:00:00', end: '2026-07-17 09:05:00' },
    { start: '2026-07-17 10:45:00', end: '2026-07-17 23:00:00' },
  ]);
});
