// Watchlist core: requirement normalization/hashing, worker backoff schedule,
// and group-vs-availability matching. CANONICAL COPY — lives in
// supabase/functions/_shared/ so both the SvelteKit server (via the
// src/lib/server/watchlist-core.js re-export shim) and the watchlist worker
// edge function import the same code. Keep this file runtime-neutral: fetch /
// crypto.subtle / pure functions only — no $env, no node or Deno APIs.

import { freeRangesByRoom, rangeCoversWindow } from './slots.js';

/*
 * HASH VERSIONING POLICY
 *
 * The preimage below starts with HASH_VERSION ("v1"). Any change to the
 * algorithm, normalization, delimiter, field order, or dimension set MUST
 * introduce "v2" (then "v3", ...) — never modify how an existing version is
 * computed, and never reuse a retired version string.
 *
 * No migration is ever needed on a version bump: hashes are computed only at
 * watchlist-creation time and used only for grouping. Existing groups keep
 * working; new-version entries simply never collide with old hashes. Two
 * users with identical requirements straddling a bump land in separate groups
 * (two polls instead of one) — acceptable, and self-healing because groups
 * are date-scoped and expire.
 */
export const HASH_VERSION = 'v1';

// Mirrors CAPACITY_BANDS in src/lib/filters.js (which this file must not
// import — filters.js is UI-facing and pulls in format/sort). A vitest drift
// guard asserts the two stay identical.
export const CAPACITY_BANDS = {
  '1-4': [1, 4],
  '5-8': [5, 8],
};

const norm = (s) => (s ?? '').trim().toLowerCase();

/**
 * Deterministic preimage for a requirement. Empty string means "any" for
 * style/capacity. Future dimensions ride in `extra` as sorted |k=v pairs —
 * adding one is a hash-version bump (see policy above).
 *
 * @param {{date:string, start:string, end:string, style?:string, capacity?:string,
 *          extra?:Record<string,string>}} req  date YYYY-MM-DD, times HH:MM 24h
 * @returns {string}
 */
export function normalizeRequirement({ date, start, end, style, capacity, extra }) {
  const dims = extra
    ? Object.keys(extra)
        .sort()
        .map((k) => `|${k}=${norm(String(extra[k]))}`)
        .join('')
    : '';
  return `${HASH_VERSION}|${date}|${start}|${end}|${norm(style)}|${norm(capacity)}${dims}`;
}

/**
 * SHA-256 hex of the normalized requirement — the requirement-group key.
 * crypto.subtle exists globally in both Node >=20 and Deno.
 *
 * @param {Parameters<typeof normalizeRequirement>[0]} req
 * @returns {Promise<string>} 64-char lowercase hex
 */
export async function hashRequirement(req) {
  const bytes = new TextEncoder().encode(normalizeRequirement(req));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Adaptive polling backoff: how long until a group should be checked again,
 * given how far away its slot start is. The worker clamps the result to the
 * group's poll cutoff (start - 30 min), which bounds the 1-minute tier.
 *
 * @param {number} msUntilStart  slot_start_at - now
 * @returns {number} minutes until next check
 */
export function backoffDelayMinutes(msUntilStart) {
  const hours = msUntilStart / 3_600_000;
  if (hours > 48) return 30;
  if (hours > 12) return 10;
  if (hours > 3) return 2;
  return 1;
}

/** "HH:MM" or "HH:MM:SS" (Postgres time) → "HH:MM:SS". */
function toHms(t) {
  return t.length === 5 ? `${t}:00` : t;
}

/** Does a room satisfy a group's style/capacity requirement (null/'' = any)? */
function roomMatchesGroup(room, group) {
  if (group.style && room.grouping !== group.style) return false;
  if (group.capacity) {
    const band = CAPACITY_BANDS[group.capacity];
    if (!band) return false;
    if (room.capacity == null || room.capacity < band[0] || room.capacity > band[1]) return false;
  }
  return true;
}

/**
 * Match claimed requirement groups against LibCal availability. Pure: one
 * grid's free ranges are computed once per date and shared by every group on
 * that date (the whole point of requirement grouping).
 *
 * Dispatches on group.match_mode — only 'exact' (free range fully covers the
 * requested window) is implemented; unknown modes are surfaced as errors, not
 * silently skipped.
 *
 * @param {Array<{id:string, date:string, start_time:string, end_time:string,
 *                style?:string|null, capacity?:string|null, match_mode?:string}>} groups
 * @param {Array<{eid:number, name:string, grouping?:string, capacity?:number|null,
 *                bookUrl?:string}>} rooms
 * @param {Record<string, Array<{start:string,end:string,itemId:number,className?:string}>>} gridsByDate
 * @returns {{matches: Array<{group:object, rooms:object[]}>,
 *            errors: Array<{groupId:string, stage:string, message:string}>}}
 */
export function evaluateGroups(groups, rooms, gridsByDate) {
  const rangesByDate = new Map();
  const matches = [];
  const errors = [];

  for (const group of groups) {
    const mode = group.match_mode ?? 'exact';
    if (mode !== 'exact') {
      errors.push({ groupId: group.id, stage: 'match', message: `unknown match_mode: ${mode}` });
      continue;
    }
    const grid = gridsByDate[group.date];
    if (!grid) {
      errors.push({ groupId: group.id, stage: 'match', message: `no grid for date ${group.date}` });
      continue;
    }
    if (!rangesByDate.has(group.date)) rangesByDate.set(group.date, freeRangesByRoom(grid));
    const ranges = rangesByDate.get(group.date);

    const from = `${group.date} ${toHms(group.start_time)}`;
    const to = `${group.date} ${toHms(group.end_time)}`;
    const matched = rooms.filter(
      (room) =>
        roomMatchesGroup(room, group) &&
        (ranges.get(room.eid) ?? []).some((r) => rangeCoversWindow(r, from, to))
    );
    if (matched.length > 0) matches.push({ group, rooms: matched });
  }

  return { matches, errors };
}
