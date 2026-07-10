import { test, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const select = vi.fn();
vi.mock('$lib/server/supabase.js', () => ({ rpc, select, update: vi.fn() }));

const { POST, GET } = await import('./+server.js');

const VALID = {
  requestId: '11111111-1111-1111-1111-111111111111',
  email: 'user@northeastern.edu',
  token: 'tok_abcdefghijklmnop',
  date: '2099-07-10',
  from: '11:00',
  to: '12:30',
  style: 'Individual Silent Study',
  capacity: '1-4',
};

const postCall = (body) =>
  POST({
    request: new Request('http://localhost/api/watchlist', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
    getClientAddress: () => '10.0.0.1',
  });

const getCall = (token) =>
  GET({
    url: new URL(`http://localhost/api/watchlist${token == null ? '' : `?token=${token}`}`),
  });

beforeEach(() => {
  rpc.mockReset();
  select.mockReset();
});

test('valid create calls the RPC and returns ids', async () => {
  rpc.mockResolvedValue([{ watchlist_id: 'w1', group_id: 'g1', dedup: false }]);

  const res = await postCall(VALID);

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, watchlistId: 'w1', groupId: 'g1', dedup: false });
  const args = rpc.mock.calls[0][1];
  expect(rpc.mock.calls[0][0]).toBe('create_watchlist');
  expect(args.p_request_id).toBe(VALID.requestId);
  expect(args.p_hash).toMatch(/^[0-9a-f]{64}$/);
  expect(args.p_ip).toBe('10.0.0.1');
});

test.each([
  ['missing requestId', { ...VALID, requestId: undefined }],
  ['bad email', { ...VALID, email: 'not-an-email' }],
  ['bad token', { ...VALID, token: 'short' }],
  ['bad date', { ...VALID, date: '07-10-2099' }],
  ['past date', { ...VALID, date: '2020-01-01' }],
  ['missing end time', { ...VALID, to: '' }],
  ['window too short', { ...VALID, to: '11:15' }],
  ['window too long', { ...VALID, to: '15:30' }],
  ['inverted window', { ...VALID, to: '10:00' }],
  ['unknown style', { ...VALID, style: 'Penthouse Suite' }],
  ['unknown capacity', { ...VALID, capacity: '9-12' }],
])('rejects %s with 400 before touching the DB', async (_name, body) => {
  const res = await postCall(body);
  expect(res.status).toBe(400);
  expect((await res.json()).ok).toBe(false);
  expect(rpc).not.toHaveBeenCalled();
});

test.each([
  ['limit_email', 429],
  ['limit_token', 429],
  ['limit_ip', 429],
  ['too_late', 400],
  ['already_found', 409],
])('maps RPC error %s to HTTP %d', async (code, status) => {
  rpc.mockRejectedValue(new Error(code));
  const res = await postCall(VALID);
  expect(res.status).toBe(status);
  expect((await res.json()).ok).toBe(false);
});

test('unexpected RPC failure returns 502 with a friendly message', async () => {
  rpc.mockRejectedValue(new Error('connection refused'));
  vi.spyOn(console, 'error').mockImplementation(() => {});

  const res = await postCall(VALID);

  expect(res.status).toBe(502);
  expect((await res.json()).error).toMatch(/try again/i);
});

test('GET returns entries for a valid token', async () => {
  const entries = [{ id: 'w1', status: 'ACTIVE', group: { date: '2099-07-10' } }];
  select.mockResolvedValue(entries);

  const res = await getCall('tok_abcdefghijklmnop');

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, entries });
  const [table, query] = select.mock.calls[0];
  expect(table).toBe('watchlists');
  expect(query).toContain('manage_token=eq.tok_abcdefghijklmnop');
});

test('GET rejects a malformed token without querying', async () => {
  const res = await getCall('bad!token');
  expect(res.status).toBe(400);
  expect(select).not.toHaveBeenCalled();
});
