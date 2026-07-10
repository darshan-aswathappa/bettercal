-- Retention (weekly) + atomic cancel.
--
-- Retention policy: terminal watchlists/groups are RETAINED for demand
-- analytics and only anonymized — email/token/IP are the sole liability in
-- old rows; every analytical dimension (date, window, style, capacity,
-- status, timestamps) survives. Operational tables get short windows:
-- worker_runs 30 days, notifications keep rows but shed emails at 90 days.

create or replace function anonymize_old_watchlists()
returns void
language sql
as $$
  update watchlists w
     set email = null, manage_token = null, created_ip = null,
         anonymized_at = now(), updated_at = now()
   where w.status <> 'ACTIVE'
     and w.updated_at < now() - interval '90 days'
     and w.anonymized_at is null;

  update notifications n
     set email = null
   where n.sent_at < now() - interval '90 days'
     and n.email is not null;

  delete from worker_runs
   where started_at < now() - interval '30 days';
$$;

-- Atomic cancel: flips this token's ACTIVE row(s) to CANCELLED and expires any
-- requirement group left with no ACTIVE watchers, so an abandoned group stops
-- being polled immediately instead of running until its cutoff.
create or replace function cancel_watchlists(p_token text, p_id uuid, p_all boolean)
returns integer
language plpgsql
as $$
declare
  v_count integer;
  v_group_ids uuid[];
begin
  with cancelled as (
    update watchlists w
       set status = 'CANCELLED', updated_at = now()
     where w.manage_token = p_token
       and w.status = 'ACTIVE'
       and (p_all or w.id = p_id)
    returning w.group_id
  )
  select count(*), array_agg(distinct group_id)
    into v_count, v_group_ids
    from cancelled;

  if v_count > 0 then
    update requirement_groups g
       set status = 'expired', lease_until = null, leased_by = null, updated_at = now()
     where g.status = 'active'
       and g.id = any(v_group_ids)
       and not exists (select 1 from watchlists w
                        where w.group_id = g.id and w.status = 'ACTIVE');
  end if;

  return v_count;
end;
$$;

revoke execute on function anonymize_old_watchlists() from anon, authenticated, public;
revoke execute on function cancel_watchlists(text, uuid, boolean) from anon, authenticated, public;
grant execute on function cancel_watchlists(text, uuid, boolean) to service_role;

select cron.schedule('watchlist-retention', '0 8 * * 0', $$select anonymize_old_watchlists();$$);
