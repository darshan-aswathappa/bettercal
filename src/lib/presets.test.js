import { test, expect } from 'vitest';
import { computePreset, activeMinutesFor } from './presets.js';

test('computePreset starts from an existing From value and adds the duration', () => {
  const { from, to } = computePreset(60, '09:00', new Date(2026, 6, 9, 12, 0));
  expect(from).toBe('09:00');
  expect(to).toBe('10:00');
});

test('computePreset without a From value starts at now rounded up to the quarter', () => {
  const { from, to } = computePreset(30, '', new Date(2026, 6, 9, 9, 7));
  expect(from).toBe('09:15');
  expect(to).toBe('09:45');
});

test('computePreset clamps the end to 23:45 so it never spills past midnight', () => {
  const { from, to } = computePreset(180, '23:00', new Date(2026, 6, 9, 12, 0));
  expect(from).toBe('23:00');
  expect(to).toBe('23:45');
});

test('activeMinutesFor returns the window length when both times are set', () => {
  expect(activeMinutesFor('09:00', '10:00')).toBe(60);
  expect(activeMinutesFor('09:00', '09:30')).toBe(30);
});

test('activeMinutesFor returns null for missing or inverted windows', () => {
  expect(activeMinutesFor('', '')).toBeNull();
  expect(activeMinutesFor('09:00', '')).toBeNull();
  expect(activeMinutesFor('10:00', '09:00')).toBeNull();
});
