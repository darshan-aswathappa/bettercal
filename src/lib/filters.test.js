import { test, expect } from 'vitest';
import { CAPACITY_BANDS, applyFilters, getWindow, readFilterParams, buildFilterQuery } from './filters.js';

const rooms = [
  { name: 'A', grouping: 'Group Study Rooms', capacity: 6 },
  { name: 'B', grouping: 'Individual Silent Study', capacity: 1 },
  { name: 'C', grouping: 'Group Study Rooms', capacity: null },
];

test('CAPACITY_BANDS defines the two size bands', () => {
  expect(CAPACITY_BANDS['1-4']).toEqual([1, 4]);
  expect(CAPACITY_BANDS['5-8']).toEqual([5, 8]);
});

test('applyFilters with no filters returns everything', () => {
  expect(applyFilters(rooms, { style: '', capacity: '' })).toHaveLength(3);
});

test('applyFilters filters by seat style', () => {
  const out = applyFilters(rooms, { style: 'Group Study Rooms', capacity: '' });
  expect(out.map((r) => r.name)).toEqual(['A', 'C']);
});

test('applyFilters filters by capacity band and drops null capacity', () => {
  const small = applyFilters(rooms, { style: '', capacity: '1-4' });
  expect(small.map((r) => r.name)).toEqual(['B']);

  const large = applyFilters(rooms, { style: '', capacity: '5-8' });
  expect(large.map((r) => r.name)).toEqual(['A']);
});

test('getWindow returns null when no start time is set', () => {
  expect(getWindow({ date: '2026-07-09', from: '', to: '' })).toBeNull();
});

test('getWindow builds a from-only window (open-ended)', () => {
  expect(getWindow({ date: '2026-07-09', from: '09:00', to: '' })).toEqual({
    from: '2026-07-09 09:00:00',
    to: null,
    invalid: false,
  });
});

test('getWindow builds a full window and flags an inverted one', () => {
  expect(getWindow({ date: '2026-07-09', from: '09:00', to: '11:00' })).toEqual({
    from: '2026-07-09 09:00:00',
    to: '2026-07-09 11:00:00',
    invalid: false,
  });

  const inverted = getWindow({ date: '2026-07-09', from: '11:00', to: '09:00' });
  expect(inverted.invalid).toBe(true);
});

test('readFilterParams pulls valid values and ignores junk', () => {
  const params = new URLSearchParams('from=09:00&to=11:00&style=Individual%20Study&capacity=1-4');
  expect(readFilterParams(params)).toEqual({
    from: '09:00',
    to: '11:00',
    style: 'Individual Study',
    capacity: '1-4',
  });
});

test('readFilterParams rejects malformed times and unknown capacity bands', () => {
  const params = new URLSearchParams('from=9am&to=99:99&capacity=100');
  expect(readFilterParams(params)).toEqual({ from: '', to: '', style: '', capacity: '' });
});

test('buildFilterQuery omits the date when it equals today and drops "to" without "from"', () => {
  const today = '2026-07-09';
  expect(buildFilterQuery({ date: today, from: '', to: '', style: '', capacity: '' }, today)).toBe('');
  expect(
    buildFilterQuery({ date: today, from: '', to: '11:00', style: 'Individual Study', capacity: '' }, today)
  ).toBe('style=Individual+Study');
});

test('buildFilterQuery includes a non-today date and a full window', () => {
  const qs = buildFilterQuery(
    { date: '2026-07-10', from: '09:00', to: '11:00', style: '', capacity: '5-8' },
    '2026-07-09'
  );
  const params = new URLSearchParams(qs);
  expect(params.get('date')).toBe('2026-07-10');
  expect(params.get('from')).toBe('09:00');
  expect(params.get('to')).toBe('11:00');
  expect(params.get('capacity')).toBe('5-8');
});
