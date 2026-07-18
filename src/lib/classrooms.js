// Classroom schedules: turn the rooms.lftq.in per-room schedule (weekday-keyed
// recurring class blocks) into free time ranges for a date, in the same
// {start, end} "YYYY-MM-DD HH:mm:ss" shape LibCal ranges use — so window
// matching, filters, sorting, and the room list UI work unchanged.
//
// The data has no building-hours signal, so "free" is the complement of the
// day's class blocks within an assumed daily open window.

export const OPEN_SECONDS = 7 * 3600; // 07:00
export const CLOSE_SECONDS = 23 * 3600; // 23:00

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Lowercase weekday name for a YYYY-MM-DD date. Computed via Date.UTC so the
 * answer never depends on the server's or browser's local timezone.
 *
 * @param {string} date YYYY-MM-DD
 */
export function weekdayOf(date) {
  const [y, m, d] = date.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/**
 * Split an API room name into building + room parts. The room token is always
 * last: "Behrakis Health Sciences Cntr 307" → { building: "Behrakis Health
 * Sciences Cntr", room: "307" }; "West Village F 020" → building "West Village F".
 */
export function parseRoomName(name) {
  const idx = name.lastIndexOf(' ');
  if (idx === -1) return { building: '', room: name };
  return { building: name.slice(0, idx), room: name.slice(idx + 1) };
}

/** Seconds since midnight → "HH:MM:SS" (24h). */
export function fmtSeconds(sec) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(sec / 3600))}:${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}`;
}

/**
 * Class blocks applying on the given date: same weekday, and the date falls
 * inside the block's [startDate, endDate] recurrence window (string compare is
 * safe for ISO dates). Blocks are clipped to the open window, sorted, and
 * merged — overlapping/adjacent blocks occur when back-to-back classes share
 * a room.
 *
 * @param {Record<string, Array<{startDate:string, endDate:string,
 *   time:{start:number, end:number}}>>|null|undefined} schedule
 * @param {string} date YYYY-MM-DD
 * @returns {Array<{start:number, end:number}>} merged blocks, seconds since midnight
 */
export function blocksForDate(schedule, date) {
  const blocks = schedule?.[weekdayOf(date)] ?? [];
  const active = blocks
    .filter((b) => b.startDate <= date && date <= b.endDate)
    .map((b) => ({
      start: Math.max(b.time.start, OPEN_SECONDS),
      end: Math.min(b.time.end, CLOSE_SECONDS),
    }))
    .filter((b) => b.start < b.end)
    .sort((a, b) => a.start - b.start);

  const merged = [];
  for (const b of active) {
    const last = merged[merged.length - 1];
    if (last && b.start <= last.end) {
      last.end = Math.max(last.end, b.end);
    } else {
      merged.push({ ...b });
    }
  }
  return merged;
}

/**
 * Free ranges for a room on a date: the complement of its class blocks within
 * [OPEN_SECONDS, CLOSE_SECONDS]. A room with no classes that day (including
 * weekends, which have no schedule key at all) is free for the whole window.
 *
 * @param {Parameters<typeof blocksForDate>[0]} schedule
 * @param {string} date YYYY-MM-DD
 * @returns {Array<{start:string, end:string}>} LibCal-format range strings
 */
export function freeRangesForDate(schedule, date) {
  const blocks = blocksForDate(schedule, date);
  const ranges = [];
  let cursor = OPEN_SECONDS;
  for (const b of blocks) {
    if (b.start > cursor) ranges.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < CLOSE_SECONDS) ranges.push({ start: cursor, end: CLOSE_SECONDS });
  return ranges.map((r) => ({
    start: `${date} ${fmtSeconds(r.start)}`,
    end: `${date} ${fmtSeconds(r.end)}`,
  }));
}
