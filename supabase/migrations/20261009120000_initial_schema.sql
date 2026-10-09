-- Gym Manager by Messy2Easy — initial schema.
--
-- One database for every gym. Each row carries gym_id, and Row Level Security
-- (RLS) makes a logged-in user see only their own gym.
--   Owner: everything in their gym.
--   Staff: day-to-day work (members, check-ins, recording payments and renewals);
--          cannot edit/delete payments, change plans, or see expenses.
-- Gyms and their owners are created by a platform admin through an Edge Function.

-- ---------------------------------------------------------------------------
-- Gyms and the people who can log in
-- ---------------------------------------------------------------------------

create table public.gyms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 120),
  address text not null default '',
  phone text not null default '',
  gstin text not null default '',
  next_member_number integer not null default 1,
  created_at timestamptz not null default now()
);

-- Platform super-admins (the people who sell and set up the app).
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Owners and staff. Login is by mobile number, so the number is unique across the platform.
create table public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  gym_id uuid not null references public.gyms (id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 80),
  phone text not null unique check (phone ~ '^[6-9][0-9]{9}$'),
  role text not null check (role in ('owner', 'staff')),
  must_change_password boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index staff_gym_idx on public.staff (gym_id);

-- ---------------------------------------------------------------------------
-- Helpers used by defaults and policies
-- ---------------------------------------------------------------------------

-- The gym of the logged-in user (null if not an active staff member).
create function public.current_gym_id() returns uuid
language sql stable security definer set search_path = public
as $$ select gym_id from public.staff where user_id = auth.uid() and active $$;

create function public.is_owner() returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.staff where user_id = auth.uid() and active and role = 'owner') $$;

create function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.platform_admins where user_id = auth.uid()) $$;

-- "Today" for the gym (India Standard Time), not the server's UTC date.
create function public.gym_today() returns date
language sql stable
as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

-- ---------------------------------------------------------------------------
-- Gym data
-- ---------------------------------------------------------------------------

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null default public.current_gym_id() references public.gyms (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  days integer not null check (days between 1 and 3650),
  price integer not null check (price >= 0),          -- whole rupees
  active boolean not null default true,               -- "deleted" plans are hidden, old memberships keep them
  created_at timestamptz not null default now()
);
create unique index plans_gym_name_idx on public.plans (gym_id, lower(name)) where active;

create table public.members (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null default public.current_gym_id() references public.gyms (id) on delete cascade,
  code text not null default '',                      -- M-0001, set by trigger
  name text not null check (length(btrim(name)) between 2 and 80),
  phone text not null check (phone ~ '^[6-9][0-9]{9}$'),
  emergency_contact text not null default '',
  date_of_birth date,
  notes text not null default '',
  joined_on date not null default public.gym_today(),
  suspended boolean not null default false,
  color text not null default 'mint' check (color in ('mint', 'blue', 'amber', 'violet', 'rose')),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (gym_id, id),
  unique (gym_id, phone),
  unique (gym_id, code)
);
create index members_gym_name_idx on public.members (gym_id, name);

-- Each membership period (first joining and every renewal) is one row: this is the history.
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null default public.current_gym_id(),
  member_id uuid not null,
  plan_id uuid references public.plans (id) on delete set null,
  plan_name text not null,                            -- snapshot, so later plan edits don't change history
  days integer not null check (days between 1 and 3650),
  price integer not null check (price >= 0),
  start_date date not null,
  end_date date generated always as (start_date + (days - 1)) stored,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  foreign key (gym_id, member_id) references public.members (gym_id, id) on delete cascade
);
create index memberships_member_idx on public.memberships (member_id, start_date desc);
create index memberships_gym_end_idx on public.memberships (gym_id, end_date);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null default public.current_gym_id(),
  member_id uuid not null,
  membership_id uuid references public.memberships (id) on delete set null,
  amount integer not null check (amount > 0),         -- whole rupees
  method text not null check (method in ('UPI', 'Cash', 'Card', 'Bank transfer')),
  paid_at timestamptz not null default now(),
  note text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  foreign key (gym_id, member_id) references public.members (gym_id, id) on delete cascade
);
create index payments_gym_paid_idx on public.payments (gym_id, paid_at desc);
create index payments_member_idx on public.payments (member_id, paid_at desc);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null default public.current_gym_id(),
  member_id uuid not null,
  checked_in_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  foreign key (gym_id, member_id) references public.members (gym_id, id) on delete cascade
);
create index attendance_gym_time_idx on public.attendance (gym_id, checked_in_at desc);
create index attendance_member_time_idx on public.attendance (member_id, checked_in_at desc);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null default public.current_gym_id() references public.gyms (id) on delete cascade,
  spent_on date not null default public.gym_today(),
  category text not null check (category in ('Rent', 'Salaries', 'Electricity & water', 'Equipment', 'Maintenance & cleaning', 'Marketing', 'Other')),
  amount integer not null check (amount > 0),
  method text not null check (method in ('Bank transfer', 'UPI', 'Cash', 'Card')),
  note text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);
