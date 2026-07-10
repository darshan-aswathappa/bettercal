import { json } from '@sveltejs/kit';
import { getWindow, windowErrorMessage, CAPACITY_BANDS, STYLES } from '$lib/filters.js';
import { hashRequirement } from '$lib/server/watchlist-core.js';
import { rpc, select } from '$lib/server/supabase.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// LibCal availability is Boston wall time; "today" must be too. The server may
// run in UTC, where the calendar day rolls over at 8pm Boston — so never use
// the server's local date here.
function todayNY() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

// Friendly messages for the RPC's RAISE EXCEPTION codes. Anything not listed
// here is an unexpected failure and becomes a 502.
const RPC_ERRORS = {
  limit_email: { status: 429, error: 'That email already has 10 active watchlists. Cancel one first.' },
  limit_token: { status: 429, error: 'This browser already has 10 active watchlists. Cancel one first.' },
  limit_ip: { status: 429, error: 'Too many watchlists created recently. Try again in an hour.' },
  too_late: { status: 400, error: 'That window starts too soon — watchlists close 30 minutes before the start time.' },
  already_found: { status: 409, error: 'A room was already found for this window — search again, it may still be free.' },
};

/** Validate the create payload; returns an error string or null. */
function validate(body) {
  if (!body || typeof body !== 'object') return 'Invalid request body.';
  const { requestId, email, token, date, from, to, style, capacity } = body;
  if (!UUID_RE.test(requestId ?? '')) return 'requestId must be a UUID.';
  if (typeof email !== 'string' || email.length > 254 || !EMAIL_RE.test(email.trim())) {
    return 'Enter a valid email address.';
  }
  if (!TOKEN_RE.test(token ?? '')) return 'Invalid browser token.';
  if (!DATE_RE.test(date ?? '')) return 'date must be YYYY-MM-DD.';
  if (date < todayNY()) return 'That date has already passed.';
  if (!TIME_RE.test(from ?? '')) return 'Start time is required.';
  if (!TIME_RE.test(to ?? '')) return 'Set an end time to join the watchlist.';
  const win = getWindow({ date, from, to });
  if (win?.invalid) return windowErrorMessage(win.reason);
  if (style && !STYLES.includes(style)) return 'Unknown room style.';
  if (capacity && !Object.prototype.hasOwnProperty.call(CAPACITY_BANDS, capacity)) {
    return 'Unknown capacity band.';
  }
  return null;
}

// POST /api/watchlist — join. All shape validation happens here; the
// create_watchlist RPC owns only the atomic parts (idempotency, rate-limit
// counts, DB-clock deadline math, dedupe).
export async function POST(event) {
  let body;
  try {
    body = await event.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const invalid = validate(body);
  if (invalid) return json({ ok: false, error: invalid }, { status: 400 });

  const { requestId, email, token, date, from, to, style = '', capacity = '' } = body;
  const hash = await hashRequirement({ date, start: from, end: to, style, capacity });

  let ip = null;
  try {
    ip = event.getClientAddress();
  } catch {
    // not available in every environment (e.g. some tests); rate limit by IP is best-effort
  }

  try {
    const rows = await rpc('create_watchlist', {
      p_request_id: requestId,
      p_hash: hash,
      p_email: email,
      p_token: token,
      p_date: date,
      p_start: from,
      p_end: to,
      p_style: style,
      p_capacity: capacity,
      p_ip: ip,
    });
    const row = rows?.[0];
    if (!row) throw new Error('create_watchlist returned no row');
    return json({ ok: true, watchlistId: row.watchlist_id, groupId: row.group_id, dedup: row.dedup });
  } catch (err) {
    const mapped = RPC_ERRORS[err.message];
    if (mapped) return json({ ok: false, error: mapped.error }, { status: mapped.status });
    console.error('[snellview] POST /api/watchlist failed:', err);
    return json({ ok: false, error: 'Could not save your watchlist. Try again shortly.' }, { status: 502 });
  }
}

// GET /api/watchlist?token= — every entry (any status) for this browser token,
// with its requirement group embedded, newest first.
export async function GET({ url }) {
  const token = url.searchParams.get('token') ?? '';
  if (!TOKEN_RE.test(token)) {
    return json({ ok: false, error: 'Invalid token.' }, { status: 400 });
  }

  try {
    const query = new URLSearchParams({
      select:
        'id,status,notified_at,created_at,' +
        'group:requirement_groups(date,start_time,end_time,style,capacity,status,poll_cutoff_at,expires_at)',
      manage_token: `eq.${token}`,
      order: 'created_at.desc',
      limit: '50',
    });
    const entries = await select('watchlists', query.toString());
    return json({ ok: true, entries }, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    console.error('[snellview] GET /api/watchlist failed:', err);
    return json({ ok: false, error: 'Could not load your watchlist. Try again shortly.' }, { status: 502 });
  }
}
