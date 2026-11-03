-- Câte programări bf-* sunt active în pg_cron și ultima lor rulare (pentru verificarea de la publicare)
create or replace function public.cron_status() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  execute $q$select jsonb_build_object(
      'jobs', (select count(*) from cron.job where jobname like 'bf-%' and active),
      'last', (select max(start_time) from cron.job_run_details d join cron.job j on j.jobid = d.jobid where j.jobname like 'bf-%'),
      'failed', (select count(*) from cron.job_run_details d join cron.job j on j.jobid = d.jobid where j.jobname like 'bf-%' and d.status = 'failed' and d.start_time > now() - interval '1 day'))$q$ into r;
  return r;
exception when others then
  return jsonb_build_object('jobs', 0, 'error', sqlerrm);
end $$;
revoke all on function public.cron_status() from public, anon, authenticated;
