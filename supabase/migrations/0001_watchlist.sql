-- Watchlist feature: requirement groups (one LibCal poll per unique
-- requirement), watchlists (one row per user+group), worker observability,
-- and notification history.
--
-- Status columns are CHECK constraints, not ENUMs, on purpose: four small
-- closed sets each used by one table. A CHECK is amended by swapping one
-- constraint in a plain transactional migration; ENUMs can't remove/reorder
-- values and ALTER TYPE has transaction restrictions. Revisit only if a
-- status set becomes shared across tables.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table requirement_groups (
  id              uuid primary key default gen_random_uuid(),
  hash            text not null unique,
  date            date not null,
  start_time      time not null,
  end_time        time not null,
  style           text,                 -- null = any; exact LibCal grouping string
  capacity        text,                 -- '1-4' | '5-8' | null = any
  extra           jsonb not null default '{}'::jsonb,
  match_mode      text not null default 'exact',  -- future-proofing; only 'exact' implemented
  status          text not null default 'active'
                    check (status in ('active','found','expired')),
  -- Timezone-correct deadlines, computed once at insert (create_watchlist RPC)
  -- with AT TIME ZONE 'America/New_York' so UTC servers never mis-time them.
  slot_start_at   timestamptz not null, -- date+start_time as Boston wall time
  poll_cutoff_at  timestamptz not null, -- slot_start_at - 30 min (polling stops)
  expires_at      timestamptz not null, -- date+end_time (NY) + 1 min (watchlists expire)
  -- Lease-based claiming: crash recovery + future horizontal scaling. A dead
  -- worker's rows stay due (next_check_at untouched) and become reclaimable
  -- the moment the lease lapses.
  lease_until     timestamptz,
  leased_by       text,
  last_checked_at timestamptz,
  next_check_at   timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- The worker's hot claim query.
create index idx_groups_due on requirement_groups (next_check_at) where status = 'active';

create table watchlists (
  id            uuid primary key default gen_random_uuid(),
  email         text,                   -- nullable: anonymized after retention period
  manage_token  text,                   -- nullable: anonymized after retention period
  group_id      uuid not null references requirement_groups(id),
  request_id    uuid not null,          -- client-generated idempotency key
  status        text not null default 'ACTIVE'
                  check (status in ('ACTIVE','FOUND','EXPIRED','CANCELLED')),
  notified_at   timestamptz,
  created_ip    inet,                   -- rate limiting + abuse analytics
  anonymized_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index uq_watchlist_request on watchlists (request_id);
create unique index uq_watchlist_email_group_active
  on watchlists (email, group_id) where status = 'ACTIVE';
create index idx_watchlists_token on watchlists (manage_token);
create index idx_watchlists_group on watchlists (group_id) where status = 'ACTIVE';
create index idx_watchlists_email_active on watchlists (email) where status = 'ACTIVE';
create index idx_watchlists_ip_recent on watchlists (created_ip, created_at);

-- Observability: one row per REAL worker run (the cron dispatcher only invokes
-- the worker when groups are due, so empty ticks produce no rows). A row stuck
-- in 'running' with no finished_at is the crash/hang signal.
create table worker_runs (
  id                   uuid primary key default gen_random_uuid(),
  started_at           timestamptz not null default now(),
  finished_at          timestamptz,
  duration_ms          integer,
  claimed_groups       integer not null default 0,  -- rows leased this run
  groups_checked       integer not null default 0,  -- rows actually evaluated
  groups_found         integer not null default 0,  -- confirmed after double-check
  rooms_found          integer not null default 0,  -- matched rooms across confirmed groups
  emails_sent          integer not null default 0,
  notification_batches integer not null default 0,  -- Resend batch API calls
  errors               jsonb not null default '[]'::jsonb,  -- [{stage, message}]
  status               text not null default 'running'
                         check (status in ('running','ok','error'))
);
create index idx_worker_runs_started on worker_runs (started_at desc);

-- Notification history: one row per email send ATTEMPT (success or failure),
-- with the rooms that triggered it — answers "why was this sent?" without joins.
create table notifications (
  id                  uuid primary key default gen_random_uuid(),
  watchlist_id        uuid not null references watchlists(id),
  group_id            uuid not null references requirement_groups(id),
  email               text,             -- nullable: anonymized with its watchlist
  matched_rooms       jsonb not null default '[]'::jsonb,  -- [{eid, name}]
  provider            text not null default 'resend',
  provider_message_id text,
  status              text not null check (status in ('sent','failed')),
  error_message       text,
  sent_at             timestamptz not null default now()
);
create index idx_notifications_watchlist on notifications (watchlist_id);
create index idx_notifications_group on notifications (group_id);
create index idx_notifications_sent on notifications (sent_at desc);

-- RLS deny-all: enable RLS with NO policies on every table. The SvelteKit
-- server and the worker use the service-role key (bypasses RLS); the browser
-- never talks to Supabase directly. Belt and suspenders: revoke the default
-- grants from the public-facing roles too.
alter table requirement_groups enable row level security;
alter table watchlists enable row level security;
alter table worker_runs enable row level security;
alter table notifications enable row level security;

revoke all on requirement_groups, watchlists, worker_runs, notifications
  from anon, authenticated;

-- Single atomic insert path. Only what MUST be transactional lives here
-- (idempotency, rate-limit counts, DB-clock deadline math, upsert/dedupe);
-- all request-shape validation happens in the SvelteKit API layer first.
create or replace function create_watchlist(
  p_request_id uuid,
  p_hash       text,
  p_email      text,
  p_token      text,
  p_date       date,
  p_start      time,
  p_end        time,
  p_style      text,
  p_capacity   text,
  p_ip         inet
) returns table (watchlist_id uuid, group_id uuid, dedup boolean)
language plpgsql
security definer
set search_path = public
as $$
-- OUT columns (watchlist_id, group_id) shadow table columns; inside SQL
-- statements the column must win (e.g. the ON CONFLICT target). The OUT
-- params are only ever assigned via RETURN QUERY literals, so this is safe.
#variable_conflict use_column
declare
  v_email text := lower(trim(p_email));
  v_slot_start timestamptz;
  v_group requirement_groups%rowtype;
  v_wid uuid;
  v_gid uuid;
begin
  -- Idempotent replay (browser retry / double-click): same request_id returns
  -- the original row untouched, regardless of its current status.
  select w.id, w.group_id into v_wid, v_gid
    from watchlists w where w.request_id = p_request_id;
  if found then
    return query select v_wid, v_gid, true;
    return;
  end if;

  -- Concurrency-sensitive limits: transactional counts, meaningless app-side.
  if (select count(*) from watchlists w
        where w.email = v_email and w.status = 'ACTIVE') >= 10 then
    raise exception 'limit_email';
  end if;
  if (select count(*) from watchlists w
        where w.manage_token = p_token and w.status = 'ACTIVE') >= 10 then
    raise exception 'limit_token';
  end if;
  if p_ip is not null and (select count(*) from watchlists w
        where w.created_ip = p_ip and w.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'limit_ip';
  end if;

  -- DB clock is authoritative for deadlines; NY wall time, DST-safe.
  v_slot_start := (p_date + p_start) at time zone 'America/New_York';
  if v_slot_start - interval '30 minutes' <= now() then
    raise exception 'too_late';
  end if;

  insert into requirement_groups
      (hash, date, start_time, end_time, style, capacity,
       slot_start_at, poll_cutoff_at, expires_at)
  values
      (p_hash, p_date, p_start, p_end, nullif(p_style, ''), nullif(p_capacity, ''),
       v_slot_start,
       v_slot_start - interval '30 minutes',
       ((p_date + p_end) at time zone 'America/New_York') + interval '1 minute')
  on conflict (hash) do update set updated_at = now()  -- no-op touch to get the row
  returning * into v_group;

  if v_group.status = 'found' then
    -- A room was already found for this exact window; joining is pointless.
    raise exception 'already_found';
  elsif v_group.status = 'expired' then
    -- Only reachable when the cutoff is genuinely still ahead (the too_late
    -- guard proved it), e.g. a group emptied by cancellations. Reactivate.
    update requirement_groups g
       set status = 'active', next_check_at = now(), updated_at = now()
     where g.id = v_group.id;
  end if;

  insert into watchlists (request_id, email, manage_token, group_id, created_ip)
  values (p_request_id, v_email, p_token, v_group.id, p_ip)
  on conflict (email, group_id) where status = 'ACTIVE' do nothing
  returning id into v_wid;

  if v_wid is null then
    -- Same email already actively watching this group.
    select w.id into v_wid from watchlists w
      where w.email = v_email and w.group_id = v_group.id and w.status = 'ACTIVE';
    return query select v_wid, v_group.id, true;
  else
    return query select v_wid, v_group.id, false;
  end if;
end;
$$;

comment on function create_watchlist is
  'Atomic watchlist creation: idempotent on request_id, rate-limited per email/token/IP, groups by requirement hash. Raises limit_email | limit_token | limit_ip | too_late | already_found.';

revoke execute on function create_watchlist(uuid, text, text, text, date, time, time, text, text, inet)
  from anon, authenticated, public;
