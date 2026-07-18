import { test, expect, vi, beforeEach } from 'vitest';

const loadForDate = vi.fn();
const loadClassroomsForDate = vi.fn();
vi.mock('$lib/server/availability.js', () => ({ loadForDate }));
vi.mock('$lib/server/classrooms.js', () => ({ loadForDate: loadClassroomsForDate }));

const { load } = await import('./+page.server.js');

const run = (query = '') => load({ url: new URL(`http://localhost/${query}`) });

beforeEach(() => {
  loadForDate.mockReset();
  loadClassroomsForDate.mockReset();
  loadForDate.mockImplementation((date) => Promise.resolve({ date, initial: { ok: true }, error: null }));
  loadClassroomsForDate.mockImplementation((date) =>
    Promise.resolve({ date, initial: { ok: true }, error: null })
  );
});

test('delegates a valid date param to loadForDate', async () => {
  const data = await run('?date=2026-07-09');

  expect(loadForDate).toHaveBeenCalledWith('2026-07-09');
  expect(data.date).toBe('2026-07-09');
});

test('defaults to a today-shaped date when none is given', async () => {
  await run();

  const date = loadForDate.mock.calls[0][0];
  expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test('ignores a malformed date param and falls back to today', async () => {
  await run('?date=nope');

  const date = loadForDate.mock.calls[0][0];
  expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(date).not.toBe('nope');
});

test('defaults to the library tab and does not touch the classroom loader', async () => {
  const data = await run();

  expect(data.tab).toBe('library');
  expect(loadForDate).toHaveBeenCalledTimes(1);
  expect(loadClassroomsForDate).not.toHaveBeenCalled();
});

test('tab=classrooms loads classroom availability for the date', async () => {
  const data = await run('?tab=classrooms&date=2026-07-17');

  expect(data.tab).toBe('classrooms');
  expect(loadClassroomsForDate).toHaveBeenCalledWith('2026-07-17');
  expect(loadForDate).not.toHaveBeenCalled();
});

test('an unknown tab falls back to library', async () => {
  const data = await run('?tab=bogus');

  expect(data.tab).toBe('library');
  expect(loadForDate).toHaveBeenCalledTimes(1);
  expect(loadClassroomsForDate).not.toHaveBeenCalled();
});
