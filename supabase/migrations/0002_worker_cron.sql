-- Worker SQL helpers + cron jobs. The edge function only calls these RPCs (plus
-- plain PostgREST inserts for worker_runs/notifications); the tricky claim /
-- release / expiry SQL lives here where it is atomic and reviewable.
--
-- Secrets live in Vault (not in this file). One-time setup, run in the SQL
-- editor with real values:
--   select vault.create_secret('<random hex>',        'worker_secret');
--   select vault.create_secret('<resend api key>',    'resend_api_key');
--   select vault.create_secret('https://<app host>',  'app_base_url');
-- Rotate with vault.update_secret(id, ...). The worker caches config per
-- isolate; redeploy (or wait for isolate recycling) after a rotation.

-- PostgREST executes RPCs as service_role; revoking PUBLIC strips its default
-- EXECUTE, so every function gets an explicit service_role grant.
grant execute on function create_watchlist(uuid, text, text, text, date, time, time, text, text, inet)
  to service_role;

-- Worker config: the ONLY reader of Vault. security definer because vault is
-- not readable by service_role directly.
create or replace function worker_config()
returns table (name text, secret text)
language sql
security definer
set search_path = ''
as $$
  select s.name, s.decrypted_secret
    from vault.decrypted_secrets s
   where s.name in ('worker_secret', 'resend_api_key', 'app_base_url',
                    'from_email', 'email_batch_delay_ms');
$$;

-- Atomic lease-based claim. Overlapping invocations can't double-claim (the
-- lease predicate excludes leased rows); a crashed worker needs no cleanup —
-- its rows stay due (next_check_at untouched) and become reclaimable the
-- moment the lease lapses.
create or replace function claim_due_groups(p_worker_id text)
returns setof requirement_groups
language sql
as $$
  update requirement_groups g
     set lease_until = now() + interval '2 minutes',
         leased_by = p_worker_id,
         last_checked_at = now(),
         updated_at = now()
   where g.status = 'active'
     and g.next_check_at <= now()
     and g.poll_cutoff_at > now()
     and (g.lease_until is null or g.lease_until < now())
  returning g.*;
$$;

-- Idempotent recipient claim: only rows still ACTIVE are flipped to FOUND and
-- returned, so racing workers can never double-email.
create or replace function claim_group_recipients(p_group_id uuid)
returns table (id uuid, email text, manage_token text)
language sql
as $$
  update watchlists w
     set status = 'FOUND', notified_at = now(), updated_at = now()
   where w.group_id = p_group_id
     and w.status = 'ACTIVE'
  returning w.id, w.email, w.manage_token;
$$;

create or replace function finish_group_found(p_group_id uuid)
returns void
language sql
as $$
  update requirement_groups g
     set status = 'found', lease_until = null, leased_by = null, updated_at = now()
   where g.id = p_group_id;
$$;

-- Backoff reschedule + lease release, clamped to the poll cutoff.
create or replace function reschedule_group(p_group_id uuid, p_minutes integer)
returns void
language sql
as $$
  update requirement_groups g
     set next_check_at = least(now() + make_interval(mins => p_minutes), g.poll_cutoff_at),
         lease_until = null,
         leased_by = null,
         updated_at = now()
   where g.id = p_group_id
     and g.status = 'active';
$$;

-- Lifecycle transitions, run by cron every minute. A watchlist deliberately
-- stays ACTIVE between the poll cutoff (group expired, start - 30 min) and the
-- window end (+1 min) — the UI labels that state "closing soon".
create or replace function expire_watchlists()
returns void
language sql
as $$
  update requirement_groups g
     set status = 'expired', lease_until = null, leased_by = null, updated_at = now()
   where g.status = 'active'
     and g.poll_cutoff_at <= now();

  update watchlists w
     set status = 'EXPIRED', updated_at = now()
    from requirement_groups g
   where w.group_id = g.id
     and w.status = 'ACTIVE'
     and g.expires_at <= now();
$$;

revoke execute on function worker_config() from anon, authenticated, public;
revoke execute on function claim_due_groups(text) from anon, authenticated, public;
revoke execute on function claim_group_recipients(uuid) from anon, authenticated, public;
revoke execute on function finish_group_found(uuid) from anon, authenticated, public;
revoke execute on function reschedule_group(uuid, integer) from anon, authenticated, public;
revoke execute on function expire_watchlists() from anon, authenticated, public;

grant execute on function worker_config() to service_role;
grant execute on function claim_due_groups(text) to service_role;
grant execute on function claim_group_recipients(uuid) to service_role;
grant execute on function finish_group_found(uuid) to service_role;
grant execute on function reschedule_group(uuid, integer) to service_role;

-- Dispatcher: every minute, but the http_post only fires when a group is
-- actually due AND claimable — empty ticks are a microsecond index probe and
-- never invoke the edge function (no cold start, no worker_runs noise).
-- 1-minute cadence is required: the cron tick is the responsiveness floor for
-- the near-cutoff "check every minute" tier.
select cron.schedule(
  'watchlist-worker',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://zlelldmqrrcfitqwwhri.supabase.co/functions/v1/watchlist-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets
                           where name = 'worker_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000)
  where exists (select 1 from requirement_groups
                 where status = 'active'
                   and next_check_at <= now()
                   and (lease_until is null or lease_until < now()));
  $$
);

select cron.schedule('watchlist-expiry', '* * * * *', $$select expire_watchlists();$$);
