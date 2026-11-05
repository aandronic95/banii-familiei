-- Informații despre versiunea publicată (pentru anunțul „Aplicația s-a actualizat” din bot). Doar serverul o vede.
create table if not exists public.app_meta (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.app_meta enable row level security;
revoke all on public.app_meta from anon, authenticated;
