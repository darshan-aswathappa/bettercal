// Pure slot logic: turn LibCal's 15-minute slot list into merged free
// time ranges per room. A slot is free when it has no `className`
// (booked = "s-lc-eq-r-unavailable", closing/checkout = "s-lc-eq-checkout").

/**
 * @param {Array<{start:string,end:string,itemId:number,className?:string}>} slots
 * @returns {Map<number, Array<{start:string,end:string}>>} free ranges keyed by itemId
 */
export function freeRangesByRoom(slots) {
  const byRoom = new Map();
  for (const slot of slots) {
    if (slot.className) continue; // anything flagged is not bookable
    if (!byRoom.has(slot.itemId)) byRoom.set(slot.itemId, []);
    byRoom.get(slot.itemId).push({ start: slot.start, end: slot.end });
  }

  const merged = new Map();
  for (const [itemId, roomSlots] of byRoom) {
    const sorted = [...roomSlots].sort((a, b) => a.start.localeCompare(b.start));
    const ranges = [];
    for (const s of sorted) {
      const last = ranges[ranges.length - 1];
      if (last && last.end === s.start) {
        ranges[ranges.length - 1] = { start: last.start, end: s.end };
      } else {
        ranges.push({ start: s.start, end: s.end });
      }
    }
    merged.set(itemId, ranges);
  }
  return merged;
}

/** Keep only ranges overlapping the given date (YYYY-MM-DD), string-compare safe. */
export function rangesForDate(ranges, date) {
  return ranges.filter((r) => r.start.startsWith(date));
}

/**
 * Does a free range fully cover the requested window?
 * Timestamps are "YYYY-MM-DD HH:mm:ss" strings, which sort lexically in time
 * order, so string comparison is a safe stand-in for time comparison here.
 *
 * @param {{start:string,end:string}} range
 * @param {string} from  window start "YYYY-MM-DD HH:mm:ss"
 * @param {string|null} to  window end, or null for an instant at `from`
 */
export function rangeCoversWindow(range, from, to) {
  if (to) return range.start <= from && range.end >= to;
  return range.start <= from && range.end > from;
}
