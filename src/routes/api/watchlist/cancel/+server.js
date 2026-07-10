import { json } from '@sveltejs/kit';
import { rpc } from '$lib/server/supabase.js';

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/watchlist/cancel — {id, token} cancels one entry, {token, all:true}
// cancels every ACTIVE entry for the token. The (id, token) pair is the proof
// of ownership. The cancel_watchlists RPC is atomic and also expires any
// requirement group left with no ACTIVE watchers, so abandoned groups stop
// being polled immediately.
export async function POST({ request }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { id, token, all } = body ?? {};
  if (!TOKEN_RE.test(token ?? '')) {
    return json({ ok: false, error: 'Invalid token.' }, { status: 400 });
  }
  if (!all && !UUID_RE.test(id ?? '')) {
    return json({ ok: false, error: 'Invalid watchlist id.' }, { status: 400 });
  }

  try {
    const cancelled = await rpc('cancel_watchlists', {
      p_token: token,
      p_id: all ? null : id,
      p_all: Boolean(all),
    });
    if (!cancelled || cancelled === 0) {
      return json(
        { ok: false, error: 'Nothing to cancel — the entry may already be finished or the link is invalid.' },
        { status: 404 }
      );
    }
    return json({ ok: true, cancelled });
  } catch (err) {
    console.error('[snellview] POST /api/watchlist/cancel failed:', err);
    return json({ ok: false, error: 'Could not cancel. Try again shortly.' }, { status: 502 });
  }
}
