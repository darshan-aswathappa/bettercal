import { describe, it, expect, vi } from 'vitest';
import {
  WATCHLIST_TOKEN_KEY,
  WATCHLIST_EMAIL_KEY,
  getOrCreateToken,
  loadEmail,
  saveEmail,
  newRequestId,
  joinWatchlist,
  cancelWatchlist,
  listWatchlists,
} from './watchlist-client.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    _map: map,
  };
}

describe('getOrCreateToken', () => {
  it('creates and persists a token on first use', () => {
    const storage = fakeStorage();
    const token = getOrCreateToken(storage);
    expect(token).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(storage._map.get(WATCHLIST_TOKEN_KEY)).toBe(token);
  });

  it('returns the same token on subsequent calls', () => {
    const storage = fakeStorage();
    const first = getOrCreateToken(storage);
    expect(getOrCreateToken(storage)).toBe(first);
  });

  it('replaces a corrupt stored token', () => {
    const storage = fakeStorage({ [WATCHLIST_TOKEN_KEY]: 'nope!' });
    const token = getOrCreateToken(storage);
    expect(token).not.toBe('nope!');
    expect(token).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
  });

  it('still returns a usable token without storage', () => {
    expect(getOrCreateToken(null)).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
  });

  it('survives a throwing storage (private mode)', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(getOrCreateToken(broken)).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
  });
});

describe('email persistence', () => {
  it('round-trips through storage', () => {
    const storage = fakeStorage();
    saveEmail(storage, 'a@b.edu');
    expect(loadEmail(storage)).toBe('a@b.edu');
    expect(storage._map.get(WATCHLIST_EMAIL_KEY)).toBe('a@b.edu');
  });

  it('is empty without storage or a saved value', () => {
    expect(loadEmail(null)).toBe('');
    expect(loadEmail(fakeStorage())).toBe('');
  });
});

describe('newRequestId', () => {
  it('is a fresh UUID per call — one per distinct submission', () => {
    const a = newRequestId();
    const b = newRequestId();
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(a).not.toBe(b);
  });
});

describe('API wrappers', () => {
  const okResponse = (body) => ({ ok: true, json: async () => body });

  it('joinWatchlist POSTs the entry and returns the payload', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      okResponse({ ok: true, watchlistId: 'w1', groupId: 'g1', dedup: false })
    );
    const entry = {
      date: '2026-07-10',
      from: '11:00',
      to: '12:30',
      style: '',
      capacity: '',
      email: 'a@b.edu',
      token: 'tok_abcdefghijklmnop',
      requestId: '11111111-1111-1111-1111-111111111111',
    };

    const result = await joinWatchlist(entry, fetchFn);

    expect(result.watchlistId).toBe('w1');
    expect(fetchFn).toHaveBeenCalledWith('/api/watchlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(entry),
    });
  });

  it('reusing the same requestId across retries sends an identical request', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(okResponse({ ok: true, watchlistId: 'w1', groupId: 'g1', dedup: true }));
    const entry = { requestId: newRequestId(), email: 'a@b.edu', token: 'tok_abcdefghijklmnop' };

    await expect(joinWatchlist(entry, fetchFn)).rejects.toThrow('network');
    await joinWatchlist(entry, fetchFn); // retry: same entry object, same requestId

    expect(fetchFn.mock.calls[0][1].body).toBe(fetchFn.mock.calls[1][1].body);
  });

  it('surfaces the API error message on failure', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ ok: false, error: 'Too many watchlists.' }),
    });
    await expect(joinWatchlist({}, fetchFn)).rejects.toThrow('Too many watchlists.');
  });

  it('listWatchlists returns the entries array', async () => {
    const entries = [{ id: 'w1', status: 'ACTIVE' }];
    const fetchFn = vi.fn().mockResolvedValue(okResponse({ ok: true, entries }));
    expect(await listWatchlists('tok_abcdefghijklmnop', fetchFn)).toEqual(entries);
    expect(fetchFn).toHaveBeenCalledWith('/api/watchlist?token=tok_abcdefghijklmnop');
  });

  it('cancelWatchlist POSTs id + token', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse({ ok: true, cancelled: 1 }));
    await cancelWatchlist('w1', 'tok_abcdefghijklmnop', fetchFn);
    expect(fetchFn.mock.calls[0][1].body).toBe(
      JSON.stringify({ id: 'w1', token: 'tok_abcdefghijklmnop' })
    );
  });
});
