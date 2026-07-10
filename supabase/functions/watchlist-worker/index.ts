// Watchlist polling worker. Invoked every minute by pg_cron (via pg_net), but
// only when at least one requirement group is due — see the 'watchlist-worker'
// cron job in migrations/0002_worker_cron.sql.
//
// Per run: lease-claim due groups → one LibCal grid fetch per distinct date →
// match (pure, _shared/watchlist-core.js) → 20s double-check → notify every
// ACTIVE watchlist in each confirmed group via Resend batch → record
// notifications + worker_runs → reschedule the rest with adaptive backoff.
//
// Auth: x-worker-secret header, compared against the Vault 'worker_secret'
// (read through the worker_config() RPC). Deployed with verify_jwt=false.

import { fetchRooms, fetchGrid } from '../_shared/libcal.js';
import { evaluateGroups, backoffDelayMinutes } from '../_shared/watchlist-core.js';
import { buildFoundEmail } from '../_shared/email.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const VERIFY_DELAY_MS = Number(Deno.env.get('VERIFY_DELAY_MS') ?? 20_000);
const EMAIL_BATCH_SIZE = 100;
const MAX_ROOMS_RECORDED = 5;

type Dict = Record<string, unknown>;
type WorkerError = { stage: string; message: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** "YYYY-MM-DD" → the following day, for fetchGrid's [start, end) range. */
const nextDay = (date: string) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

async function pg(path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error((data as Dict)?.message as string ?? `postgrest ${res.status} on ${path}`);
  }
  return data;
}

