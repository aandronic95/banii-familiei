-- Banii Familiei — schema, securitate pe rânduri (RLS), stocare bonuri
-- Toate datele aparțin unei familii; doar membrii familiei cu acces le pot citi și modifica.

create extension if not exists pgcrypto;

-- ───────────────────────── Familie și membri ─────────────────────────
create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Familia mea',
  base_currency text not null default 'MDL',
  created_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid unique references auth.users(id) on delete set null,
  telegram_id bigint unique,
  name text not null,
  kind text not null default 'adult' check (kind in ('adult','child')),
  role text not null default 'none' check (role in ('owner','editor','none')),
  color smallint not null default 1 check (color between 1 and 3),
  lang text not null default 'ro' check (lang in ('ro','ru')),
  notify jsonb not null default '{"loans":true,"budget":true,"weekly":true,"car":true}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.members(family_id);

create table public.invites (
  code text primary key,
  family_id uuid not null references public.families(id) on delete cascade,
  member_name text not null default 'Soția',
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  used_by bigint,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Funcții de verificare a accesului (security definer: nu sunt afectate de RLS, evită recursivitatea)
create or replace function public.is_member(fid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members m
                 where m.family_id = fid and m.user_id = auth.uid() and m.role in ('owner','editor'));
$$;

create or replace function public.is_owner(fid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members m
                 where m.family_id = fid and m.user_id = auth.uid() and m.role = 'owner');
$$;

create or replace function public.my_family_id() returns uuid
language sql stable security definer set search_path = public as $$
  select m.family_id from public.members m
  where m.user_id = auth.uid() and m.role in ('owner','editor') limit 1;
$$;

-- ───────────────────────── Conturi și categorii ─────────────────────────
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  type text not null check (type in ('card','cash','deposit')),
  currency text not null default 'MDL' check (currency in ('MDL','EUR','USD')),
  member_id uuid references public.members(id) on delete set null,
  bank text,
  last4 text,
  opening_balance numeric(14,2) not null default 0,
  interest_rate numeric(6,3),
  maturity_date date,
  archived boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.accounts(family_id);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  kind text not null check (kind in ('expense','income')),
  name_ro text not null,
  name_ru text not null,
  icon text not null default 'tag',
  budget numeric(14,2),
  sort int not null default 0,
  archived boolean not null default false
);
create index on public.categories(family_id);

-- ───────────────────────── Mașini ─────────────────────────
create table public.cars (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  plate text,
  odometer_start int not null default 0,
  created_at timestamptz not null default now()
);

create table public.car_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  car_id uuid not null references public.cars(id) on delete cascade,
  kind text not null check (kind in ('rca','casco','inspection','service')),
  title text not null,
  due_date date,
  due_km int,
  amount numeric(14,2),
  done boolean not null default false,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Tranzacții ─────────────────────────
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  kind text not null check (kind in ('expense','income','transfer')),
  amount numeric(14,2) not null check (amount > 0),
  account_id uuid not null references public.accounts(id) on delete restrict,
  to_account_id uuid references public.accounts(id) on delete restrict,
  to_amount numeric(14,2),
  category_id uuid references public.categories(id) on delete set null,
  member_id uuid references public.members(id) on delete set null,
  date date not null default current_date,
  merchant text,
  note text,
  receipt_path text,
  car_id uuid references public.cars(id) on delete set null,
  car_kind text check (car_kind in ('fuel','service','other')),
  fuel_liters numeric(8,2),
  odometer int,
  full_tank boolean,
  loan_id uuid,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (kind <> 'transfer' or to_account_id is not null)
);
create index on public.transactions(family_id, date desc);
create index on public.transactions(account_id);
create index on public.transactions(to_account_id);

-- ───────────────────────── Credite ─────────────────────────
create table public.loans (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  type text not null check (type in ('mortgage','consumer')),
  bank text,
  currency text not null default 'MDL' check (currency in ('MDL','EUR','USD')),
  principal numeric(14,2) not null check (principal > 0),
  annual_rate numeric(6,3) not null default 0,
  term_months int not null check (term_months > 0),
  first_due date not null,
  paid_before int not null default 0,     -- rate plătite înainte de a folosi aplicația
  monthly_payment numeric(14,2),          -- opțional: rata exactă din contract (altfel se calculează anuitar)
  account_id uuid references public.accounts(id) on delete set null,
  closed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.transactions
  add constraint transactions_loan_fk foreign key (loan_id) references public.loans(id) on delete set null;

create table public.loan_payments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  loan_id uuid not null references public.loans(id) on delete cascade,
  n int not null,                          -- numărul ratei (1..term)
  paid_at date not null default current_date,
  amount numeric(14,2) not null,
  transaction_id uuid references public.transactions(id) on delete set null,
  unique (loan_id, n)
);

