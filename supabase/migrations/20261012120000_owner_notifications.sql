-- Owner notifications: daily summary settings and a delivery log.
-- The app reaches these only through the "notifications" Edge Function, which checks that
-- the caller is the gym's owner. Logged-in users get no direct access to the tables.

create table public.notification_settings (
  gym_id uuid primary key references public.gyms (id) on delete cascade,
  enabled boolean not null default false,
  channels text[] not null default '{whatsapp}' check (channels <@ array['whatsapp', 'email']),
  whatsapp_number text not null default '' check (whatsapp_number = '' or whatsapp_number ~ '^[6-9][0-9]{9}$'),
  email text not null default '' check (email = '' or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  send_time time not null default '20:00' check (extract(minute from send_time) in (0, 15, 30, 45) and extract(second from send_time) = 0),
  included_sections text[] not null default '{collections,checkins,expiring,expired,dues,inactive}'
    check (included_sections <@ array['collections', 'checkins', 'expiring', 'expired', 'dues', 'inactive']),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

-- One row per gym, IST date and channel for the scheduled summary ("daily"), so a retry of the
-- cron can never send twice. Test sends ("test") are logged too but not limited.
create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  summary_date date not null,
  channel text not null check (channel in ('whatsapp', 'email')),
  kind text not null check (kind in ('daily', 'test')),
  status text not null check (status in ('sending', 'sent', 'failed')),
  error text not null default '',
  attempts integer not null default 1,
  fallback_for text check (fallback_for in ('whatsapp')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create unique index notification_log_daily_once on public.notification_log (gym_id, summary_date, channel) where kind = 'daily';
create index notification_log_gym_idx on public.notification_log (gym_id, created_at desc);

alter table public.notification_settings enable row level security;
alter table public.notification_log enable row level security;
-- No policies and no grants for anon/authenticated: only the service role (Edge Function) can use them.
revoke all on public.notification_settings, public.notification_log from anon, authenticated;
grant all on public.notification_settings, public.notification_log to service_role;

-- Claims the right to send today's summary on one channel. Returns the log row id, or null when it
-- was already sent (or is being sent) — that is what prevents duplicates. A failed attempt may be
-- retried by a later cron run, at most 3 attempts per day.
create function public.claim_daily_notification(p_gym_id uuid, p_date date, p_channel text, p_fallback_for text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.notification_log (gym_id, summary_date, channel, kind, status, fallback_for)
  values (p_gym_id, p_date, p_channel, 'daily', 'sending', p_fallback_for)
  on conflict (gym_id, summary_date, channel) where kind = 'daily' do nothing
  returning id into v_id;
  if v_id is not null then return v_id; end if;

  update public.notification_log
  set status = 'sending', attempts = attempts + 1, error = '', created_at = now()
  where gym_id = p_gym_id and summary_date = p_date and channel = p_channel and kind = 'daily'
    and status = 'failed' and attempts < 3
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.claim_daily_notification(uuid, date, text, text) from public, anon, authenticated;
grant execute on function public.claim_daily_notification(uuid, date, text, text) to service_role;

-- The server (service role) reads member balances for the summary. Let member_paid_total
-- count payments for it too; app users still only get their own gym.
create or replace function public.member_paid_total(p_member_id uuid) returns bigint
language sql stable security definer set search_path = public
as $$
  select coalesce(sum(amount), 0) from public.payments
  where member_id = p_member_id
    and (gym_id = public.current_gym_id() or current_setting('role', true) = 'service_role')
$$;
