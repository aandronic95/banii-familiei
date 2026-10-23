-- Etichete (#vacanță, #renovare), bon împărțit pe categorii și șabloane rapide
alter table public.transactions
  add column if not exists tags text[] not null default '{}',
  add column if not exists split_id uuid;
create index if not exists transactions_tags on public.transactions using gin(tags);
create index if not exists transactions_split on public.transactions(split_id) where split_id is not null;
alter table public.transactions add constraint transactions_tags_limit check (cardinality(tags) <= 8);

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null check (length(name) between 1 and 40),
  kind text not null default 'expense' check (kind in ('expense','income')),
  amount numeric(14,2) not null check (amount > 0),
  account_id uuid not null references public.accounts(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  member_id uuid references public.members(id) on delete set null,
  merchant text,
  car_id uuid references public.cars(id) on delete set null,
  car_kind text,
  tags text[] not null default '{}',
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.templates(family_id);
alter table public.templates enable row level security;
create policy templates_rw on public.templates for all to authenticated
  using (public.is_member(family_id)) with check (public.is_member(family_id));
create trigger templates_family_check before insert or update on public.templates for each row execute function public.check_links_family();

create or replace function public.check_template_car() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.car_id is not null and not exists (select 1 from cars where id = new.car_id and family_id = new.family_id) then
    raise exception 'mașină invalidă';
  end if;
  return new;
end $$;
create trigger templates_car_check before insert or update on public.templates for each row execute function public.check_template_car();

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.templates;
  end if;
end $$;
