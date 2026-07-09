// "Need it for N minutes" quick-duration logic, lifted from public/app.js and
// made pure so it can be unit-tested and reused by the Filters component.

import { toTimeInput, fromTimeInput, roundUpToQuarter } from './format.js';

/**
 * Keep an existing start, else start now (rounded up to the quarter), then set
 * the end N minutes later — clamped so it never spills past midnight (23:45).
 *
 * @param {number} minutes
 * @param {string} fromValue current From input ("HH:mm" or "")
 * @param {Date} now
 * @returns {{from: string, to: string}} HH:mm values
 */
export function computePreset(minutes, fromValue, now) {
  const from = fromValue ? fromTimeInput(fromValue) : roundUpToQuarter(now);

  const endOfDay = new Date(from);
  endOfDay.setHours(23, 45, 0, 0);
  const to = new Date(from.getTime() + minutes * 60000);

  return { from: toTimeInput(from), to: toTimeInput(to > endOfDay ? endOfDay : to) };
}

/**
 * Duration in minutes of the current From/To window, or null when it is empty
 * or inverted. Used to highlight the matching preset button.
 *
 * @param {string} from "HH:mm" or ""
 * @param {string} to "HH:mm" or ""
 * @returns {number|null}
 */
export function activeMinutesFor(from, to) {
  if (!from || !to) return null;
  const diff = (fromTimeInput(to) - fromTimeInput(from)) / 60000;
  return diff > 0 ? diff : null;
}
