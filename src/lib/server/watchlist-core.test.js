import { describe, it, expect } from 'vitest';
import {
  HASH_VERSION,
  CAPACITY_BANDS,
  normalizeRequirement,
  hashRequirement,
  backoffDelayMinutes,
  evaluateGroups,
} from './watchlist-core.js';
import { CAPACITY_BANDS as UI_CAPACITY_BANDS } from '../filters.js';

const REQ = { date: '2026-07-10', start: '11:00', end: '12:30', style: 'Individual Silent Study', capacity: '1-4' };

describe('normalizeRequirement', () => {
  it('produces the documented v1 preimage shape', () => {
    expect(normalizeRequirement(REQ)).toBe(
      'v1|2026-07-10|11:00|12:30|individual silent study|1-4'
    );
  });

  it('starts with the hash version', () => {
    expect(normalizeRequirement(REQ).startsWith(`${HASH_VERSION}|`)).toBe(true);
  });

  it('normalizes case and whitespace on style', () => {
    const messy = { ...REQ, style: '  Individual SILENT Study ' };
    expect(normalizeRequirement(messy)).toBe(normalizeRequirement(REQ));
  });

  it('treats empty, null, and missing style/capacity identically ("any")', () => {
    const a = normalizeRequirement({ ...REQ, style: '', capacity: '' });
    const b = normalizeRequirement({ ...REQ, style: null, capacity: null });
    const c = normalizeRequirement({ date: REQ.date, start: REQ.start, end: REQ.end });
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(a).toBe('v1|2026-07-10|11:00|12:30||');
  });

  it('appends extra dimensions as sorted |k=v pairs', () => {
    const withExtra = normalizeRequirement({ ...REQ, extra: { zeta: 'B', alpha: 'A' } });
    expect(withExtra).toBe(
      'v1|2026-07-10|11:00|12:30|individual silent study|1-4|alpha=a|zeta=b'
    );
  });
});

describe('hashRequirement', () => {
  it('returns 64-char lowercase hex and is deterministic', async () => {
    const h1 = await hashRequirement(REQ);
    const h2 = await hashRequirement({ ...REQ });
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).toBe(h2);
  });

  it('differs when any dimension differs (date keeps groups day-scoped)', async () => {
    const base = await hashRequirement(REQ);
    expect(await hashRequirement({ ...REQ, date: '2026-07-11' })).not.toBe(base);
    expect(await hashRequirement({ ...REQ, start: '11:15' })).not.toBe(base);
    expect(await hashRequirement({ ...REQ, end: '12:45' })).not.toBe(base);
    expect(await hashRequirement({ ...REQ, style: '' })).not.toBe(base);
    expect(await hashRequirement({ ...REQ, capacity: '5-8' })).not.toBe(base);
  });
});

describe('CAPACITY_BANDS drift guard', () => {
  it('matches the UI band definition in filters.js', () => {
    expect(CAPACITY_BANDS).toEqual(UI_CAPACITY_BANDS);
  });
});

describe('backoffDelayMinutes', () => {
  const h = (n) => n * 3_600_000;

  it('follows the tier schedule', () => {
    expect(backoffDelayMinutes(h(72))).toBe(30);
    expect(backoffDelayMinutes(h(24))).toBe(10);
    expect(backoffDelayMinutes(h(6))).toBe(2);
    expect(backoffDelayMinutes(h(1))).toBe(1);
  });

  it('treats tier boundaries as the tighter (more frequent) side', () => {
    expect(backoffDelayMinutes(h(48))).toBe(10);
    expect(backoffDelayMinutes(h(12))).toBe(2);
    expect(backoffDelayMinutes(h(3))).toBe(1);
  });

  it('stays at 1 minute inside the final stretch', () => {
    expect(backoffDelayMinutes(35 * 60_000)).toBe(1);
  });
});

describe('evaluateGroups', () => {
  const ROOMS = [
    { eid: 1, name: 'Silent 101', grouping: 'Individual Silent Study', capacity: 1 },
    { eid: 2, name: 'Group 201', grouping: 'Group Study Rooms', capacity: 6 },
    { eid: 3, name: 'Silent 102', grouping: 'Individual Silent Study', capacity: null },
  ];

  // Room 1 free 10:00–13:00 (two mergeable slots), room 2 free 11:00–12:00 only,
  // room 3 booked all morning.
  const GRID = [
    { itemId: 1, start: '2026-07-10 10:00:00', end: '2026-07-10 11:30:00' },
    { itemId: 1, start: '2026-07-10 11:30:00', end: '2026-07-10 13:00:00' },
    { itemId: 2, start: '2026-07-10 11:00:00', end: '2026-07-10 12:00:00' },
    { itemId: 3, start: '2026-07-10 10:00:00', end: '2026-07-10 13:00:00', className: 's-lc-eq-r-unavailable' },
  ];

  const group = (over = {}) => ({
    id: 'g1',
    date: '2026-07-10',
    start_time: '11:00:00',
    end_time: '12:30:00',
    style: 'Individual Silent Study',
    capacity: null,
    match_mode: 'exact',
    ...over,
  });

  const grids = { '2026-07-10': GRID };

  it('matches a room whose merged free range covers the whole window', () => {
    const { matches, errors } = evaluateGroups([group()], ROOMS, grids);
    expect(errors).toEqual([]);
    expect(matches).toHaveLength(1);
    expect(matches[0].rooms.map((r) => r.eid)).toEqual([1]);
  });

  it('rejects rooms that only partially cover the window', () => {
    // Room 2's 11:00–12:00 range does not reach 12:30.
    const { matches } = evaluateGroups([group({ style: 'Group Study Rooms' })], ROOMS, grids);
    expect(matches).toEqual([]);
  });

  it('accepts HH:MM times as well as Postgres HH:MM:SS', () => {
    const { matches } = evaluateGroups(
      [group({ start_time: '11:00', end_time: '12:30' })],
      ROOMS,
      grids
    );
    expect(matches).toHaveLength(1);
  });

  it('filters by capacity band and excludes unknown-capacity rooms', () => {
    const wantSmall = group({ style: null, capacity: '1-4' });
    const { matches } = evaluateGroups([wantSmall], ROOMS, grids);
    // Room 1 (capacity 1) qualifies; room 3 (null capacity) must not.
    expect(matches[0].rooms.map((r) => r.eid)).toEqual([1]);
  });

  it('respects null style/capacity as "any"', () => {
    const { matches } = evaluateGroups([group({ style: null })], ROOMS, grids);
    expect(matches[0].rooms.map((r) => r.eid)).toEqual([1]);
  });

  it('keeps dates isolated: a grid for one date never satisfies another', () => {
    const otherDay = group({ id: 'g2', date: '2026-07-11' });
    const { matches, errors } = evaluateGroups([otherDay], ROOMS, grids);
    expect(matches).toEqual([]);
    expect(errors).toEqual([
      { groupId: 'g2', stage: 'match', message: 'no grid for date 2026-07-11' },
    ]);
  });

  it('surfaces unknown match_mode as an error instead of silently skipping', () => {
    const { matches, errors } = evaluateGroups([group({ match_mode: 'min_overlap' })], ROOMS, grids);
    expect(matches).toEqual([]);
    expect(errors).toEqual([
      { groupId: 'g1', stage: 'match', message: 'unknown match_mode: min_overlap' },
    ]);
  });

  it('shares one range computation across groups on the same date', () => {
    const g1 = group();
    const g2 = group({ id: 'g2', style: null, capacity: '1-4' });
    const { matches } = evaluateGroups([g1, g2], ROOMS, grids);
    expect(matches).toHaveLength(2);
  });
});
