-- Keep the activity log small on the free database: drop entries older than 180 days, daily at 3:30 AM IST.
select cron.schedule('activity-log-cleanup', '0 22 * * *', $$ delete from public.activity_log where created_at < now() - interval '180 days' $$);
