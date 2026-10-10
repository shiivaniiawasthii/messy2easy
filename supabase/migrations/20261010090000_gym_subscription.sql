-- Gym subscription (Messy2Easy's plan for each client gym) and admin controls.
--
-- A gym is "open" while it is active and its subscription hasn't ended.
-- When it isn't, its owner and staff can still log in but see no data
-- (current_gym_id() returns null), and the app shows a "subscription paused" screen.
-- Only the platform admin can change subscription fields, through admin_update_gym().

alter table public.gyms
  add column active boolean not null default true,
  add column subscription_plan text not null default 'Pilot' check (subscription_plan in ('Pilot', 'Basic', 'Standard', 'Pro')),
  add column subscription_ends_on date;

-- Only open gyms give their people access to data.
create or replace function public.current_gym_id() returns uuid
language sql stable security definer set search_path = public
as $$
  select s.gym_id
  from public.staff s
  join public.gyms g on g.id = s.gym_id
  where s.user_id = auth.uid() and s.active
    and g.active and (g.subscription_ends_on is null or g.subscription_ends_on >= public.gym_today())
$$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public
as $$ select public.current_gym_id() is not null and exists (select 1 from public.staff where user_id = auth.uid() and active and role = 'owner') $$;

-- What the logged-in person's gym subscription looks like, even when it is paused
-- (so the app can explain why there is no data).
create function public.my_gym_status()
returns table (gym_name text, active boolean, subscription_plan text, subscription_ends_on date, is_open boolean)
language sql stable security definer set search_path = public
as $$
  select g.name, g.active, g.subscription_plan, g.subscription_ends_on,
         g.active and (g.subscription_ends_on is null or g.subscription_ends_on >= public.gym_today())
  from public.staff s join public.gyms g on g.id = s.gym_id
  where s.user_id = auth.uid()
$$;

-- Platform admin: edit a gym's details and subscription.
create function public.admin_update_gym(
  p_gym_id uuid,
  p_name text,
  p_address text,
  p_phone text,
  p_gstin text,
  p_active boolean,
  p_subscription_plan text,
  p_subscription_ends_on date
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only the Messy2Easy admin can change gyms' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'Enter the gym name'; end if;
  update public.gyms set
    name = btrim(p_name),
    address = btrim(coalesce(p_address, '')),
    phone = btrim(coalesce(p_phone, '')),
    gstin = upper(btrim(coalesce(p_gstin, ''))),
    active = coalesce(p_active, true),
    subscription_plan = coalesce(p_subscription_plan, 'Pilot'),
    subscription_ends_on = p_subscription_ends_on
  where id = p_gym_id;
  if not found then raise exception 'Gym not found'; end if;
end;
$$;

revoke all on function public.my_gym_status(), public.admin_update_gym(uuid, text, text, text, text, boolean, text, date) from public, anon;
grant execute on function public.my_gym_status(), public.admin_update_gym(uuid, text, text, text, text, boolean, text, date) to authenticated;
grant execute on function public.my_gym_status(), public.admin_update_gym(uuid, text, text, text, text, boolean, text, date) to service_role;
