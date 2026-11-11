-- Fixed-destination scheduler. No tokens are returned to the browser or stored in job text.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create function public.kijiji_calendar_scheduler_status()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('enabled',exists(select 1 from cron.job where jobname='kijiji-google-calendar-sync' and active),
 'schedule','Every 5 minutes',
 'lastRun',(select max(d.start_time) from cron.job_run_details d join cron.job j using(jobid) where j.jobname='kijiji-google-calendar-sync'));
$$;
revoke all on function public.kijiji_calendar_scheduler_status() from public,anon,authenticated;
grant execute on function public.kijiji_calendar_scheduler_status() to service_role;

-- SECURITY DEFINER is limited to this server-only operation: Vault/Cron are owned by
-- postgres. Browser roles have no execute privilege, and the destination is fixed.
create function public.kijiji_enable_calendar_scheduler(p_secret text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare existing uuid;
begin
 if p_secret is null or length(p_secret)<16 then raise exception 'A server scheduler secret is required'; end if;
 perform pg_catalog.pg_advisory_xact_lock(784132915);
 select id into existing from vault.secrets where name='kijiji_calendar_cron_secret';
 if existing is null then
   perform vault.create_secret(p_secret,'kijiji_calendar_cron_secret','Kijiji calendar scheduled sync');
 else
   perform vault.update_secret(existing,p_secret,'kijiji_calendar_cron_secret','Kijiji calendar scheduled sync');
 end if;
 perform cron.schedule('kijiji-google-calendar-sync','*/5 * * * *',
 $job$select net.http_post(
   url:='https://www.kijijimgmt.com/api/notion-clients?view=google-calendar&action=sync-cron',
   headers:=jsonb_build_object('Content-Type','application/json','Authorization',
    'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='kijiji_calendar_cron_secret')),
   body:='{}'::jsonb,timeout_milliseconds:=65000);$job$);
 return public.kijiji_calendar_scheduler_status();
end $$;
revoke all on function public.kijiji_enable_calendar_scheduler(text) from public,anon,authenticated;
grant execute on function public.kijiji_enable_calendar_scheduler(text) to service_role;
notify pgrst,'reload schema';
