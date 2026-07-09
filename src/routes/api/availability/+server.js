import { json } from '@sveltejs/kit';
import { buildAvailability } from '$lib/server/availability.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// JSON endpoint the client refetches on date change and every minute.
// Response shape matches the old Node server so the browser code is unchanged:
// { ok, date, generatedAt, rooms } on success, { ok:false, error } otherwise.
export async function GET({ url }) {
  const date = url.searchParams.get('date');
  if (!date || !DATE_RE.test(date)) {
    return json({ ok: false, error: 'date must be YYYY-MM-DD' }, { status: 400 });
  }

  try {
    const payload = await buildAvailability(date);
    return json(payload, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    console.error(`[bettercal] /api/availability?date=${date} failed:`, err);
    return json(
      { ok: false, error: 'Could not reach LibCal. Try again shortly.' },
      { status: 502 }
    );
  }
}
