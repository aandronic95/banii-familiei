-- Notificările pornite din baza de date (pg_cron + pg_net), la oră fixă.
-- Programările GitHub pot întârzia ore întregi; ele rămân doar ca rezervă (funcția trimite o singură dată).

-- Adresa funcțiilor și secretul programării; le scrie funcția notify la primul apel autorizat.
-- RLS fără politici: nimeni din aplicație nu le poate citi, doar serverul.
create table if not exists public.cron_config (
  id int primary key default 1 check (id = 1),
  base_url text not null,
  secret text not null,
  updated_at timestamptz not null default now()
);
alter table public.cron_config enable row level security;
revoke all on public.cron_config from anon, authenticated;

create or replace function public.call_function(path text) returns void
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from public.cron_config where id = 1;
  if c is null then return; end if;
  perform net.http_post(url := c.base_url || path, body := '{}'::jsonb,
    headers := jsonb_build_object('x-cron-secret', c.secret, 'content-type', 'application/json'),
    timeout_milliseconds := 60000);
end $$;
revoke all on function public.call_function(text) from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_net with schema extensions;
  create extension if not exists pg_cron with schema pg_catalog;
  -- orele sunt UTC; seara rulează de două ori (20:00 / 21:00 UTC) ca să prindă ora 21–22 la Chișinău și vara, și iarna;
  -- funcția trimite doar o dată pe zi și doar până la 23:59 ora Chișinăului
  perform cron.unschedule(jobname) from cron.job where jobname like 'bf-%';
  perform cron.schedule('bf-daily',    '0 6 * * *',   $c$select public.call_function('/notify?task=daily')$c$);
  perform cron.schedule('bf-evening1', '0 18 * * *',  $c$select public.call_function('/notify?task=evening')$c$);
  perform cron.schedule('bf-evening2', '0 19 * * *',  $c$select public.call_function('/notify?task=evening')$c$);
  perform cron.schedule('bf-remind',   '*/15 * * * *', $c$select public.call_function('/notify?task=remind')$c$);
  perform cron.schedule('bf-weekly',   '0 16 * * 0',  $c$select public.call_function('/notify?task=weekly'); select public.call_function('/docs?type=export&all=1')$c$);
  perform cron.schedule('bf-monthly',  '30 6 1 * *',  $c$select public.call_function('/notify?task=monthly'); select public.call_function('/docs?type=report&all=1')$c$);
exception when others then
  raise notice 'pg_cron/pg_net indisponibile (%): rămân programările din GitHub', sqlerrm;
end $$;
