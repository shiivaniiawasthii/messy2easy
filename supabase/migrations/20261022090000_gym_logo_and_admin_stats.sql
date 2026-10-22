-- Gym logo (set by the Messy2Easy admin) and platform numbers for the admin page.
--
-- Logo: public `gym-logos` bucket (a logo is not secret: it shows on the public registration form).
-- Only platform admins can upload, replace or remove files; gyms.logo_path points at the file
-- ('' = no logo: the admin card and the registration form then show nothing).
-- Stats: admin_platform_stats() counts members, active members, waiting registrations and
-- check-ins per gym. Platform admins can't read gym data through RLS, so this definer function
-- returns only counts, never member details.

alter table public.gyms add column logo_path text not null default '';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gym-logos', 'gym-logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy gym_logos_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'gym-logos' and public.is_platform_admin());
create policy gym_logos_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'gym-logos' and public.is_platform_admin());
create policy gym_logos_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'gym-logos' and public.is_platform_admin());

create function public.admin_set_gym_logo(p_gym_id uuid, p_path text) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only the Messy2Easy admin can change gym logos' using errcode = '42501';
  end if;
  update public.gyms set logo_path = coalesce(p_path, '') where id = p_gym_id;
  if not found then raise exception 'Gym not found'; end if;
end;
$$;

create function public.admin_platform_stats()
returns table (gym_id uuid, members bigint, active_members bigint, waiting bigint, registrations bigint, checkins_30d bigint, last_checkin timestamptz)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only the Messy2Easy admin can see platform numbers' using errcode = '42501';
  end if;
  return query
  select g.id,
    (select count(*) from public.members m where m.gym_id = g.id),
    (select count(*) from public.members m where m.gym_id = g.id and not m.suspended
       and exists (select 1 from public.memberships x where x.member_id = m.id and x.start_date <= public.gym_today() and x.end_date >= public.gym_today())),
    (select count(*) from public.members m where m.gym_id = g.id
       and not exists (select 1 from public.memberships x where x.member_id = m.id)),
    (select count(*) from public.members m where m.gym_id = g.id and m.source = 'form'),
    (select count(*) from public.attendance a where a.gym_id = g.id and a.checked_in_at >= now() - interval '30 days'),
    (select max(a.checked_in_at) from public.attendance a where a.gym_id = g.id)
  from public.gyms g;
end;
$$;

-- Public form: also the gym's logo (same function as in 20261021090000_registration_intake, plus logo_path).
drop function public.registration_form(text);
create function public.registration_form(p_token text)
returns table (gym_name text, gym_address text, gym_phone text, plans jsonb, logo_path text)
language sql stable security definer set search_path = public
as $$
  select g.name, g.address, g.phone,
         coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'days', p.days, 'price', p.price) order by p.days, p.price)
                   from public.plans p where p.gym_id = g.id and p.active), '[]'::jsonb),
         g.logo_path
  from public.gyms g
  where g.registration_token = p_token
    and g.active and (g.subscription_ends_on is null or g.subscription_ends_on >= public.gym_today())
$$;

revoke all on function public.registration_form(text) from public;
grant execute on function public.registration_form(text) to anon, authenticated, service_role;
revoke all on function public.admin_set_gym_logo(uuid, text), public.admin_platform_stats() from public, anon;
grant execute on function public.admin_set_gym_logo(uuid, text), public.admin_platform_stats() to authenticated, service_role;
