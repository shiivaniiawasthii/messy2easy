-- Self-service member registration.
--
-- The owner creates a secret link for their gym (gyms.registration_token) and shares it.
-- People who open it fill in their own details without logging in. The visitor never touches
-- a table: the public form only calls registration_form() and register_member(), which are
-- security definer, take the gym from the token (never from the visitor) and validate everything.
-- A registered person is a member with no membership yet ("Pending"). The owner or staff
-- activate them later with a plan and payment (renew_membership, as for any renewal).

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

-- Null = the link is off. A new token makes the old link stop working.
alter table public.gyms add column registration_token text unique;

alter table public.members
  add column email text not null default '' check (email = '' or (length(email) <= 120 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  add column gender text not null default '' check (gender in ('', 'Male', 'Female', 'Other')),
  add column address text not null default '' check (length(address) <= 200),
  -- How the member was added: by owner/staff in the app, or by themselves through the form.
  add column source text not null default 'staff' check (source in ('staff', 'form'));

grant update (email, gender, address) on public.members to authenticated;

-- ---------------------------------------------------------------------------
-- Member overview: a member with no membership yet is "Pending" (was "Expired").
-- Recreated (not replaced) because m.* now has more columns.
-- ---------------------------------------------------------------------------

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
-- Owner: turn the link on (always a new token) or off.
-- ---------------------------------------------------------------------------

create function public.set_registration_link(p_on boolean) returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_token text := case when p_on then replace(gen_random_uuid()::text, '-', '') end;
begin
  if not public.is_owner() then
    raise exception 'Only the gym owner can change the registration link' using errcode = '42501';
  end if;
  update public.gyms set registration_token = v_token where id = public.current_gym_id();
  return v_token;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public form (no login): what the page shows, and the submission.
-- Only open gyms (active, subscription not ended) accept registrations.
-- ---------------------------------------------------------------------------

create function public.registration_form(p_token text)
returns table (gym_name text, gym_address text, gym_phone text)
language sql stable security definer set search_path = public
as $$
  select g.name, g.address, g.phone
  from public.gyms g
  where g.registration_token = p_token
    and g.active and (g.subscription_ends_on is null or g.subscription_ends_on >= public.gym_today())
$$;

-- Returns the new member code (M-0042). Errors are short codes the page turns into messages.
create function public.register_member(
  p_token text,
  p_name text,
  p_phone text,
  p_email text default '',
  p_date_of_birth date default null,
  p_gender text default '',
  p_address text default '',
  p_emergency_contact text default ''
) returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_gym uuid;
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_phone text := regexp_replace(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '^(91|0)(?=\d{10}$)', '');
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_gender text := btrim(coalesce(p_gender, ''));
  v_address text := btrim(regexp_replace(coalesce(p_address, ''), '\s+', ' ', 'g'));
  v_emergency text := regexp_replace(regexp_replace(coalesce(p_emergency_contact, ''), '\D', '', 'g'), '^(91|0)(?=\d{10}$)', '');
  v_member uuid;
  v_code text;
begin
  select g.id into v_gym
  from public.gyms g
  where g.registration_token = p_token
    and g.active and (g.subscription_ends_on is null or g.subscription_ends_on >= public.gym_today());
  if v_gym is null then raise exception 'link_invalid'; end if;

  if length(v_name) < 2 or length(v_name) > 80 then raise exception 'invalid_name'; end if;
  if v_phone !~ '^[6-9][0-9]{9}$' then raise exception 'invalid_phone'; end if;
  if v_email <> '' and (length(v_email) > 120 or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$') then raise exception 'invalid_email'; end if;
  if p_date_of_birth is not null and (p_date_of_birth < date '1900-01-01' or p_date_of_birth > (public.gym_today() - interval '5 years')::date) then raise exception 'invalid_dob'; end if;
  if v_gender not in ('', 'Male', 'Female', 'Other') then raise exception 'invalid_gender'; end if;
  if length(v_address) > 200 then raise exception 'invalid_address'; end if;
  if v_emergency <> '' and v_emergency !~ '^[6-9][0-9]{9}$' then raise exception 'invalid_emergency'; end if;

  if exists (select 1 from public.members where gym_id = v_gym and phone = v_phone) then raise exception 'already_registered'; end if;
  -- A shared link can be abused: cap how many registrations one gym takes per hour.
  if (select count(*) from public.members where gym_id = v_gym and source = 'form' and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'too_many_registrations';
  end if;

  begin
    insert into public.members (gym_id, name, phone, email, date_of_birth, gender, address, emergency_contact, source, color, created_by)
    values (v_gym, v_name, v_phone, v_email, p_date_of_birth, v_gender, v_address, v_emergency, 'form',
            (array['mint', 'blue', 'amber', 'violet', 'rose'])[1 + floor(random() * 5)::int], null)
    returning id, code into v_member, v_code;
  exception when unique_violation then
    raise exception 'already_registered'; -- the same number submitted twice at the same moment
  end;

  -- The activity log trigger skips changes without a login, so log the registration here.
  -- (When a logged-in owner tests the form, the trigger already logs "member added".)
  if auth.uid() is null then
    insert into public.activity_log (gym_id, actor_name, action, member_id, member_name)
    values (v_gym, v_name, 'member_registered', v_member, v_name);
  end if;
  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Activation = the first membership of a member who registered through the form.
-- (log_activity logs only later memberships, as renewals.)
-- ---------------------------------------------------------------------------

create function public.log_membership_activated() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then return null; end if;
  begin
    if exists (select 1 from public.members where id = new.member_id and source = 'form')
       and (select count(*) from public.memberships where member_id = new.member_id) = 1 then
      insert into public.activity_log (gym_id, actor, actor_name, action, member_id, member_name, amount, detail)
      select new.gym_id, auth.uid(), coalesce((select s.name from public.staff s where s.user_id = auth.uid()), ''),
             'membership_activated', new.member_id, m.name, new.price, new.plan_name
      from public.members m where m.id = new.member_id;
    end if;
  exception when others then
    null; -- never block the real change because of the log
  end;
  return null;
end;
$$;
create trigger log_membership_activated after insert on public.memberships
for each row execute function public.log_membership_activated();

-- The first payment of a registered member is for joining, not a renewal.
create or replace function public.renew_membership(
  p_member_id uuid,
  p_plan_id uuid,
  p_start_date date,
  p_paid_amount integer default 0,
  p_method text default 'UPI'
) returns uuid
language plpgsql security invoker set search_path = public
as $$
declare
  v_plan public.plans;
  v_membership_id uuid;
  v_first boolean := not exists (select 1 from public.memberships where member_id = p_member_id);
begin
  select * into v_plan from public.plans where id = p_plan_id and active;
  if not found then raise exception 'Plan not found'; end if;
  if coalesce(p_paid_amount, 0) < 0 then raise exception 'Amount cannot be negative'; end if;

  insert into public.memberships (member_id, plan_id, plan_name, days, price, start_date)
  values (p_member_id, v_plan.id, v_plan.name, v_plan.days, v_plan.price, p_start_date)
  returning id into v_membership_id;

  if coalesce(p_paid_amount, 0) > 0 then
    insert into public.payments (member_id, membership_id, amount, method, note)
    values (p_member_id, v_membership_id, p_paid_amount, p_method, v_plan.name || case when v_first then ' membership' else ' membership renewal' end);
  end if;
  return v_membership_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Owner/staff "Add member": the same optional details as the form, and a clear
-- error (with the existing member's name) when the mobile number is already in the gym.
-- ---------------------------------------------------------------------------

drop function public.create_member(text, text, date, text, date, text, uuid, integer, integer, text);
create function public.create_member(
  p_name text,
  p_phone text,
  p_joined_on date default null,
  p_emergency_contact text default '',
  p_date_of_birth date default null,
  p_notes text default '',
  p_plan_id uuid default null,
  p_custom_days integer default null,
  p_custom_price integer default null,
  p_color text default 'mint',
  p_email text default '',
  p_gender text default '',
  p_address text default ''
) returns uuid
language plpgsql security invoker set search_path = public
as $$
declare
  v_member_id uuid;
  v_plan public.plans;
  v_joined date := coalesce(p_joined_on, public.gym_today());
  v_existing text;
begin
  -- RLS limits this to the caller's gym, which is the gym the member goes into.
  select name into v_existing from public.members where phone = p_phone and gym_id = public.current_gym_id();
  if v_existing is not null then
    raise exception 'duplicate_phone' using errcode = '23505', detail = v_existing;
  end if;

  if p_plan_id is not null then
    select * into v_plan from public.plans where id = p_plan_id and active;
    if not found then raise exception 'Plan not found'; end if;
  elsif p_custom_days is null or p_custom_price is null then
    raise exception 'Choose a plan or enter custom days and price';
  end if;

  insert into public.members (name, phone, joined_on, emergency_contact, date_of_birth, notes, color, email, gender, address)
  values (btrim(p_name), p_phone, v_joined, coalesce(p_emergency_contact, ''), p_date_of_birth, coalesce(p_notes, ''), coalesce(p_color, 'mint'),
          lower(btrim(coalesce(p_email, ''))), coalesce(p_gender, ''), btrim(coalesce(p_address, '')))
  returning id into v_member_id;

  insert into public.memberships (member_id, plan_id, plan_name, days, price, start_date)
  values (
    v_member_id,
    v_plan.id,
    coalesce(v_plan.name, 'Custom'),
    coalesce(v_plan.days, p_custom_days),
    coalesce(v_plan.price, p_custom_price),
    v_joined
  );
  return v_member_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on function public.create_member(text, text, date, text, date, text, uuid, integer, integer, text, text, text, text) from public, anon;
grant execute on function public.create_member(text, text, date, text, date, text, uuid, integer, integer, text, text, text, text) to authenticated, service_role;

revoke all on function public.set_registration_link(boolean) from public, anon;
grant execute on function public.set_registration_link(boolean) to authenticated, service_role;

revoke all on function public.registration_form(text), public.register_member(text, text, text, text, date, text, text, text) from public;
grant execute on function public.registration_form(text), public.register_member(text, text, text, text, date, text, text, text) to anon, authenticated, service_role;

revoke all on function public.log_membership_activated() from public, anon, authenticated;