-- ───────────────────────── Curs valutar și jurnal notificări ─────────────────────────
create table public.rates (
  currency text not null check (currency in ('EUR','USD')),
  date date not null,
  rate numeric(12,4) not null,             -- MDL pentru 1 unitate
  primary key (currency, date)
);

create table public.notify_log (
  key text primary key,
  sent_at timestamptz not null default now()
);

-- ───────────────────────── Integritate între familii ─────────────────────────
-- Împiedică legarea unei tranzacții de un cont/categorie din altă familie.
create or replace function public.check_tx_family() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from accounts where id = new.account_id and family_id = new.family_id) then
    raise exception 'cont invalid';
  end if;
  if new.to_account_id is not null and not exists (select 1 from accounts where id = new.to_account_id and family_id = new.family_id) then
    raise exception 'cont destinație invalid';
  end if;
  if new.category_id is not null and not exists (select 1 from categories where id = new.category_id and family_id = new.family_id) then
    raise exception 'categorie invalidă';
  end if;
  if new.member_id is not null and not exists (select 1 from members where id = new.member_id and family_id = new.family_id) then
    raise exception 'persoană invalidă';
  end if;
  if new.car_id is not null and not exists (select 1 from cars where id = new.car_id and family_id = new.family_id) then
    raise exception 'mașină invalidă';
  end if;
  if new.loan_id is not null and not exists (select 1 from loans where id = new.loan_id and family_id = new.family_id) then
    raise exception 'credit invalid';
  end if;
  return new;
end $$;
create trigger tx_family_check before insert or update on public.transactions
  for each row execute function public.check_tx_family();

create or replace function public.check_car_event_family() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from cars where id = new.car_id and family_id = new.family_id) then
    raise exception 'mașină invalidă';
  end if;
  return new;
end $$;
create or replace function public.check_loan_payment_family() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from loans where id = new.loan_id and family_id = new.family_id) then
    raise exception 'credit invalid';
  end if;
  if new.transaction_id is not null and not exists (select 1 from transactions where id = new.transaction_id and family_id = new.family_id) then
    raise exception 'tranzacție invalidă';
  end if;
  return new;
end $$;
create or replace function public.check_account_family() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.member_id is not null and not exists (select 1 from members where id = new.member_id and family_id = new.family_id) then
    raise exception 'persoană invalidă';
  end if;
  return new;
end $$;
create or replace function public.check_loan_family() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.account_id is not null and not exists (select 1 from accounts where id = new.account_id and family_id = new.family_id) then
    raise exception 'cont invalid';
  end if;
  return new;
end $$;
create trigger car_events_family_check before insert or update on public.car_events for each row execute function public.check_car_event_family();
create trigger loan_payments_family_check before insert or update on public.loan_payments for each row execute function public.check_loan_payment_family();
create trigger accounts_family_check before insert or update on public.accounts for each row execute function public.check_account_family();
create trigger loans_family_check before insert or update on public.loans for each row execute function public.check_loan_family();

-- ───────────────────────── RLS ─────────────────────────
alter table public.families enable row level security;
alter table public.members enable row level security;
alter table public.invites enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.cars enable row level security;
alter table public.car_events enable row level security;
alter table public.transactions enable row level security;
alter table public.loans enable row level security;
alter table public.loan_payments enable row level security;
alter table public.rates enable row level security;
alter table public.notify_log enable row level security;  -- fără politici: doar serverul

create policy fam_select on public.families for select to authenticated using (public.is_member(id));
create policy fam_update on public.families for update to authenticated using (public.is_owner(id)) with check (public.is_owner(id));

create policy mem_select on public.members for select to authenticated using (public.is_member(family_id));
-- Proprietarul adaugă/modifică persoane (ex. copilul); rolurile de acces se dau doar prin invitație (server).
create policy mem_insert on public.members for insert to authenticated
  with check (public.is_owner(family_id) and role = 'none' and user_id is null and telegram_id is null);
create policy mem_update on public.members for update to authenticated
  using (public.is_member(family_id)) with check (public.is_member(family_id));
create policy mem_delete on public.members for delete to authenticated
  using (public.is_owner(family_id) and role <> 'owner');

create policy inv_select on public.invites for select to authenticated using (public.is_owner(family_id));
create policy inv_insert on public.invites for insert to authenticated with check (public.is_owner(family_id) and created_by = auth.uid());
create policy inv_delete on public.invites for delete to authenticated using (public.is_owner(family_id));

do $$
declare t text;
begin
  foreach t in array array['accounts','categories','cars','car_events','transactions','loans','loan_payments'] loop
    execute format('create policy %I on public.%I for all to authenticated using (public.is_member(family_id)) with check (public.is_member(family_id))', t || '_rw', t);
  end loop;