create index expenses_gym_date_idx on public.expenses (gym_id, spent_on desc);

-- Member codes M-0001, M-0002 … per gym.
create function public.assign_member_code() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  n integer;
begin
  update public.gyms set next_member_number = next_member_number + 1
  where id = new.gym_id
  returning next_member_number - 1 into n;
  new.code := 'M-' || lpad(n::text, 4, '0');
  return new;
end;
$$;
create trigger members_assign_code before insert on public.members
for each row when (new.code = '') execute function public.assign_member_code();

-- ---------------------------------------------------------------------------
-- Member overview: current plan, expiry, status, balance and last visit,
-- calculated from the history so they can never be out of date.
-- security_invoker = the caller's RLS applies.
-- ---------------------------------------------------------------------------

create view public.member_overview with (security_invoker = true) as
select
  m.*,
  cur.plan_name as plan,
  cur.days as plan_days,
  cur.price as plan_price,
  cur.start_date,
  cur.end_date as expiry_date,
  coalesce(charged.total, 0) - coalesce(paid.total, 0) as balance,
  case
    when m.suspended then 'Suspended'
    when cur.end_date is null or cur.end_date < public.gym_today() then 'Expired'
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
left join lateral (select sum(p.amount) as total from public.payments p where p.member_id = m.id) paid on true
left join lateral (select max(a.checked_in_at) as last_visit from public.attendance a where a.member_id = m.id) visit on true;

-- ---------------------------------------------------------------------------
-- Actions that must happen together (one transaction each)
-- ---------------------------------------------------------------------------

-- Add a member with their first membership. Pass p_plan_id, or custom days + price.
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
  p_color text default 'mint'
) returns uuid
language plpgsql security invoker set search_path = public
as $$
declare
  v_member_id uuid;
  v_plan public.plans;
  v_joined date := coalesce(p_joined_on, public.gym_today());
begin
  if p_plan_id is not null then
    select * into v_plan from public.plans where id = p_plan_id and active;
    if not found then raise exception 'Plan not found'; end if;
  elsif p_custom_days is null or p_custom_price is null then
    raise exception 'Choose a plan or enter custom days and price';
  end if;

  insert into public.members (name, phone, joined_on, emergency_contact, date_of_birth, notes, color)
  values (btrim(p_name), p_phone, v_joined, coalesce(p_emergency_contact, ''), p_date_of_birth, coalesce(p_notes, ''), coalesce(p_color, 'mint'))
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

