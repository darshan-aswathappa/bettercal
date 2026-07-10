// Minimal PostgREST client over fetch — deliberately not @supabase/supabase-js,
// keeping the app at zero runtime dependencies. Server-only: uses the service
// role key, which bypasses RLS; it must never reach the client bundle.
import { env } from '$env/dynamic/private';

function config() {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.example)');
  }
  return { url: url.replace(/\/+$/, ''), key };
}

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const { url, key } = config();
  const res = await fetch(`${url}/rest/v1${path}`, {
    method,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON error body; fall through with data = null
  }

  if (!res.ok) {
    // PostgREST error bodies carry {message, code, ...}; RAISE EXCEPTION
    // messages from RPCs (e.g. "limit_email") arrive in `message`.
    const err = new Error(data?.message || `Supabase request failed (${res.status})`);
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

/** POST /rest/v1/rpc/{fn}. Returns the function's result rows. */
export function rpc(fn, args) {
  return request(`/rpc/${encodeURIComponent(fn)}`, { method: 'POST', body: args });
}

/** GET /rest/v1/{table}?{query} — query is a prebuilt PostgREST query string. */
export function select(table, query) {
  return request(`/${table}?${query}`);
}

/** PATCH /rest/v1/{table}?{query} with the changed rows returned. */
export function update(table, query, patch) {
  return request(`/${table}?${query}`, {
    method: 'PATCH',
    body: patch,
    headers: { prefer: 'return=representation' },
  });
}
