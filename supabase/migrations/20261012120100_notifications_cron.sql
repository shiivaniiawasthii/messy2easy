-- Runs the daily-summary check every 15 minutes (Supabase cron → "notifications" Edge Function).
-- Needs two Vault secrets first (see README, "Owner notifications"):
--   notifications_url          https://<project-ref>.supabase.co/functions/v1/notifications
--   notifications_cron_secret  same value as the function secret CRON_SECRET

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'daily-summary-every-15-min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'notifications_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notifications_cron_secret')
    ),
    body := '{"action":"run"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
