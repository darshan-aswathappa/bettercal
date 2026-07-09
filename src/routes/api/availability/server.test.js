import { test, expect, vi, beforeEach } from 'vitest';

const buildAvailability = vi.fn();
vi.mock('$lib/server/availability.js', () => ({ buildAvailability }));

const { GET } = await import('./+server.js');

const call = (date) =>
  GET({ url: new URL(`http://localhost/api/availability${date == null ? '' : `?date=${date}`}`) });

beforeEach(() => {
  buildAvailability.mockReset();
});

test('valid date returns 200 with the builder payload', async () => {
  const payload = { ok: true, date: '2026-07-09', generatedAt: 'x', rooms: [] };
  buildAvailability.mockResolvedValue(payload);

  const res = await call('2026-07-09');

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual(payload);
  expect(buildAvailability).toHaveBeenCalledWith('2026-07-09');
});

test('missing date returns 400 without calling the builder', async () => {
  const res = await call(null);
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ ok: false, error: 'date must be YYYY-MM-DD' });
  expect(buildAvailability).not.toHaveBeenCalled();
});

test('malformed date returns 400', async () => {
  const res = await call('07-09-2026');
  expect(res.status).toBe(400);
  expect((await res.json()).ok).toBe(false);
});

test('builder failure returns a 502 with a friendly message', async () => {
  buildAvailability.mockRejectedValue(new Error('LibCal down'));
  vi.spyOn(console, 'error').mockImplementation(() => {});

  const res = await call('2026-07-09');

  expect(res.status).toBe(502);
  expect(await res.json()).toEqual({
    ok: false,
    error: 'Could not reach LibCal. Try again shortly.',
  });
});
