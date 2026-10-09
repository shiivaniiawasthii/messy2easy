-- Demo gym for showing the app to prospective gym owners.
-- Safe to run again: it removes the previous demo gym and logins first.
-- Run: npx supabase db query --linked -f supabase/seed-demo.sql
--
-- Logins: Owner 9000000501, Staff 9000000502. A new random password is made on
-- every run and shown in the result (it is never stored in this file).
-- All member phone numbers are made up.

select set_config('demo.password', 'Demo-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6), false);

delete from auth.users where id in ('d0000000-0000-0000-0000-000000000501', 'd0000000-0000-0000-0000-000000000502');
delete from public.gyms where name = 'Demo Fitness Club';

do $$
declare
  v_gym uuid;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_names text[] := array[
    'Arjun Sharma', 'Priya Verma', 'Rohit Singh', 'Neha Gupta', 'Aditya Mishra', 'Karan Patel',
    'Manish Tiwari', 'Aditi Agarwal', 'Sanjay Kumar', 'Rahul Yadav', 'Pooja Srivastava', 'Vivek Tripathi',
    'Anjali Dubey', 'Saurabh Pandey', 'Kavita Saxena', 'Deepak Chauhan', 'Ritu Kapoor', 'Ankit Shukla',
    'Sneha Bajpai', 'Gaurav Rastogi', 'Nidhi Agnihotri', 'Harsh Vardhan', 'Shalini Mehrotra', 'Amit Verma',
    'Pallavi Dixit', 'Nitin Bhatia', 'Megha Tandon', 'Rajat Khanna', 'Swati Pathak', 'Varun Seth',
    'Komal Jaiswal', 'Abhishek Katiyar', 'Divya Awasthi', 'Prakash Nigam', 'Shruti Mishra', 'Manoj Sachan'];
  v_plan_for text[] := array['Monthly', 'Monthly', 'Monthly', 'Quarterly', 'Quarterly', 'Half yearly', 'Weekly', 'Monthly'];
  v_colors text[] := array['mint', 'blue', 'amber', 'violet', 'rose'];
  v_hours int[] := array[6, 6, 7, 7, 7, 8, 17, 18, 18, 19, 19, 20];
  v_plan record;
  v_member uuid;
  v_joined date;
  v_expiry date;
  v_start date;
  v_period date;
  v_amount int;
  v_day date;
  v_ts timestamptz;
  i int;
  k int;
  d int;
  u record;
begin
  perform setseed(0.42);

  -- Owner and staff logins.
  for u in select * from (values
    ('d0000000-0000-0000-0000-000000000501'::uuid, '9000000501', 'Demo Owner'),
    ('d0000000-0000-0000-0000-000000000502'::uuid, '9000000502', 'Demo Staff')) as t(id, phone, name)
  loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.phone || '@login.messy2easy.in', extensions.crypt(current_setting('demo.password'), extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('name', u.name), now(), now(), '', '', '', '');
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.phone || '@login.messy2easy.in', 'email_verified', true), 'email', now(), now(), now());
  end loop;

  insert into public.gyms (name, address, phone) values ('Demo Fitness Club', 'Swaroop Nagar, Kanpur', '+91 90000 00500') returning id into v_gym;
  insert into public.staff (user_id, gym_id, name, phone, role, must_change_password) values
    ('d0000000-0000-0000-0000-000000000501', v_gym, 'Demo Owner', '9000000501', 'owner', false),
    ('d0000000-0000-0000-0000-000000000502', v_gym, 'Demo Staff', '9000000502', 'staff', false);

  insert into public.plans (gym_id, name, days, price) values
    (v_gym, 'Day pass', 1, 100), (v_gym, 'Weekly', 7, 400), (v_gym, 'Monthly', 30, 1000),
    (v_gym, 'Quarterly', 90, 2700), (v_gym, 'Half yearly', 180, 5000);

  for i in 1 .. array_length(v_names, 1) loop
    select * into v_plan from public.plans where gym_id = v_gym and name = v_plan_for[1 + (i % 8)];
    v_joined := v_today - (20 + (i * 37) % 300);
    -- Every 6th member has lapsed; the rest are spread across their current period.
    if i % 6 = 0 then
      v_expiry := v_today - (10 + (i * 7) % 50);
    else
      v_expiry := v_today + (-3 + (i * 11) % (v_plan.days + 1));
    end if;
    v_start := v_expiry - (v_plan.days - 1);
    if v_start < v_joined then v_joined := v_start; end if;

    insert into public.members (gym_id, name, phone, joined_on, color, suspended, notes, created_at)
    values (v_gym, v_names[i], (9000100000 + i * 7919)::text, v_joined, v_colors[1 + i % 5], i = 10,
            case when i % 4 = 0 then 'Prefers morning batch' else '' end, v_joined::timestamp)
    returning id into v_member;

    -- One membership (and payment) per period, back to the joining date.
    k := 0;
    loop
      v_period := v_start - k * v_plan.days;
      exit when v_period < v_joined or k > 12;
      insert into public.memberships (gym_id, member_id, plan_id, plan_name, days, price, start_date, created_at)
      values (v_gym, v_member, v_plan.id, v_plan.name, v_plan.days, v_plan.price, v_period, least((v_period + time '08:00') at time zone 'Asia/Kolkata', now()));
      v_amount := v_plan.price;
      if k = 0 and i % 5 = 0 then v_amount := v_plan.price / 2; end if;   -- partly paid
      if k = 0 and i % 9 = 0 then v_amount := 0; end if;                  -- not paid yet
      if v_amount > 0 then
        insert into public.payments (gym_id, member_id, amount, method, paid_at, note)
        values (v_gym, v_member, v_amount, case when (i + k) % 3 = 1 then 'Cash' else 'UPI' end,
                least((v_period + time '09:00') at time zone 'Asia/Kolkata' + (i % 5) * interval '37 minutes', now()),
                v_plan.name || ' membership');
      end if;
      k := k + 1;
    end loop;

    -- Check-ins for the last 120 days at the member's usual time (a few have stopped coming).
    if i % 7 <> 3 and i <> 10 then
      for d in 0 .. 119 loop
        v_day := v_today - d;
        continue when v_day < v_joined or v_day > v_expiry;
        continue when random() > case when extract(dow from v_day) = 0 then 0.2 else 0.6 end;
        v_ts := (v_day + make_time(v_hours[1 + i % 12], (random() * 59)::int, 0)) at time zone 'Asia/Kolkata';
        continue when v_ts > now();
        insert into public.attendance (gym_id, member_id, checked_in_at) values (v_gym, v_member, v_ts);
      end loop;
    else
      -- Came a while ago, then stopped (shows under "stopped coming").
      insert into public.attendance (gym_id, member_id, checked_in_at)
      values (v_gym, v_member, ((v_today - 20) + time '07:10') at time zone 'Asia/Kolkata');
    end if;
  end loop;

  -- Six months of running costs.
  for k in 0 .. 5 loop
    v_day := (date_trunc('month', v_today) - (k || ' months')::interval)::date;
    insert into public.expenses (gym_id, spent_on, category, amount, method, note) values
      (v_gym, v_day, 'Rent', 6000, 'Bank transfer', 'Hall rent'),
      (v_gym, v_day + 4, 'Salaries', 4000, 'UPI', 'Trainer salary'),
      (v_gym, v_day + 9, 'Electricity & water', 1400 + (k * 230) % 500, 'UPI', 'Electricity bill');
    if k % 2 = 0 then
      insert into public.expenses (gym_id, spent_on, category, amount, method, note) values (v_gym, v_day + 17, 'Maintenance & cleaning', 700, 'Cash', 'Cleaning & small repairs');
    end if;
  end loop;
  delete from public.expenses where gym_id = v_gym and spent_on > v_today;
end $$;

select current_setting('demo.password') as demo_password,
       (select count(*) from public.members m join public.gyms g on g.id = m.gym_id where g.name = 'Demo Fitness Club') as demo_members,
       (select count(*) from public.payments p join public.gyms g on g.id = p.gym_id where g.name = 'Demo Fitness Club') as demo_payments,
       (select count(*) from public.attendance a join public.gyms g on g.id = a.gym_id where g.name = 'Demo Fitness Club') as demo_checkins;
