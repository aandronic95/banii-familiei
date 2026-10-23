-- Preferințe personale (ecranul Acasă, fondul de urgență, alertele de curs) și referința bonului fiscal (cod QR)
alter table public.members add column if not exists prefs jsonb not null default '{}'::jsonb;
alter table public.transactions add column if not exists fiscal_ref text check (fiscal_ref is null or length(fiscal_ref) <= 120);
create index if not exists transactions_fiscal on public.transactions(family_id, fiscal_ref) where fiscal_ref is not null;
