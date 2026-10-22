-- Plăți recurente, datorii personale, obiective de economii

-- ───────── Plăți recurente (chirie, internet, salariu…) ─────────
create table public.recurring (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  kind text not null default 'expense' check (kind in ('expense','income')),
  name text not null,
  amount numeric(14,2) not null check (amount > 0),
  account_id uuid references public.accounts(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  member_id uuid references public.members(id) on delete set null,
  every_months smallint not null default 1 check (every_months between 1 and 12),
  day_of_month smallint not null check (day_of_month between 1 and 31),
  next_date date not null,
  auto_add boolean not null default true,     -- se adaugă singură în ziua plății
  remind boolean not null default true,       -- botul anunță cu o zi înainte
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.recurring(family_id);

-- ───────── Datorii personale ─────────
create table public.debts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  direction text not null check (direction in ('owed_to_us','we_owe')),  -- ne datorează / datorăm noi
  person text not null,
  amount numeric(14,2) not null check (amount > 0),
  paid numeric(14,2) not null default 0 check (paid >= 0),
  currency text not null default 'MDL' check (currency in ('MDL','EUR','USD')),
  date date not null default current_date,
  due_date date,
  member_id uuid references public.members(id) on delete set null,
  note text,
  settled boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.debts(family_id);

-- ───────── Obiective de economii (și pușculița copilului) ─────────
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  target numeric(14,2) not null check (target > 0),
  currency text not null default 'MDL' check (currency in ('MDL','EUR','USD')),
  account_id uuid references public.accounts(id) on delete set null,  -- progresul = soldul acestui cont
  saved numeric(14,2) not null default 0,                              -- dacă nu e legat de un cont
  member_id uuid references public.members(id) on delete set null,
  deadline date,
  icon text not null default 'piggy',
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.goals(family_id);

alter table public.transactions add column if not exists recurring_id uuid references public.recurring(id) on delete set null;
alter table public.transactions add column if not exists debt_id uuid references public.debts(id) on delete set null;

-- RLS: doar familia
do $$
declare t text;
begin
  foreach t in array array['recurring','debts','goals'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_member(family_id)) with check (public.is_member(family_id))', t || '_rw', t);
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when undefined_object then null; when duplicate_object then null;
    end;
  end loop;
end $$;

-- Integritate: legăturile trebuie să fie din aceeași familie
create or replace function public.check_links_family() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jsonb := to_jsonb(new);
begin
  if j ? 'account_id' and j->>'account_id' is not null and not exists (select 1 from accounts where id = (j->>'account_id')::uuid and family_id = new.family_id) then
    raise exception 'cont invalid';
  end if;
  if j ? 'category_id' and j->>'category_id' is not null and not exists (select 1 from categories where id = (j->>'category_id')::uuid and family_id = new.family_id) then
    raise exception 'categorie invalidă';
  end if;
  if j ? 'member_id' and j->>'member_id' is not null and not exists (select 1 from members where id = (j->>'member_id')::uuid and family_id = new.family_id) then
    raise exception 'persoană invalidă';
  end if;
  return new;
end $$;
create trigger recurring_family_check before insert or update on public.recurring for each row execute function public.check_links_family();
create trigger debts_family_check before insert or update on public.debts for each row execute function public.check_links_family();
create trigger goals_family_check before insert or update on public.goals for each row execute function public.check_links_family();

create or replace function public.check_tx_links2() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.recurring_id is not null and not exists (select 1 from recurring where id = new.recurring_id and family_id = new.family_id) then
    raise exception 'plată recurentă invalidă';
  end if;
  if new.debt_id is not null and not exists (select 1 from debts where id = new.debt_id and family_id = new.family_id) then
    raise exception 'datorie invalidă';
  end if;
  return new;
end $$;
create trigger tx_links2_check before insert or update on public.transactions for each row execute function public.check_tx_links2();

-- Membrii pot alege să primească raportul lunar și backup-ul
alter table public.members alter column notify set default '{"loans":true,"budget":true,"weekly":true,"car":true,"invest":true,"recurring":true,"debts":true,"monthly":true,"backup":false}'::jsonb;
