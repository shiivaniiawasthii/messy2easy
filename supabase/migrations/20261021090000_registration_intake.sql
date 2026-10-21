-- Full joining form (same questions as the gym's earlier Google Form) and the Aadhaar copy.
--
-- members.intake (jsonb) holds the answers: weight, fitness goals, health yes/no, workout preferences,
-- how they heard of the gym, comments, and for registrations the chosen plan, start date and payment
-- method (used to prefill activation). The questions and their validation live in src/lib/intake.ts,
-- shared by the web form and the `register` Edge Function.
--
-- The Aadhaar copy goes to the private `member-documents` bucket. Uploads only happen through the
-- `register` Edge Function (service role), which checks the link, the answers and the file first.
-- Only the gym's owner can read a file, and only one that belongs to a member of their gym.
-- register_member is therefore no longer callable by visitors directly.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.members
  add column intake jsonb not null default '{}'::jsonb check (jsonb_typeof(intake) = 'object' and length(intake::text) <= 4000),
  add column aadhaar_path text not null default '';

grant update (intake) on public.members to authenticated;

-- m.* gained columns: recreate the view (same as 20261020090000_member_registration).
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
-- Private storage for Aadhaar copies
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('member-documents', 'member-documents', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do nothing;

-- Read: the gym's owner, for files of their own members. No insert/update/delete policies:
-- only the Edge Function (service role, which bypasses RLS) writes here.
create policy member_documents_owner_read on storage.objects for select to authenticated
  using (
    bucket_id = 'member-documents'
    and public.is_owner()
    and exists (select 1 from public.members m where m.aadhaar_path = objects.name and m.gym_id = public.current_gym_id())
  );

-- ---------------------------------------------------------------------------
-- Public form: also return the gym's plans (the "subscription plan" question).
-- ---------------------------------------------------------------------------

drop function public.registration_form(text);
create function public.registration_form(p_token text)
returns table (gym_name text, gym_address text, gym_phone text, plans jsonb)
language sql stable security definer set search_path = public
as $$
  select g.name, g.address, g.phone,
         coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'days', p.days, 'price', p.price) order by p.days, p.price)
                   from public.plans p where p.gym_id = g.id and p.active), '[]'::jsonb)
  from public.gyms g
  where g.registration_token = p_token
    and g.active and (g.subscription_ends_on is null or g.subscription_ends_on >= public.gym_today())
$$;

-- ---------------------------------------------------------------------------
-- Registration: now with date of birth and gender required, the answers and the Aadhaar file.
-- Called only by the `register` Edge Function, which has already validated the answers
-- (src/lib/intake.ts); the database re-checks what decides access and money: the gym (token),
-- the identity fields, the plan (must be this gym's) and the start date.
-- ---------------------------------------------------------------------------

drop function public.register_member(text, text, text, text, date, text, text, text);
create function public.register_member(
  p_token text,
  p_name text,
  p_phone text,
  p_email text,
  p_date_of_birth date,
  p_gender text,
  p_address text,
  p_emergency_contact text,
  p_intake jsonb,
  p_aadhaar_path text
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
  v_plan public.plans;
  v_start date;
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
  if p_date_of_birth is null or p_date_of_birth < date '1900-01-01' or p_date_of_birth > (public.gym_today() - interval '5 years')::date then raise exception 'invalid_dob'; end if;
  if v_gender not in ('Male', 'Female', 'Other') then raise exception 'invalid_gender'; end if;
  if length(v_address) > 200 then raise exception 'invalid_address'; end if;
  if v_emergency <> '' and v_emergency !~ '^[6-9][0-9]{9}$' then raise exception 'invalid_emergency'; end if;
  if coalesce(p_aadhaar_path, '') = '' then raise exception 'aadhaar_required'; end if;
  if p_intake is null or jsonb_typeof(p_intake) <> 'object' or length(p_intake::text) > 3500 then raise exception 'invalid_answers'; end if;

  begin
    select * into v_plan from public.plans where id = (p_intake ->> 'planId')::uuid and gym_id = v_gym and active;
    v_start := (p_intake ->> 'startDate')::date;
  exception when others then
    raise exception 'invalid_plan';
  end;
  if v_plan.id is null then raise exception 'invalid_plan'; end if;
  if v_start is null or v_start < public.gym_today() or v_start > public.gym_today() + 60 then raise exception 'invalid_start'; end if;

  if exists (select 1 from public.members where gym_id = v_gym and phone = v_phone) then raise exception 'already_registered'; end if;
  -- A shared link can be abused: cap how many registrations one gym takes per hour.
  if (select count(*) from public.members where gym_id = v_gym and source = 'form' and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'too_many_registrations';
  end if;

  begin
    insert into public.members (gym_id, name, phone, email, date_of_birth, gender, address, emergency_contact, source, color, created_by, intake, aadhaar_path)
    values (v_gym, v_name, v_phone, v_email, p_date_of_birth, v_gender, v_address, v_emergency, 'form',
            (array['mint', 'blue', 'amber', 'violet', 'rose'])[1 + floor(random() * 5)::int], null,
            p_intake || jsonb_build_object('planName', v_plan.name), p_aadhaar_path)
    returning id, code into v_member, v_code;
  exception when unique_violation then
    raise exception 'already_registered'; -- the same number submitted twice at the same moment
  end;

  insert into public.activity_log (gym_id, actor_name, action, member_id, member_name)
  values (v_gym, v_name, 'member_registered', v_member, v_name);
  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Owner/staff "Add member" can save the same answers (all optional there).
-- ---------------------------------------------------------------------------

drop function public.create_member(text, text, date, text, date, text, uuid, integer, integer, text, text, text, text);
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
  p_address text default '',
  p_intake jsonb default '{}'::jsonb
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

  insert into public.members (name, phone, joined_on, emergency_contact, date_of_birth, notes, color, email, gender, address, intake)
  values (btrim(p_name), p_phone, v_joined, coalesce(p_emergency_contact, ''), p_date_of_birth, coalesce(p_notes, ''), coalesce(p_color, 'mint'),
          lower(btrim(coalesce(p_email, ''))), coalesce(p_gender, ''), btrim(coalesce(p_address, '')), coalesce(p_intake, '{}'::jsonb))
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

revoke all on function public.registration_form(text) from public;
grant execute on function public.registration_form(text) to anon, authenticated, service_role;

-- Visitors register through the Edge Function only (it checks and stores the Aadhaar file first).
revoke all on function public.register_member(text, text, text, text, date, text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.register_member(text, text, text, text, date, text, text, text, jsonb, text) to service_role;

revoke all on function public.create_member(text, text, date, text, date, text, uuid, integer, integer, text, text, text, text, jsonb) from public, anon;
grant execute on function public.create_member(text, text, date, text, date, text, uuid, integer, integer, text, text, text, text, jsonb) to authenticated, service_role;
