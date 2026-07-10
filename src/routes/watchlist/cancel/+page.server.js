import { select } from '$lib/server/supabase.js';

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Landing page for the cancel link in notification emails. Mail scanners
// prefetch links, so this load is strictly read-only — the actual cancel is a
// button on the page that POSTs to /api/watchlist/cancel.
export async function load({ url }) {
  const wid = url.searchParams.get('wid') ?? '';
  const token = url.searchParams.get('token') ?? '';

  if (!UUID_RE.test(wid) || !TOKEN_RE.test(token)) {
    return { valid: false, wid: '', token: '' };
  }

  try {
    const query = new URLSearchParams({
      select:
        'id,status,group:requirement_groups(date,start_time,end_time,style,capacity)',
      id: `eq.${wid}`,
      manage_token: `eq.${token}`,
      limit: '1',
    });
    const rows = await select('watchlists', query.toString());
    const entry = rows?.[0] ?? null;
    return { valid: entry != null, entry, wid, token };
  } catch (err) {
    console.error('[snellview] watchlist cancel page load failed:', err);
    return { valid: false, error: true, wid: '', token: '' };
  }
}