-- Renew a membership and (optionally) record the money received now.
create function public.renew_membership(
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
begin
  select * into v_plan from public.plans where id = p_plan_id and active;
  if not found then raise exception 'Plan not found'; end if;
  if coalesce(p_paid_amount, 0) < 0 then raise exception 'Amount cannot be negative'; end if;

  insert into public.memberships (member_id, plan_id, plan_name, days, price, start_date)
  values (p_member_id, v_plan.id, v_plan.name, v_plan.days, v_plan.price, p_start_date)
  returning id into v_membership_id;

  if coalesce(p_paid_amount, 0) > 0 then
    insert into public.payments (member_id, membership_id, amount, method, note)
    values (p_member_id, v_membership_id, p_paid_amount, p_method, v_plan.name || ' membership renewal');
  end if;
  return v_membership_id;
end;
$$;

-- Called after the user sets their own password on first login.
create function public.mark_password_changed() returns void
language sql security definer set search_path = public
as $$ update public.staff set must_change_password = false where user_id = auth.uid() $$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.gyms enable row level security;
alter table public.platform_admins enable row level security;
alter table public.staff enable row level security;
alter table public.plans enable row level security;
alter table public.members enable row level security;
alter table public.memberships enable row level security;
alter table public.payments enable row level security;
alter table public.attendance enable row level security;
alter table public.expenses enable row level security;

-- Gyms: see your own; owners edit the profile.
create policy gyms_select on public.gyms for select to authenticated
  using (id = public.current_gym_id() or public.is_platform_admin());
create policy gyms_update on public.gyms for update to authenticated
  using (id = public.current_gym_id() and public.is_owner())
  with check (id = public.current_gym_id());

-- Platform admins: a user can only see whether they themselves are an admin.
create policy platform_admins_select on public.platform_admins for select to authenticated
  using (user_id = auth.uid());

-- Staff: everyone in the gym can see the team; owners rename/change roles/deactivate
-- (creating accounts and passwords goes through the Edge Function). An owner cannot demote or deactivate themselves.
create policy staff_select on public.staff for select to authenticated
  using (gym_id = public.current_gym_id() or public.is_platform_admin());
create policy staff_update on public.staff for update to authenticated
  using (gym_id = public.current_gym_id() and public.is_owner())
  with check (gym_id = public.current_gym_id() and (user_id <> auth.uid() or (role = 'owner' and active)));

-- Plans: everyone reads; owners manage.
create policy plans_select on public.plans for select to authenticated using (gym_id = public.current_gym_id());
create policy plans_insert on public.plans for insert to authenticated with check (gym_id = public.current_gym_id() and public.is_owner());
create policy plans_update on public.plans for update to authenticated using (gym_id = public.current_gym_id() and public.is_owner()) with check (gym_id = public.current_gym_id());
create policy plans_delete on public.plans for delete to authenticated using (gym_id = public.current_gym_id() and public.is_owner());

-- Members: everyone in the gym adds and edits; only owners delete.
create policy members_select on public.members for select to authenticated using (gym_id = public.current_gym_id());
create policy members_insert on public.members for insert to authenticated with check (gym_id = public.current_gym_id());
create policy members_update on public.members for update to authenticated using (gym_id = public.current_gym_id()) with check (gym_id = public.current_gym_id());
create policy members_delete on public.members for delete to authenticated using (gym_id = public.current_gym_id() and public.is_owner());

-- Memberships: everyone records joins/renewals; only owners correct or delete them.
create policy memberships_select on public.memberships for select to authenticated using (gym_id = public.current_gym_id());
create policy memberships_insert on public.memberships for insert to authenticated with check (gym_id = public.current_gym_id());
create policy memberships_update on public.memberships for update to authenticated using (gym_id = public.current_gym_id() and public.is_owner()) with check (gym_id = public.current_gym_id());
create policy memberships_delete on public.memberships for delete to authenticated using (gym_id = public.current_gym_id() and public.is_owner());

-- Payments: everyone records; only owners edit or delete.
create policy payments_select on public.payments for select to authenticated using (gym_id = public.current_gym_id());
create policy payments_insert on public.payments for insert to authenticated with check (gym_id = public.current_gym_id());
create policy payments_update on public.payments for update to authenticated using (gym_id = public.current_gym_id() and public.is_owner()) with check (gym_id = public.current_gym_id());
create policy payments_delete on public.payments for delete to authenticated using (gym_id = public.current_gym_id() and public.is_owner());

-- Attendance: everyone checks members in; only owners remove a wrong check-in.
create policy attendance_select on public.attendance for select to authenticated using (gym_id = public.current_gym_id());
create policy attendance_insert on public.attendance for insert to authenticated with check (gym_id = public.current_gym_id());
create policy attendance_delete on public.attendance for delete to authenticated using (gym_id = public.current_gym_id() and public.is_owner());

-- Expenses: owners only.
create policy expenses_all on public.expenses for all to authenticated
  using (gym_id = public.current_gym_id() and public.is_owner())
  with check (gym_id = public.current_gym_id() and public.is_owner());

-- ---------------------------------------------------------------------------
-- Privileges: nothing for anonymous visitors; logged-in users only via RLS.
-- Some columns are never editable from the app (gym_id, codes, phone logins…).
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon;

grant select on public.gyms, public.platform_admins, public.staff to authenticated;
grant update (name, address, phone, gstin) on public.gyms to authenticated;
grant update (name, role, active) on public.staff to authenticated;

grant select, insert, delete on public.plans to authenticated;
grant update (name, days, price, active) on public.plans to authenticated;

grant select, insert, delete on public.members to authenticated;
grant update (name, phone, emergency_contact, date_of_birth, notes, joined_on, suspended, color) on public.members to authenticated;

grant select, insert, delete on public.memberships to authenticated;
grant update (plan_name, days, price, start_date) on public.memberships to authenticated;

grant select, insert, delete on public.payments to authenticated;
grant update (amount, method, paid_at, note) on public.payments to authenticated;

grant select, insert, delete on public.attendance to authenticated;
grant select, insert, update, delete on public.expenses to authenticated;
grant select on public.member_overview to authenticated;

grant execute on function
  public.current_gym_id(), public.is_owner(), public.is_platform_admin(), public.gym_today(),
  public.create_member(text, text, date, text, date, text, uuid, integer, integer, text),
  public.renew_membership(uuid, uuid, date, integer, text),
  public.mark_password_changed()
to authenticated;
