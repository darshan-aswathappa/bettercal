-- Supabase security-advisor follow-ups: pin search_path on all watchlist
-- functions (mutable search_path warning) and move the pg_net extension out
-- of the public schema. Its `net.*` function schema is unaffected, so the
-- cron dispatcher's net.http_post keeps working.
--
-- The "RLS enabled, no policy" INFO findings on the four watchlist tables are
-- intentional: deny-all by design, only the service role (which bypasses RLS)
-- touches them.

alter function claim_due_groups(text) set search_path = public;
alter function claim_group_recipients(uuid) set search_path = public;
alter function finish_group_found(uuid) set search_path = public;
alter function reschedule_group(uuid, integer) set search_path = public;
alter function expire_watchlists() set search_path = public;
alter function anonymize_old_watchlists() set search_path = public;
alter function cancel_watchlists(text, uuid, boolean) set search_path = public;

create schema if not exists extensions;
do $$
begin
  begin
    alter extension pg_net set schema extensions;
  exception when others then
    raise notice 'pg_net not relocatable in place: %', sqlerrm;
  end;
end $$;
