-- Registrations start by themselves on the start date the person chose; the owner is only notified.
--
-- Every hour (pg_cron) auto_activate_registrations() looks for members who registered through the
-- form, have no membership yet, aren't suspended, belong to an open gym, and whose chosen start
-- date (intake.startDate, IST) has come:
--   * the gym has a matching plan (the chosen planId, or the plan closest to the chosen
--     1/3/6/12 months) → the membership starts on that date; its price is added to the member's
--     dues (nothing is marked as paid) and the owner's bell shows "membership started, payment due";
--   * no matching plan → nothing starts; the bell asks the owner (once) to activate it themselves.
-- The owner or staff can still activate earlier from the app, as before.

create function public.auto_activate_registrations() returns integer
language plpgsql security definer set search_path = public
as $$
declare
  m record;
  v_plan public.plans;
  v_months integer;
  v_start date;
  v_done integer := 0;
begin
  for m in
    select mem.id, mem.gym_id, mem.name, mem.intake,
           (case when mem.intake ->> 'startDate' ~ '^\d{4}-\d{2}-\d{2}$' then (mem.intake ->> 'startDate')::date end) as start_date
    from public.members mem
    join public.gyms g on g.id = mem.gym_id
    where mem.source = 'form'
      and not mem.suspended
      and not exists (select 1 from public.memberships x where x.member_id = mem.id)
      and g.active and (g.subscription_ends_on is null or g.subscription_ends_on >= public.gym_today())
  loop
    continue when m.start_date is null or m.start_date > public.gym_today();
    begin
      v_plan := null;
      v_months := case when m.intake ->> 'planMonths' in ('1', '3', '6', '12') then (m.intake ->> 'planMonths')::integer end;
      if nullif(m.intake ->> 'planId', '') is not null then
        select * into v_plan from public.plans p where p.gym_id = m.gym_id and p.active and p.id::text = m.intake ->> 'planId';
      elsif v_months is not null then
        -- "3 Months" ≈ 91 days: the closest plan within a few days (same rule as the app's activation).
        select * into v_plan from public.plans p
        where p.gym_id = m.gym_id and p.active and abs(p.days - v_months * 30.4) <= v_months * 2 + 1
        order by abs(p.days - v_months * 30.4), p.price
        limit 1;
      end if;

      if v_plan.id is null then
        if not exists (select 1 from public.activity_log where member_id = m.id and action = 'activation_needed') then
          insert into public.activity_log (gym_id, actor_name, action, member_id, member_name, detail)
          values (m.gym_id, 'Gym app', 'activation_needed', m.id, m.name, coalesce(m.intake ->> 'planName', ''));
        end if;
        continue;
      end if;

      -- Normally today; if the job couldn't run for a while (e.g. the gym was paused), start today.
      v_start := case when m.start_date >= public.gym_today() - 7 then m.start_date else public.gym_today() end;
      insert into public.memberships (gym_id, member_id, plan_id, plan_name, days, price, start_date)
      values (m.gym_id, m.id, v_plan.id, v_plan.name, v_plan.days, v_plan.price, v_start);
      insert into public.activity_log (gym_id, actor_name, action, member_id, member_name, amount, detail)
      values (m.gym_id, 'Gym app', 'membership_auto_activated', m.id, m.name, v_plan.price, v_plan.name);
      v_done := v_done + 1;
    exception when others then
      raise warning 'auto-activation skipped member %: %', m.id, sqlerrm; -- one bad row never stops the rest
    end;
  end loop;
  return v_done;
end;
$$;

revoke all on function public.auto_activate_registrations() from public, anon, authenticated;
grant execute on function public.auto_activate_registrations() to service_role;

-- Every hour at :05 (so a start date is picked up within the first hour of that day in India).
select cron.schedule('auto-activate-registrations', '5 * * * *', $$ select public.auto_activate_registrations(); $$);
