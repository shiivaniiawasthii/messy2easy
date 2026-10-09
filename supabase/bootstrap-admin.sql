-- Make yourself the platform admin (run ONCE, after the migration).
--
-- 1. Supabase dashboard → Authentication → Users → "Add user" → "Create new user"
--      Email:    <your 10-digit mobile>@login.messy2easy.in   e.g. 9876543210@login.messy2easy.in
--      Password: a strong password you will remember
--      Tick "Auto Confirm User".
-- 2. Supabase dashboard → SQL Editor → paste this, put your number below, Run.

insert into public.platform_admins (user_id)
select id from auth.users
where email = '9876543210@login.messy2easy.in';   -- ← your number here

-- Check: should return one row.
select u.email from public.platform_admins a join auth.users u on u.id = a.user_id;
