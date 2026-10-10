-- One check-in per member per day (India time), and a trustworthy log of who marked it.
--
-- A trigger (not a unique index) so that older repeat entries stay in the history
-- for the owner to see, while new repeats are refused.

create function public.attendance_once_a_day() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_day date;
  v_prev record;
begin
  -- From the app the time and the person are always "now" and "me", so the log can't be faked.
  if auth.uid() is not null then
    new.checked_in_at := now();
    new.created_by := auth.uid();
  end if;

  -- Two desks checking in the same member at the same moment: one waits for the other.
  perform pg_advisory_xact_lock(hashtext('attendance:' || new.member_id::text));

  v_day := (new.checked_in_at at time zone 'Asia/Kolkata')::date;
  select a.checked_in_at, coalesce(s.name, '') as by_name into v_prev
  from public.attendance a
  left join public.staff s on s.user_id = a.created_by
  where a.member_id = new.member_id
    and a.checked_in_at >= (v_day::timestamp at time zone 'Asia/Kolkata')
    and a.checked_in_at < ((v_day + 1)::timestamp at time zone 'Asia/Kolkata')
  order by a.checked_in_at
  limit 1;

  if found then
    raise exception 'already_checked_in'
      using errcode = 'P0001',
            detail = to_char(v_prev.checked_in_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS') || '|' || v_prev.by_name;
  end if;
  return new;
end;
$$;

create trigger attendance_once_a_day before insert on public.attendance
for each row execute function public.attendance_once_a_day();

revoke all on function public.attendance_once_a_day() from public, anon, authenticated;
