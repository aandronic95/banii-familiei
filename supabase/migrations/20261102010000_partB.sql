-- Partea B: pentru cine e cheltuiala (cât costă fiecare membru) și planificatorul de călătorii

-- Pentru cine: pe tranzacție, și implicit pe categorie (ex. „Copilul” → copilul)
alter table public.transactions add column if not exists for_member_id uuid references public.members(id) on delete set null;
alter table public.categories add column if not exists for_member_id uuid references public.members(id) on delete set null;

create or replace function public.check_for_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.for_member_id is not null and not exists (select 1 from members where id = new.for_member_id and family_id = new.family_id) then
    raise exception 'persoană invalidă';
  end if;
  return new;
end $$;
create trigger transactions_for_member before insert or update on public.transactions for each row execute function public.check_for_member();
create trigger categories_for_member before insert or update on public.categories for each row execute function public.check_for_member();

-- Călătorii: cheltuielile se leagă prin etichetă (#vacanta-grecia), cu buget pe categorii
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  tag text not null check (length(tag) between 1 and 24 and tag !~ '[[:space:]#]'),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  currency text not null default 'EUR' check (currency in ('MDL','EUR','USD')),
  budget numeric(14,2) check (budget is null or budget >= 0),            -- în moneda călătoriei
  plan jsonb not null default '[]'::jsonb check (jsonb_typeof(plan) = 'array' and jsonb_array_length(plan) <= 20), -- [{ category_id, amount }]
  people int not null default 1 check (people between 1 and 20),
  auto_tag boolean not null default true,                                 -- în timpul călătoriei, cheltuielile noi primesc eticheta
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now(),
  unique (family_id, tag)
);
alter table public.trips enable row level security;
create policy trips_rw on public.trips for all to authenticated using (public.is_member(family_id)) with check (public.is_member(family_id));
do $$ begin
  alter publication supabase_realtime add table public.trips;
exception when undefined_object then null; when duplicate_object then null; end $$;
create trigger trips_audit after insert or update or delete on public.trips for each row execute function public.audit_trg();
