-- Alertă „sold mic” pe cont: sub prag, botul anunță o dată; după ce contul e suplinit, alerta se rearmează
alter table public.accounts add column if not exists low_alert numeric(14,2) check (low_alert is null or low_alert >= 0);
alter table public.accounts add column if not exists low_sent boolean not null default false;
