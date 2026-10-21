-- Starting a registration needs no plan from the Plans page: the person already chose the duration
-- (1/3/6/12 months), the start date and how they'll pay on the form. The owner/staff only enter the fee
-- (and how much was received now). "Aadhaar valid" no longer starts anything by itself; the app opens
-- this step right after it.

-- Days per chosen duration (same as STANDARD_PLAN_DAYS in src/lib/intake.ts).
create function public.registration_days(p_months integer) returns integer
language sql immutable
as $$ select case p_months when 1 then 30 when 3 then 90 when 6 then 180 when 12 then 365 end $$;

-- Owner: mark the Aadhaar valid or wrong. Returns 'verified' or 'rejected'.
create or replace function public.set_aadhaar_check(p_member_id uuid, p_valid boolean) returns text
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

  return case when p_valid then 'verified' else 'rejected' end;
end;
$$;

-- Owner/staff: start a verified registration with what the person chose, at the fee the gym sets.
-- Runs as the caller (RLS: their own gym). The require_verified_aadhaar trigger still applies.
create function public.start_registration(p_member_id uuid, p_fee integer, p_paid integer, p_method text) returns uuid
language plpgsql security invoker set search_path = public
as $$
declare
  m public.members;
  v_plan public.plans;
  v_months integer;
  v_name text;
  v_days integer;
  v_start date;
  v_membership uuid;
begin
  select * into m from public.members where id = p_member_id;
  if m.id is null then raise exception 'Member not found'; end if;
  if exists (select 1 from public.memberships where member_id = m.id) then raise exception 'already_started'; end if;
  if p_fee is null or p_fee < 0 then raise exception 'Enter the fee in whole rupees'; end if;
  if coalesce(p_paid, 0) < 0 or coalesce(p_paid, 0) > p_fee then raise exception 'Amount received must be between 0 and the fee'; end if;
  if p_method not in ('UPI', 'Cash', 'Card', 'Bank transfer') then raise exception 'Choose a payment method'; end if;

  v_months := case when m.intake ->> 'planMonths' in ('1', '3', '6', '12') then (m.intake ->> 'planMonths')::integer end;
  if v_months is not null then
    v_name := case v_months when 1 then '1 Month' else v_months || ' Months' end;
    v_days := public.registration_days(v_months);
  elsif nullif(m.intake ->> 'planId', '') is not null then
    -- Registrations from before durations were used chose one of the gym's plans.
    select * into v_plan from public.plans where id::text = m.intake ->> 'planId';
    v_name := v_plan.name;
    v_days := v_plan.days;
  end if;
  if v_days is null then raise exception 'no_chosen_plan'; end if;

  v_start := case when m.intake ->> 'startDate' ~ '^\d{4}-\d{2}-\d{2}$' then (m.intake ->> 'startDate')::date end;
  v_start := coalesce(v_start, public.gym_today());

  insert into public.memberships (member_id, plan_id, plan_name, days, price, start_date)
  values (m.id, v_plan.id, v_name, v_days, p_fee, v_start)
  returning id into v_membership;
  if coalesce(p_paid, 0) > 0 then
    insert into public.payments (member_id, membership_id, amount, method, note)
    values (m.id, v_membership, p_paid, p_method, v_name || ' membership');
  end if;
  return v_membership;
end;
$$;

-- Hourly job: no longer starts memberships (the fee is the owner's call). On the chosen start date it
-- reminds the owner once: verified → "enter the fee to start"; still unchecked → "check the Aadhaar".
create or replace function public.auto_activate_registrations() returns integer
language plpgsql security definer set search_path = public
as $$
declare
  m record;
  v_sent integer := 0;
begin
  for m in
    select mem.id, mem.gym_id, mem.name, mem.aadhaar_status
    from public.members mem
    join public.gyms g on g.id = mem.gym_id
    where mem.source = 'form'
      and not mem.suspended
      and not exists (select 1 from public.memberships x where x.member_id = mem.id)
      and mem.intake ->> 'startDate' ~ '^\d{4}-\d{2}-\d{2}$'
      and g.active and (g.subscription_ends_on is null or g.subscription_ends_on >= public.gym_today())
  loop
    continue when (m.id is null) or not exists (
      select 1 from public.members x where x.id = m.id and (x.intake ->> 'startDate')::date <= public.gym_today());
    continue when exists (select 1 from public.activity_log where member_id = m.id and action = 'start_date_reached');
    insert into public.activity_log (gym_id, actor_name, action, member_id, member_name, detail)
    values (m.gym_id, 'Gym app', 'start_date_reached', m.id, m.name, m.aadhaar_status);
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end;
$$;

revoke all on function public.registration_days(integer) from public, anon;
grant execute on function public.registration_days(integer) to authenticated, service_role;
revoke all on function public.start_registration(uuid, integer, integer, text) from public, anon;
grant execute on function public.start_registration(uuid, integer, integer, text) to authenticated, service_role;