end $$;

create policy rates_select on public.rates for select to authenticated using (true);
create policy rates_upsert on public.rates for insert to authenticated with check (public.my_family_id() is not null);
create policy rates_update on public.rates for update to authenticated using (public.my_family_id() is not null);

-- Membrii nu își pot schimba singuri rolul, user_id sau telegram_id.
create or replace function public.protect_member_fields() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated','anon') then
    if new.role is distinct from old.role or new.user_id is distinct from old.user_id
       or new.telegram_id is distinct from old.telegram_id or new.family_id is distinct from old.family_id then
      raise exception 'nu se poate modifica accesul de aici';
    end if;
  end if;
  return new;
end $$;
create trigger members_protect before update on public.members for each row execute function public.protect_member_fields();

-- ───────────────────────── Solduri ─────────────────────────
create or replace view public.account_balances with (security_invoker = true) as
select a.id as account_id,
       a.opening_balance
       + coalesce((select sum(case t.kind when 'income' then t.amount else -t.amount end)
                   from public.transactions t where t.account_id = a.id), 0)
       + coalesce((select sum(coalesce(t.to_amount, t.amount))
                   from public.transactions t where t.to_account_id = a.id and t.kind = 'transfer'), 0)
       as balance
from public.accounts a;

-- ───────────────────────── Creare familie (apelată doar de server) ─────────────────────────
create or replace function public.bootstrap_family(p_user uuid, p_tg bigint, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  insert into families(name) values ('Familia mea') returning id into fid;
  insert into members(family_id, user_id, telegram_id, name, kind, role, color)
    values (fid, p_user, p_tg, coalesce(nullif(p_name,''),'Eu'), 'adult', 'owner', 1);
  insert into members(family_id, name, kind, role, color) values (fid, 'Copilul', 'child', 'none', 3);

  insert into categories(family_id, kind, name_ro, name_ru, icon, budget, sort) values
    (fid,'expense','Mâncare','Продукты','cart',7000,1),
    (fid,'expense','Mașină','Машина','car',3000,2),
    (fid,'expense','Copilul','Ребёнок','school',2000,3),
    (fid,'expense','Casă','Дом','home',null,4),
    (fid,'expense','Utilități','Коммунальные','bolt',null,5),
    (fid,'expense','Sănătate','Здоровье','heart',null,6),
    (fid,'expense','Haine','Одежда','shirt',null,7),
    (fid,'expense','Distracție','Развлечения','ticket',null,8),
    (fid,'expense','Rate credite','Платежи по кредитам','bank',null,9),
    (fid,'expense','Altele','Другое','tag',null,10),
    (fid,'income','Salariu','Зарплата','wallet',null,1),
    (fid,'income','Bonus','Премия','gift',null,2),
    (fid,'income','Alocație copil','Детское пособие','school',null,3),
    (fid,'income','Dobândă','Проценты','percent',null,4),
    (fid,'income','Altele','Другое','tag',null,5);

  insert into accounts(family_id, name, type, currency, sort) values (fid, 'Portofel', 'cash', 'MDL', 1);
  return fid;
end $$;
revoke all on function public.bootstrap_family(uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.bootstrap_family(uuid, bigint, text) to service_role;

-- Acceptarea unei invitații (apelată doar de server, după verificarea semnăturii Telegram)
create or replace function public.accept_invite(p_code text, p_user uuid, p_tg bigint, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv invites%rowtype;
begin
  select * into inv from invites where code = p_code for update;
  if not found or inv.used_at is not null or inv.expires_at < now() then
    raise exception 'invitație invalidă sau expirată';
  end if;
  if exists (select 1 from members where telegram_id = p_tg or user_id = p_user) then
    raise exception 'acest cont Telegram e deja într-o familie';
  end if;
  insert into members(family_id, user_id, telegram_id, name, kind, role, color)
    values (inv.family_id, p_user, p_tg, coalesce(nullif(inv.member_name,''), p_name), 'adult', 'editor', 2);
  update invites set used_by = p_tg, used_at = now() where code = p_code;
  return inv.family_id;
end $$;
revoke all on function public.accept_invite(text, uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.accept_invite(text, uuid, bigint, text) to service_role;

-- ───────────────────────── Stocare bonuri ─────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 8388608, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do nothing;

create policy receipts_rw on storage.objects for all to authenticated
  using (bucket_id = 'receipts' and public.is_member(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'receipts' and public.is_member(((storage.foldername(name))[1])::uuid));

-- ───────────────────────── Realtime (actualizare live între soți) ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array['accounts','categories','cars','car_events','transactions','loans','loan_payments','members'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when undefined_object then null; when duplicate_object then null;
    end;
  end loop;
end $$;
