-- Staff see only the payments they recorded; owners see all, with who added each and when.

-- Who added a payment and when are always the logged-in person and "now" (can't be faked from the app).
-- paid_at stays editable: a payment received yesterday can be entered today.
create function public.payments_stamp_author() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
    new.created_at := now();
  end if;
  return new;
end;
$$;
create trigger payments_stamp_author before insert on public.payments
for each row execute function public.payments_stamp_author();
revoke all on function public.payments_stamp_author() from public, anon, authenticated;

drop policy payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated
  using (gym_id = public.current_gym_id() and (public.is_owner() or created_by = auth.uid()));

-- Dues must still count every payment, also for staff who can't see them all.
create function public.member_paid_total(p_member_id uuid) returns bigint
language sql stable security definer set search_path = public
as $$
  select coalesce(sum(amount), 0) from public.payments
  where member_id = p_member_id and gym_id = public.current_gym_id()
$$;
revoke all on function public.member_paid_total(uuid) from public, anon;
grant execute on function public.member_paid_total(uuid) to authenticated;

create or replace view public.member_overview with (security_invoker = true) as
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
left join lateral (select max(a.checked_in_at) as last_visit from public.attendance a where a.member_id = m.id) visit on true;
