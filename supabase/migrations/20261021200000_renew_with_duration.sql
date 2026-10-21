-- Renewing without plans on the Plans page: choose 1/3/6/12 months and enter the fee
-- (same durations as the registration form; days from registration_days()).
-- One transaction: the new membership period and, if money was received, the payment.
-- Runs as the caller (RLS: their own gym), like renew_membership.

create function public.renew_with_duration(
  p_member_id uuid,
  p_months integer,
  p_fee integer,
  p_start_date date,
  p_paid_amount integer default 0,
  p_method text default 'UPI'
) returns uuid
language plpgsql security invoker set search_path = public
as $$
declare
  v_days integer := public.registration_days(p_months);
  v_name text := case p_months when 1 then '1 Month' else p_months || ' Months' end;
  v_first boolean := not exists (select 1 from public.memberships where member_id = p_member_id);
  v_membership_id uuid;
begin
  if v_days is null then raise exception 'Choose 1, 3, 6 or 12 months'; end if;
  if p_fee is null or p_fee < 0 then raise exception 'Enter the fee in whole rupees'; end if;
  if p_start_date is null then raise exception 'Choose a start date'; end if;
  if coalesce(p_paid_amount, 0) < 0 then raise exception 'Amount cannot be negative'; end if;
  if p_method not in ('UPI', 'Cash', 'Card', 'Bank transfer') then raise exception 'Choose a payment method'; end if;

  insert into public.memberships (member_id, plan_id, plan_name, days, price, start_date)
  values (p_member_id, null, v_name, v_days, p_fee, p_start_date)
  returning id into v_membership_id;

  if coalesce(p_paid_amount, 0) > 0 then
    insert into public.payments (member_id, membership_id, amount, method, note)
    values (p_member_id, v_membership_id, p_paid_amount, p_method, v_name || case when v_first then ' membership' else ' membership renewal' end);
  end if;
  return v_membership_id;
end;
$$;

revoke all on function public.renew_with_duration(uuid, integer, integer, date, integer, text) from public, anon;
grant execute on function public.renew_with_duration(uuid, integer, integer, date, integer, text) to authenticated, service_role;
