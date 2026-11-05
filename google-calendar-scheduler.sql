-- Run ONLY after enabling pg_cron + pg_net, setting the Vault secret via the UI,
-- deploying production, authorizing Google, and passing the manual calendar test.
-- No secret literals: use the same CRON_SECRET as existing Vercel reminders.
do $$ begin
 if not exists (select 1 from vault.secrets where name='kijiji_calendar_cron_secret') then
  raise exception 'Create kijiji_calendar_cron_secret in Supabase Vault first.';
 end if;
end $$;
select cron.schedule(
 'kijiji-google-calendar-sync',
 '*/5 * * * *',
 $job$
 select net.http_post(
   url := 'https://www.kijijimgmt.com/api/notion-clients?view=google-calendar&action=sync-cron',
   headers := jsonb_build_object('Content-Type','application/json','Authorization',
     'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='kijiji_calendar_cron_secret')),
   body := '{}'::jsonb,
   timeout_milliseconds := 65000
 );
 $job$
);
-- Monitor: select jobid,jobname,schedule,active from cron.job where jobname='kijiji-google-calendar-sync';
-- Inspect HTTP status + safe body in net._http_response; do not print request headers/secrets.
-- Pause: select cron.unschedule('kijiji-google-calendar-sync');
