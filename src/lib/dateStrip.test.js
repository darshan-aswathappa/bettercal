import { test, expect } from 'vitest';
import { buildDateStrip } from './dateStrip.js';

test('builds a rolling 7-day strip starting from the given day', () => {
  const strip = buildDateStrip('2026-07-09'); // a Thursday

  expect(strip).toHaveLength(7);
  expect(strip[0].date).toBe('2026-07-09');
  expect(strip[6].date).toBe('2026-07-15');
});

test('marks only the first day as today', () => {
  const strip = buildDateStrip('2026-07-09');

  expect(strip[0].isToday).toBe(true);
  expect(strip.slice(1).every((d) => d.isToday === false)).toBe(true);
});

test('labels each day with its weekday abbreviation and day-of-month number', () => {
  const strip = buildDateStrip('2026-07-09'); // Thu Jul 9

  expect(strip[0]).toMatchObject({ date: '2026-07-09', weekday: 'Thu', day: 9 });
  expect(strip[1]).toMatchObject({ date: '2026-07-10', weekday: 'Fri', day: 10 });
});

test('rolls across a month boundary correctly', () => {
  const strip = buildDateStrip('2026-07-29');

  expect(strip.map((d) => d.date)).toEqual([
    '2026-07-29',
    '2026-07-30',
    '2026-07-31',
    '2026-08-01',
    '2026-08-02',
    '2026-08-03',
    '2026-08-04',
  ]);
  expect(strip[3]).toMatchObject({ date: '2026-08-01', day: 1 });
});

test('honours a custom day count', () => {
  expect(buildDateStrip('2026-07-09', 3).map((d) => d.date)).toEqual([
    '2026-07-09',
    '2026-07-10',
    '2026-07-11',
  ]);
});
