// "Room found" notification email builder. Pure — takes data in, returns
// {subject, html, text}. CANONICAL COPY in supabase/functions/_shared/;
// runtime-neutral (no env access, no platform APIs).

/** Escape everything interpolated into HTML — even LibCal room names. */
export function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * LibCal's space page defaults to today unless given ?date=. Mirrors
 * buildBookUrl in src/lib/format.js (UI copy) — kept tiny on purpose.
 */
export function buildBookUrl(baseUrl, dateOrTs) {
  if (!dateOrTs) return baseUrl;
  return `${baseUrl}?date=${encodeURIComponent(dateOrTs)}`;
}

/** "HH:MM[:SS]" → "11:00 AM" without any Date/timezone machinery. */
export function fmtClock(time) {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** "2026-07-10" → "Jul 10" (UTC-pinned so the label never shifts a day). */
export function fmtDateShort(date) {
  const d = new Date(`${date}T00:00:00Z`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

const MAX_ROOMS = 5;

/**
 * Build the notify-once email for a fulfilled requirement group.
 *
 * @param {{date:string, start_time:string, end_time:string, style?:string|null,
 *          capacity?:string|null}} group
 * @param {Array<{eid:number, name:string, grouping?:string, capacity?:number|null,
 *                bookUrl?:string}>} rooms  rooms confirmed free (second check)
 * @param {{watchlistId:string, manageToken:string, appBaseUrl:string}} recipient
 * @returns {{subject:string, html:string, text:string}}
 */
export function buildFoundEmail(group, rooms, { watchlistId, manageToken, appBaseUrl }) {
  const windowLabel = `${fmtClock(group.start_time)} – ${fmtClock(group.end_time)}`;
  const dateLabel = fmtDateShort(group.date);
  const startTs = `${group.date} ${group.start_time.slice(0, 5)}:00`;
  const endClock = fmtClock(group.end_time);
  const shown = rooms.slice(0, MAX_ROOMS);
  const cancelUrl = `${appBaseUrl}/watchlist/cancel?wid=${encodeURIComponent(watchlistId)}&token=${encodeURIComponent(manageToken)}`;

  const subject = `Room found: ${dateLabel}, ${windowLabel} at Snell`;

  const criteria = [group.style, group.capacity ? `${group.capacity} people` : null]
    .filter(Boolean)
    .join(' · ');

  const roomsHtml = shown
    .map((room) => {
      const meta = [room.grouping, room.capacity != null ? `seats ${room.capacity}` : null]
        .filter(Boolean)
        .join(' · ');
      return `
      <tr>
        <td style="padding:14px 0;border-bottom:1px solid #E6E6E6;">
          <div style="font-weight:600;color:#1A1A1A;font-size:15px;">${escapeHtml(room.name)}</div>
          ${meta ? `<div style="color:#6B6B6B;font-size:13px;margin-top:2px;">${escapeHtml(meta)}</div>` : ''}
        </td>
        <td style="padding:14px 0;border-bottom:1px solid #E6E6E6;text-align:right;">
          <a href="${escapeHtml(buildBookUrl(room.bookUrl ?? '', startTs))}"
             style="background:#D41B2C;color:#FFFFFF;text-decoration:none;font-size:13px;font-weight:600;padding:9px 16px;display:inline-block;">Book Now →</a>
        </td>
      </tr>`;
    })
    .join('');

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#F4F4F4;font-family:'Helvetica Neue',Arial,sans-serif;color:#333333;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <div style="background:#FFFFFF;border-top:3px solid #D41B2C;padding:28px;">
      <div style="font-size:19px;color:#1A1A1A;margin-bottom:4px;">SnellView</div>
      <h1 style="font-size:20px;font-weight:600;color:#1A1A1A;margin:18px 0 6px;">A room just opened up</h1>
      <p style="margin:0 0 4px;font-size:14px;">
        Matching your watchlist for <strong>${escapeHtml(dateLabel)}, ${escapeHtml(windowLabel)}</strong>${criteria ? ` (${escapeHtml(criteria)})` : ''}:
      </p>
      <table style="width:100%;border-collapse:collapse;margin:10px 0 4px;">${roomsHtml}</table>
      ${rooms.length > MAX_ROOMS ? `<p style="font-size:13px;color:#6B6B6B;margin:8px 0 0;">…and ${rooms.length - MAX_ROOMS} more matching room${rooms.length - MAX_ROOMS === 1 ? '' : 's'}.</p>` : ''}
      <p style="font-size:13px;color:#6B6B6B;margin:18px 0 0;">
        LibCal defaults to a 1-hour booking — <strong>set the end time to ${escapeHtml(endClock)}</strong>.
      </p>
      <p style="font-size:13px;color:#6B6B6B;margin:8px 0 0;">
        Availability was confirmed moments ago but may no longer be available.
      </p>
    </div>
    <div style="padding:16px 28px;font-size:12px;color:#6B6B6B;">
      <p style="margin:0 0 6px;">
        This was a one-time notification — this watchlist is now complete.
        Requested window: ${escapeHtml(dateLabel)}, ${escapeHtml(windowLabel)}.
      </p>
      <p style="margin:0;">
        <a href="${escapeHtml(cancelUrl)}" style="color:#D41B2C;">Manage or cancel your watchlists</a>
      </p>
    </div>
  </div>
</body>
</html>`;

  const text = [
    `A room just opened up matching your watchlist for ${dateLabel}, ${windowLabel}${criteria ? ` (${criteria})` : ''}:`,
    '',
    ...shown.map((room) => {
      const meta = [room.grouping, room.capacity != null ? `seats ${room.capacity}` : null]
        .filter(Boolean)
        .join(' · ');
      return `- ${room.name}${meta ? ` (${meta})` : ''}\n  Book: ${buildBookUrl(room.bookUrl ?? '', startTs)}`;
    }),
    rooms.length > MAX_ROOMS ? `…and ${rooms.length - MAX_ROOMS} more matching rooms.` : '',
    '',
    `LibCal defaults to a 1-hour booking — set the end time to ${endClock}.`,
    'Availability was confirmed moments ago but may no longer be available.',
    '',
    'This was a one-time notification — this watchlist is now complete.',
    `Manage or cancel your watchlists: ${cancelUrl}`,
  ]
    .filter((line) => line !== '')
    .join('\n');

  return { subject, html, text };
}
