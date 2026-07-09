import { test, expect } from 'vitest';
import {
  todayStr,
  parseTs,
  fmtDuration,
  toTimeInput,
  fromTimeInput,
  roundUpToQuarter,
  windowLabel,
  buildBookUrl,
  bookingHint,
} from './format.js';

test('todayStr is a zero-padded YYYY-MM-DD string', () => {
  expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test('parseTs turns a LibCal timestamp into a local Date', () => {
  const d = parseTs('2026-07-09 09:30:00');
  expect(d.getFullYear()).toBe(2026);
  expect(d.getMonth()).toBe(6); // July
  expect(d.getDate()).toBe(9);
  expect(d.getHours()).toBe(9);
  expect(d.getMinutes()).toBe(30);
});

test('fmtDuration covers minutes, whole hours, and hours+minutes', () => {
  expect(fmtDuration(30 * 60000)).toBe('30 min');
  expect(fmtDuration(60 * 60000)).toBe('1 hr');
  expect(fmtDuration(90 * 60000)).toBe('1 hr 30 min');
  expect(fmtDuration(0)).toBe('0 min');
});

test('toTimeInput / fromTimeInput round-trip an HH:mm value', () => {
  expect(toTimeInput(fromTimeInput('14:30'))).toBe('14:30');
  expect(toTimeInput(fromTimeInput('09:05'))).toBe('09:05');
});

test('roundUpToQuarter rounds up but keeps a value already on the boundary', () => {
  const onBoundary = new Date(2026, 6, 9, 9, 15, 0, 0);
  expect(roundUpToQuarter(onBoundary).getTime()).toBe(onBoundary.getTime());

  const midQuarter = new Date(2026, 6, 9, 9, 7, 0, 0);
  const rounded = roundUpToQuarter(midQuarter);
  expect(rounded.getMinutes()).toBe(15);
  expect(rounded.getSeconds()).toBe(0);
});

test('buildBookUrl appends the date only when given one', () => {
  expect(buildBookUrl('https://x/1')).toBe('https://x/1');
  expect(buildBookUrl('https://x/1', '2026-07-09')).toBe('https://x/1?date=2026-07-09');
  expect(buildBookUrl('https://x/1', '2026-07-09 09:00:00')).toBe(
    'https://x/1?date=2026-07-09%2009%3A00%3A00'
  );
});

test('windowLabel shows a range with an end and "from" without one', () => {
  expect(windowLabel({ from: '2026-07-09 09:00:00', to: '2026-07-09 11:00:00' })).toContain('–');
  expect(windowLabel({ from: '2026-07-09 09:00:00', to: null })).toMatch(/^from /);
});

test('bookingHint names the end time to set and warns about the 1h default', () => {
  const hint = bookingHint({ from: '2026-07-09 14:00:00', to: '2026-07-09 17:00:00' });
  expect(hint).toContain('5:00'); // the end time the user must pick on LibCal
  expect(hint).toMatch(/default/i);
});

test('bookingHint is empty for an open-ended window (no end to instruct)', () => {
  expect(bookingHint({ from: '2026-07-09 14:00:00', to: null })).toBe('');
});
