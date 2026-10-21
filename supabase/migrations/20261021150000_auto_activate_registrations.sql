-- Registrations: the owner checks the Aadhaar, then the membership starts (now, or on the chosen date).
--
-- members.aadhaar_status: 'none' (no file), 'pending' (uploaded, not checked yet), 'verified', 'rejected'.
-- * Only the gym's owner can mark it, with set_aadhaar_check() (they can see the file; a member
--   without a file can be marked after checking the card at the desk).
-- * A member who registered through the form cannot get their first membership until the Aadhaar
--   is verified: enforced by a trigger, so neither the app, staff nor the job can skip it.
-- * "Valid" starts the membership right away when the chosen start date has come and the gym has a
--   matching plan (chosen plan, or the plan closest to 1/3/6/12 months). With a future start date, the
--   hourly job (pg_cron) starts it on that day. Without a matching plan the owner picks one in the app.
-- * The price is added to the member's dues (nothing is marked as paid); the owner's bell is told.

-- ---------------------------------------------------------------------------
-- Aadhaar check status
-- ---------------------------------------------------------------------------

alter table public.members
  add column aadhaar_status text not null default 'none' check (aadhaar_status in ('none', 'pending', 'verified', 'rejected')),
  add column aadhaar_checked_at timestamptz,
  add column aadhaar_checked_by uuid references auth.users (id) on delete set null;

-- A new file waits for the owner's check.
create function public.aadhaar_pending_on_upload() returns trigger
language plpgsql set search_path = public
as $$
begin
  if new.aadhaar_path <> '' and new.aadhaar_status = 'none' then new.aadhaar_status := 'pending'; end if;
  return new;
end;
$$;
create trigger aadhaar_pending_on_upload before insert on public.members
for each row execute function public.aadhaar_pending_on_upload();

update public.members set aadhaar_status = 'pending' where aadhaar_path <> '' and aadhaar_status = 'none';

-- m.* gained columns: recreate the view (same as 20261021090000_registration_intake).
drop view public.member_overview;
create view public.member_overview with (security_invoker = true) as
select
  m.*,
  cur.plan_name as plan,
  cur.days as plan_days,
  cur.price as plan_price,
  cur.start_date,
  cur.end_date as expiry_date,
  coalesce(charged.total, 0) - public.member_paid_total(m.id) as balance,
  case
    when m.suspended then 'Suspended'
    when cur.end_date is null then 'Pending'
    when cur.end_date < public.gym_today() then 'Expired'
    else 'Active'
  end as status,
  visit.last_visit
from public.members m
left join lateral (
  select x.plan_name, x.days, x.price, x.start_date, x.end_date
  from public.memberships x
  where x.member_id = m.id
  order by x.start_date desc, x.created_at desc
  limit 1
) cur on true
left join lateral (select sum(x.price) as total from public.memberships x where x.member_id = m.id) charged on true
left join lateral (select max(a.checked_in_at) as last_visit from public.attendance a where a.member_id = m.id) visit on true;

grant select on public.member_overview to authenticated;
grant all on public.member_overview to service_role;

-- ---------------------------------------------------------------------------
-- No first membership for a form registration until the Aadhaar is verified.
-- ---------------------------------------------------------------------------

create function public.require_verified_aadhaar() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from public.members where id = new.member_id and source = 'form' and aadhaar_status <> 'verified')
     and not exists (select 1 from public.memberships where member_id = new.member_id) then
    raise exception 'aadhaar_not_verified';
  end if;
  return new;
end;
$$;
create trigger require_verified_aadhaar before insert on public.memberships
for each row execute function public.require_verified_aadhaar();

