-- Activity log for the owner's bell: who did what, and when.
-- Filled by triggers, so every change is recorded however it was made. Only the gym's owner can read it.
-- Logging can never block the real change: errors inside the trigger are swallowed.

create table public.activity_log (
  id bigint generated always as identity primary key,
  gym_id uuid not null references public.gyms (id) on delete cascade,
  actor uuid references auth.users (id) on delete set null,
  actor_name text not null default '',
  action text not null,
  member_id uuid,
  member_name text not null default '',
  amount integer,
  old_amount integer,
  detail text not null default '',
  created_at timestamptz not null default now()
);
create index activity_log_gym_time_idx on public.activity_log (gym_id, created_at desc);

alter table public.activity_log enable row level security;
create policy activity_log_select on public.activity_log for select to authenticated
  using (gym_id = public.current_gym_id() and public.is_owner());
revoke all on public.activity_log from anon, authenticated;
grant select on public.activity_log to authenticated;
grant all on public.activity_log to service_role;

create function public.log_activity() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_gym uuid;
  v_action text;
  v_member uuid;
  v_member_name text := '';
  v_amount integer;
  v_old_amount integer;
  v_detail text := '';
  v_actor_name text;
begin
  -- Only changes made by a logged-in person (not seeds or server jobs).
  if v_uid is null then return null; end if;
  begin
    v_gym := coalesce((v_row ->> 'gym_id')::uuid, case when tg_table_name = 'gyms' then (v_row ->> 'id')::uuid end);
    v_member := case when tg_table_name = 'members' then (v_row ->> 'id')::uuid else (v_row ->> 'member_id')::uuid end;

    -- Rows removed because their member was deleted: the member deletion is logged once instead.
    if tg_op = 'DELETE' and tg_table_name in ('payments', 'attendance', 'memberships')
       and not exists (select 1 from public.members where id = v_member) then
      return null;
    end if;

    if tg_table_name = 'members' then
      v_member_name := v_row ->> 'name';
      if tg_op = 'INSERT' then v_action := 'member_added';
      elsif tg_op = 'DELETE' then v_action := 'member_deleted';
      elsif (v_new ->> 'suspended') is distinct from (v_old ->> 'suspended') then
        v_action := case when (v_new ->> 'suspended')::boolean then 'member_suspended' else 'member_reactivated' end;
      elsif (v_new - 'created_at') is distinct from (v_old - 'created_at') then v_action := 'member_updated';
      end if;

    elsif tg_table_name = 'payments' then
      v_amount := (v_row ->> 'amount')::integer;
      v_detail := v_row ->> 'method';
      if tg_op = 'INSERT' then v_action := 'payment_added';
      elsif tg_op = 'DELETE' then v_action := 'payment_deleted';
      elsif v_new is distinct from v_old then
        v_action := 'payment_edited';
        v_old_amount := (v_old ->> 'amount')::integer;
      end if;

    elsif tg_table_name = 'attendance' then
      v_action := case tg_op when 'INSERT' then 'checkin' when 'DELETE' then 'checkin_removed' end;

    elsif tg_table_name = 'memberships' then
      v_amount := (v_row ->> 'price')::integer;
      v_detail := v_row ->> 'plan_name';
      if tg_op = 'INSERT' then
        -- The first membership comes with "member added"; later ones are renewals.
        if (select count(*) from public.memberships where member_id = v_member) > 1 then v_action := 'renewed'; end if;
      elsif tg_op = 'DELETE' then v_action := 'membership_deleted';
      elsif v_new is distinct from v_old then v_action := 'membership_edited'; v_old_amount := (v_old ->> 'price')::integer;
      end if;

    elsif tg_table_name = 'plans' then
      v_detail := v_row ->> 'name';
      v_amount := (v_row ->> 'price')::integer;
      if tg_op = 'INSERT' then v_action := 'plan_added';
      elsif tg_op = 'DELETE' or ((v_old ->> 'active')::boolean and not (v_new ->> 'active')::boolean) then v_action := 'plan_deleted';
      elsif v_new is distinct from v_old then v_action := 'plan_edited'; v_old_amount := (v_old ->> 'price')::integer;
      end if;

    elsif tg_table_name = 'expenses' then
      v_amount := (v_row ->> 'amount')::integer;
      v_detail := v_row ->> 'category';
      v_action := case tg_op when 'INSERT' then 'expense_added' when 'DELETE' then 'expense_deleted' end;

    elsif tg_table_name = 'gyms' then
      -- Only real profile edits (the member-code counter also updates this row).
      if tg_op = 'UPDATE' and ((v_new ->> 'name', v_new ->> 'address', v_new ->> 'phone', v_new ->> 'gstin')
          is distinct from (v_old ->> 'name', v_old ->> 'address', v_old ->> 'phone', v_old ->> 'gstin')) then
        v_action := 'gym_updated';
      end if;
    end if;

    if v_action is null or v_gym is null then return null; end if;
    if v_member is not null and v_member_name = '' then
      select name into v_member_name from public.members where id = v_member;
    end if;
    select name into v_actor_name from public.staff where user_id = v_uid;
    if v_actor_name is null and exists (select 1 from public.platform_admins where user_id = v_uid) then v_actor_name := 'Messy2Easy'; end if;

    insert into public.activity_log (gym_id, actor, actor_name, action, member_id, member_name, amount, old_amount, detail)
    values (v_gym, v_uid, coalesce(v_actor_name, ''), v_action, v_member, coalesce(v_member_name, ''), v_amount, v_old_amount, coalesce(v_detail, ''));
  exception when others then
    null; -- never block the real change because of the log
  end;
  return null;
end;
$$;
revoke all on function public.log_activity() from public, anon, authenticated;

create trigger log_activity after insert or update or delete on public.members for each row execute function public.log_activity();
create trigger log_activity after insert or update or delete on public.payments for each row execute function public.log_activity();
create trigger log_activity after insert or delete on public.attendance for each row execute function public.log_activity();
create trigger log_activity after insert or update or delete on public.memberships for each row execute function public.log_activity();
create trigger log_activity after insert or update or delete on public.plans for each row execute function public.log_activity();
create trigger log_activity after insert or delete on public.expenses for each row execute function public.log_activity();
create trigger log_activity after update on public.gyms for each row execute function public.log_activity();
