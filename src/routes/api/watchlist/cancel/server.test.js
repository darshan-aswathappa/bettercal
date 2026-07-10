import { test, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('$lib/server/supabase.js', () => ({ rpc, select: vi.fn(), update: vi.fn() }));

const { POST } = await import('./+server.js');

const call = (body) =>
  POST({
    request: new Request('http://localhost/api/watchlist/cancel', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  });

const ID = '9b91f4e5-8553-401f-922c-85a1cfed3714';
const TOKEN = 'tok_abcdefghijklmnop';

beforeEach(() => {
  rpc.mockReset();
});

test('cancels one ACTIVE entry with the (id, token) pair', async () => {
  rpc.mockResolvedValue(1);

  const res = await call({ id: ID, token: TOKEN });

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, cancelled: 1 });
  expect(rpc).toHaveBeenCalledWith('cancel_watchlists', {
    p_token: TOKEN,
    p_id: ID,
    p_all: false,
  });
});

test('cancel-all passes p_all without an id', async () => {
  rpc.mockResolvedValue(2);

  const res = await call({ token: TOKEN, all: true });

  expect(res.status).toBe(200);
  expect((await res.json()).cancelled).toBe(2);
  expect(rpc).toHaveBeenCalledWith('cancel_watchlists', {
    p_token: TOKEN,
    p_id: null,
    p_all: true,
  });
});

test('wrong or already-finished entry returns 404', async () => {
  rpc.mockResolvedValue(0);
  const res = await call({ id: ID, token: TOKEN });
  expect(res.status).toBe(404);
  expect((await res.json()).ok).toBe(false);
});

test('RPC failure returns 502 with a friendly message', async () => {
  rpc.mockRejectedValue(new Error('connection refused'));
  vi.spyOn(console, 'error').mockImplementation(() => {});

  const res = await call({ id: ID, token: TOKEN });

  expect(res.status).toBe(502);
  expect((await res.json()).error).toMatch(/try again/i);
});

test.each([
  ['bad token', { id: ID, token: 'nope!' }],
  ['bad id', { id: 'not-a-uuid', token: TOKEN }],
])('rejects %s without querying', async (_name, body) => {
  const res = await call(body);
  expect(res.status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});
