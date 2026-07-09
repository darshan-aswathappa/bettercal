// Pure formatting + time helpers shared by the UI components. Lifted verbatim
// from the old public/app.js (they were already side-effect free).

export function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// LibCal timestamps are "YYYY-MM-DD HH:mm:ss" in Boston local time;
// we treat them as browser-local, which is right for people on campus.
export function parseTs(ts) {
  return new Date(ts.replace(' ', 'T'));
}

export function fmtTime(ts) {
  return parseTs(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function fmtDuration(ms) {
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

// Format a Date as an "HH:mm" string for a <input type="time"> value.
export function toTimeInput(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Turn an "HH:mm" input value into a Date on today's calendar day.
export function fromTimeInput(value) {
  const [h, m] = value.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

// Round a Date up to the next quarter hour, matching the pickers' 15-min step.
export function roundUpToQuarter(d) {
  const step = 15 * 60 * 1000;
  return new Date(Math.ceil(d.getTime() / step) * step);
}

export function windowLabel(win) {
  const fromLabel = fmtTime(win.from);
  return win.to ? `${fromLabel} – ${fmtTime(win.to)}` : `from ${fromLabel}`;
}

// LibCal defaults every booking to 1 hour once you click a start slot, so a
// user aiming for a longer window has to change the end dropdown by hand. This
// spells out the exact end time to select. Empty for open-ended windows, which
// have no specific end to instruct.
export function bookingHint(win) {
  if (!win?.to) return '';
  return `set end: ${fmtTime(win.to)} (default is 1h)`;
}

// LibCal's space page defaults to today unless given ?date=. Pass either a
// plain date (YYYY-MM-DD) or a full "YYYY-MM-DD HH:mm:ss" to pre-position it.
export function buildBookUrl(baseUrl, dateOrTs) {
  if (!dateOrTs) return baseUrl;
  return `${baseUrl}?date=${encodeURIComponent(dateOrTs)}`;
}
