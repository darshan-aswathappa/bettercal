// Builds the model for the multi-day quick-jump strip. Pure and clock-free
// (the starting "today" is passed in), so it runs identically under SSR and in
// the browser and is unit-testable without mocking dates.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * A rolling strip of `count` days starting at `startDate`. We start at today
 * rather than the calendar Monday because LibCal cannot book past days
 * (`minDate` is today) — every chip in the strip is therefore actionable.
 *
 * @param {string} startDate YYYY-MM-DD (typically today)
 * @param {number} [count=7]
 * @returns {Array<{date: string, weekday: string, day: number, isToday: boolean}>}
 */
export function buildDateStrip(startDate, count = 7) {
  const pad = (n) => String(n).padStart(2, '0');
  // Noon anchor avoids DST edges shifting the calendar day.
  const start = new Date(`${startDate}T12:00:00`);

  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return {
      date,
      weekday: WEEKDAYS[d.getDay()],
      day: d.getDate(),
      isToday: i === 0,
    };
  });
}