-- ---------------------------------------------------------------------------
-- Start a verified registration with the gym's matching plan.
-- Returns 'activated', 'scheduled' (start date still ahead), 'needs_plan' (no matching plan or
-- no start date: the owner picks one in the app), 'not_verified' or 'already_started'.
-- Used by set_aadhaar_check() (the owner's click) and the hourly job.
-- ---------------------------------------------------------------------------

create function public.activate_registration(p_member_id uuid) returns text
language plpgsql security definer set search_path = public
as $$
declare
  m public.members;
  v_plan public.plans;
  v_months integer;
  v_wanted date;
  v_start date;
begin
  select * into m from public.members where id = p_member_id;
  if m.id is null or m.source <> 'form' then return 'needs_plan'; end if;
  if exists (select 1 from public.memberships where member_id = m.id) then return 'already_started'; end if;
  if m.aadhaar_status <> 'verified' then return 'not_verified'; end if;

  v_wanted := case when m.intake ->> 'startDate' ~ '^\d{4}-\d{2}-\d{2}$' then (m.intake ->> 'startDate')::date end;
  if v_wanted is null then return 'needs_plan'; end if;
  if v_wanted > public.gym_today() then return 'scheduled'; end if;

  v_months := case when m.intake ->> 'planMonths' in ('1', '3', '6', '12') then (m.intake ->> 'planMonths')::integer end;
  if nullif(m.intake ->> 'planId', '') is not null then
    select * into v_plan from public.plans p where p.gym_id = m.gym_id and p.active and p.id::text = m.intake ->> 'planId';
  elsif v_months is not null then
    -- "3 Months" ≈ 91 days: the closest plan within a few days (same rule as the app's Activate).
    select * into v_plan from public.plans p
    where p.gym_id = m.gym_id and p.active and abs(p.days - v_months * 30.4) <= v_months * 2 + 1
    order by abs(p.days - v_months * 30.4), p.price
    limit 1;
  end if;
  if v_plan.id is null then return 'needs_plan'; end if;

  -- Normally the chosen date; if it is more than a week back (e.g. verified late), start today.
  v_start := case when v_wanted >= public.gym_today() - 7 then v_wanted else public.gym_today() end;
  insert into public.memberships (gym_id, member_id, plan_id, plan_name, days, price, start_date)
  values (m.gym_id, m.id, v_plan.id, v_plan.name, v_plan.days, v_plan.price, v_start);
  -- With an owner's click, log_membership_activated already logs it (as that owner).
  if auth.uid() is null then
    insert into public.activity_log (gym_id, actor_name, action, member_id, member_name, amount, detail)
    values (m.gym_id, 'Gym app', 'membership_auto_activated', m.id, m.name, v_plan.price, v_plan.name);
  end if;
  return 'activated';
end;
$$;

-- ---------------------------------------------------------------------------
-- Owner: mark the Aadhaar valid (and start the membership if it is due) or wrong.
-- ---------------------------------------------------------------------------

create function public.set_aadhaar_check(p_member_id uuid, p_valid boolean) returns text
language plpgsql security definer set search_path = public
as $$
declare
  m public.members;
  v_actor text;
begin
  if not public.is_owner() then
    raise exception 'Only the gym owner can check the Aadhaar' using errcode = '42501';
  end if;
  select * into m from public.members where id = p_member_id and gym_id = public.current_gym_id();
  if m.id is null then raise exception 'Member not found'; end if;

  update public.members
  set aadhaar_status = case when p_valid then 'verified' else 'rejected' end,
      aadhaar_checked_at = now(), aadhaar_checked_by = auth.uid()
  where id = m.id;

  -- log_activity saw that update as "updated <member>'s details": replace it with the clearer entry below.
  delete from public.activity_log where member_id = m.id and action = 'member_updated' and actor = auth.uid() and created_at = now();
  select name into v_actor from public.staff where user_id = auth.uid();
  insert into public.activity_log (gym_id, actor, actor_name, action, member_id, member_name)
  values (m.gym_id, auth.uid(), coalesce(v_actor, ''), case when p_valid then 'aadhaar_verified' else 'aadhaar_rejected' end, m.id, m.name);

  if not p_valid then return 'rejected'; end if;
  return public.activate_registration(m.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Hourly job: verified registrations whose start date has come.
-- ---------------------------------------------------------------------------

create function public.auto_activate_registrations() returns integer
language plpgsql security definer set search_path = public
as $$
declare
  m record;
  v_result text;
  v_done integer := 0;
begin
  for m in
    select mem.id, mem.gym_id, mem.name, mem.intake
    from public.members mem
    join public.gyms g on g.id = mem.gym_id
    where mem.source = 'form'
      and mem.aadhaar_status = 'verified'
      and not mem.suspended
      and not exists (select 1 from public.memberships x where x.member_id = mem.id)
      and g.active and (g.subscription_ends_on is null or g.subscription_ends_on >= public.gym_today())
  loop
    begin
      v_result := public.activate_registration(m.id);
      if v_result = 'activated' then
        v_done := v_done + 1;
      elsif v_result = 'needs_plan' and not exists (select 1 from public.activity_log where member_id = m.id and action = 'activation_needed') then
        insert into public.activity_log (gym_id, actor_name, action, member_id, member_name, detail)
        values (m.gym_id, 'Gym app', 'activation_needed', m.id, m.name, coalesce(m.intake ->> 'planName', ''));
      end if;
    exception when others then
      raise warning 'auto-activation skipped member %: %', m.id, sqlerrm; -- one bad row never stops the rest
    end;
  end loop;
  return v_done;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on function public.aadhaar_pending_on_upload(), public.require_verified_aadhaar() from public, anon, authenticated;
revoke all on function public.activate_registration(uuid), public.auto_activate_registrations() from public, anon, authenticated;
grant execute on function public.activate_registration(uuid), public.auto_activate_registrations() to service_role;
revoke all on function public.set_aadhaar_check(uuid, boolean) from public, anon;
grant execute on function public.set_aadhaar_check(uuid, boolean) to authenticated, service_role;

-- Every hour at :05 (so a start date is picked up within the first hour of that day in India).
select cron.schedule('auto-activate-registrations', '5 * * * *', $$ select public.auto_activate_registrations(); $$);
