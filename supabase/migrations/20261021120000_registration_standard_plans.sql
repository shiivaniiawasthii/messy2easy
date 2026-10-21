-- Registration plan choice when the gym hasn't created plans yet: the standard durations
-- 1, 3, 6 or 12 months (intake.planMonths, same as the gym's old Google Form). The price is
-- confirmed at the gym; activation picks the matching real plan. When the gym has plans,
-- the person still picks one of them (intake.planId), checked to belong to this gym.
-- Same function as in 20261021090000_registration_intake, only the plan check differs.

create or replace function public.register_member(
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
  v_plan_name text;
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
    if coalesce(p_intake ->> 'planId', '') <> '' then
      select name into v_plan_name from public.plans where id = (p_intake ->> 'planId')::uuid and gym_id = v_gym and active;
    elsif p_intake ->> 'planMonths' in ('1', '3', '6', '12') then
      v_plan_name := case p_intake ->> 'planMonths' when '1' then '1 Month' else (p_intake ->> 'planMonths') || ' Months' end;
    end if;
    v_start := (p_intake ->> 'startDate')::date;
  exception when others then
    raise exception 'invalid_plan';
  end;
  if v_plan_name is null then raise exception 'invalid_plan'; end if;
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
            p_intake || jsonb_build_object('planName', v_plan_name), p_aadhaar_path)
    returning id, code into v_member, v_code;
  exception when unique_violation then
    raise exception 'already_registered'; -- the same number submitted twice at the same moment
  end;

  insert into public.activity_log (gym_id, actor_name, action, member_id, member_name)
  values (v_gym, v_name, 'member_registered', v_member, v_name);
  return v_code;
end;
$$;

-- create or replace keeps the privileges: service role only (the `register` Edge Function).