const rpc = (fn: string, args: Dict) =>
  pg(`/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });

const insertRows = (table: string, rows: Dict[], returning = false) =>
  pg(`/${table}`, {
    method: 'POST',
    body: JSON.stringify(rows),
    headers: returning ? { prefer: 'return=representation' } : { prefer: 'return=minimal' },
  });

interface WorkerConfig {
  workerSecret: string;
  resendKey: string;
  appBaseUrl: string;
  fromEmail: string;
  batchDelayMs: number;
}

// Config is Vault-backed with env-var overrides, cached per isolate — rotate a
// Vault secret and redeploy (or wait for isolate recycling) to pick it up.
let cachedConfig: WorkerConfig | null = null;
async function loadConfig(): Promise<WorkerConfig> {
  if (cachedConfig) return cachedConfig;
  const rows = (await rpc('worker_config', {})) as { name: string; secret: string }[];
  const vault = Object.fromEntries(rows.map((r) => [r.name, r.secret ?? '']));
  cachedConfig = {
    workerSecret: Deno.env.get('WORKER_SECRET') || vault.worker_secret || '',
    resendKey: Deno.env.get('RESEND_API_KEY') || vault.resend_api_key || '',
    appBaseUrl: Deno.env.get('APP_BASE_URL') || vault.app_base_url || 'http://localhost:5173',
    fromEmail: Deno.env.get('FROM_EMAIL') || vault.from_email || 'onboarding@resend.dev',
    batchDelayMs: Number(Deno.env.get('EMAIL_BATCH_DELAY_MS') || vault.email_batch_delay_ms || 300),
  };
  return cachedConfig;
}

async function fetchGridsFor(dates: string[]): Promise<Record<string, unknown[]>> {
  const entries = await Promise.all(
    dates.map(async (date) => [date, await fetchGrid(date, nextDay(date))] as const)
  );
  return Object.fromEntries(entries);
}

interface Recipient {
  id: string;
  email: string;
  manage_token: string;
}

/**
 * Send the notify-once email to every recipient of a confirmed group, in
 * chunks of 100 with an inter-chunk delay (provider throttling), and record
 * one `notifications` row per attempt. Recipients are already FOUND — a
 * failure here is logged, never retried (missed email over double email).
 */
async function sendGroupEmails(
  cfg: WorkerConfig,
  group: Dict,
  matchedRooms: Dict[],
  recipients: Recipient[]
): Promise<{ sent: number; batches: number; errors: WorkerError[] }> {
  const errors: WorkerError[] = [];
  const matchedRoomsJson = matchedRooms
    .slice(0, MAX_ROOMS_RECORDED)
    .map((r) => ({ eid: r.eid, name: r.name }));
  const notifRows: Dict[] = [];
  let sent = 0;
  let batches = 0;

  for (let i = 0; i < recipients.length; i += EMAIL_BATCH_SIZE) {
    const chunkRecipients = recipients.slice(i, i + EMAIL_BATCH_SIZE);
    if (i > 0) await sleep(cfg.batchDelayMs);
    batches += 1;

    const payload = chunkRecipients.map((r) => {
      const msg = buildFoundEmail(group, matchedRooms, {
        watchlistId: r.id,
        manageToken: r.manage_token,
        appBaseUrl: cfg.appBaseUrl,
      });
      return {
        from: `SnellView <${cfg.fromEmail}>`,
        to: [r.email],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      };
    });

    let ok = false;
    let ids: (string | null)[] = [];
    let errMsg = '';
    if (!cfg.resendKey) {
      errMsg = 'resend_api_key not configured (Vault)';
    } else {
      try {
        const res = await fetch('https://api.resend.com/emails/batch', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${cfg.resendKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        const data = (await res.json().catch(() => null)) as Dict | null;
        if (res.ok) {
          ok = true;
          ids = ((data?.data as Dict[]) ?? []).map((d) => (d.id as string) ?? null);
        } else {
          errMsg = (data?.message as string) || `resend ${res.status}`;
        }
      } catch (err) {
        errMsg = String(err);
      }
    }

    if (ok) sent += chunkRecipients.length;
    else errors.push({ stage: 'notify', message: errMsg });

    notifRows.push(
      ...chunkRecipients.map((r, idx) => ({
        watchlist_id: r.id,
        group_id: group.id,
        email: r.email,
        matched_rooms: matchedRoomsJson,
        provider: 'resend',
        provider_message_id: ok ? ids[idx] ?? null : null,
        status: ok ? 'sent' : 'failed',
        error_message: ok ? null : errMsg,
      }))
    );
  }

  try {
    if (notifRows.length) await insertRows('notifications', notifRows);
  } catch (err) {
    errors.push({ stage: 'db', message: `notifications insert: ${String(err)}` });
  }
  return { sent, batches, errors };
}

Deno.serve(async (req: Request) => {
  let cfg: WorkerConfig;
  try {
    cfg = await loadConfig();
  } catch (err) {
    console.error('worker_config load failed:', err);
    return new Response(JSON.stringify({ ok: false, error: 'config' }), { status: 500 });
  }
  if (!cfg.workerSecret || req.headers.get('x-worker-secret') !== cfg.workerSecret) {
    return new Response('unauthorized', { status: 401 });
  }

  const workerId = crypto.randomUUID();
  const t0 = Date.now();
  const counters = {
    claimed_groups: 0,
    groups_checked: 0,
    groups_found: 0,
    rooms_found: 0,
    emails_sent: 0,
    notification_batches: 0,
  };
  const errors: WorkerError[] = [];
  let runId: string | null = null;

  try {
    const runRows = (await insertRows('worker_runs', [{ status: 'running' }], true)) as Dict[];
    runId = runRows[0]?.id as string;

    const groups = (await rpc('claim_due_groups', { p_worker_id: workerId })) as Dict[];
    counters.claimed_groups = groups.length;

    if (groups.length > 0) {
      let rooms: Dict[] | null = null;
      let gridsByDate: Record<string, unknown[]> | null = null;
      const dates = [...new Set(groups.map((g) => g.date as string))];
      try {
        rooms = (await fetchRooms()) as Dict[];
        gridsByDate = await fetchGridsFor(dates);
      } catch (err) {
        errors.push({ stage: 'libcal', message: String(err) });
      }

      if (rooms && gridsByDate) {
        counters.groups_checked = groups.length;
        const phaseA = evaluateGroups(groups, rooms, gridsByDate);
        errors.push(
          ...phaseA.errors.map((e: { groupId: string; message: string }) => ({
            stage: 'match',
            message: `${e.groupId}: ${e.message}`,
          }))
        );

        // Double-check ~20s later so we never email about a room that
        // vanished immediately; the email lists rooms from the SECOND look.
        let confirmed: { group: Dict; rooms: Dict[] }[] = [];
        if (phaseA.matches.length > 0) {
          await sleep(VERIFY_DELAY_MS);
          const candidateGroups = phaseA.matches.map((m: { group: Dict }) => m.group);
          const candidateDates = [...new Set(candidateGroups.map((g) => g.date as string))];
          try {
            const freshGrids = await fetchGridsFor(candidateDates);
            confirmed = evaluateGroups(candidateGroups, rooms, freshGrids).matches;
          } catch (err) {
            errors.push({ stage: 'libcal', message: `verify: ${String(err)}` });
          }
        }

        counters.groups_found = confirmed.length;
        const confirmedIds = new Set(confirmed.map((m) => m.group.id));

        for (const { group, rooms: matchedRooms } of confirmed) {
          counters.rooms_found += matchedRooms.length;
          try {
            const recipients = (await rpc('claim_group_recipients', {
              p_group_id: group.id,
            })) as Recipient[];
            if (recipients.length > 0) {
              const result = await sendGroupEmails(cfg, group, matchedRooms, recipients);
              counters.emails_sent += result.sent;
              counters.notification_batches += result.batches;
              errors.push(...result.errors);
            }
            await rpc('finish_group_found', { p_group_id: group.id });
          } catch (err) {
            errors.push({ stage: 'notify', message: `${group.id}: ${String(err)}` });
          }
        }

        for (const group of groups) {
          if (confirmedIds.has(group.id)) continue;
          const minutes = backoffDelayMinutes(
            Date.parse(group.slot_start_at as string) - Date.now()
          );
          try {
            await rpc('reschedule_group', { p_group_id: group.id, p_minutes: minutes });
          } catch (err) {
            errors.push({ stage: 'db', message: `reschedule ${group.id}: ${String(err)}` });
          }
        }
      } else {
        // LibCal was unreachable: release every lease with a 2-minute retry.
        for (const group of groups) {
          try {
            await rpc('reschedule_group', { p_group_id: group.id, p_minutes: 2 });
          } catch (err) {
            errors.push({ stage: 'db', message: `release ${group.id}: ${String(err)}` });
          }
        }
      }
    }
  } catch (err) {
    errors.push({ stage: 'run', message: String(err) });
  } finally {
    // A run that dies before this update stays 'running' with no finished_at —
    // that IS the crash signal, and its leases self-expire.
    if (runId) {
      await pg(`/worker_runs?id=eq.${runId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - t0,
          ...counters,
          errors,
          status: errors.length > 0 ? 'error' : 'ok',
        }),
      }).catch((err) => console.error('worker_runs finalize failed:', err));
    }
  }

  return new Response(JSON.stringify({ ok: errors.length === 0, ...counters, errors }), {
    headers: { 'content-type': 'application/json' },
  });
});
