import { test, expect, vi, beforeEach } from 'vitest';

const loadForDate = vi.fn();
vi.mock('$lib/server/availability.js', () => ({ loadForDate }));

const { load } = await import('./+page.server.js');

const run = (date) =>
  load({ url: new URL(`http://localhost/${date == null ? '' : `?date=${date}`}`) });

beforeEach(() => {
  loadForDate.mockReset();
  loadForDate.mockImplementation((date) => Promise.resolve({ date, initial: { ok: true }, error: null }));
});

test('delegates a valid date param to loadForDate', async () => {
  const data = await run('2026-07-09');

  expect(loadForDate).toHaveBeenCalledWith('2026-07-09');
  expect(data.date).toBe('2026-07-09');
});

test('defaults to a today-shaped date when none is given', async () => {
  await run(null);

  const date = loadForDate.mock.calls[0][0];
  expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test('ignores a malformed date param and falls back to today', async () => {
  await run('nope');

  const date = loadForDate.mock.calls[0][0];
  expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(date).not.toBe('nope');
});
