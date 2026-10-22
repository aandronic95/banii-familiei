-- Investiții: titluri de stat (eVMS), P2P (Fagura), acțiuni/ETF, altele.
-- Banii mutați într-o investiție nu sunt cheltuieli: tranzacții noi de tip
-- 'invest' (ies din cont) și 'divest' (suma investită revine în cont).

-- Cont de tip „investiții” (soldul liber pe platformă, ex. balanța Fagura)
alter table public.accounts drop constraint if exists accounts_type_check;
alter table public.accounts add constraint accounts_type_check check (type in ('card','cash','deposit','invest'));

create table public.investments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  kind text not null check (kind in ('gov_bond','tbill','p2p','stocks','other')),
  platform text,                         -- eVMS, Fagura, Revolut…
  name text not null,
  code text,                             -- ISIN sau ID împrumut
  currency text not null default 'MDL' check (currency in ('MDL','EUR','USD')),
  amount numeric(14,2) not null check (amount > 0),   -- suma investită
  units numeric(14,4),                   -- nr. de titluri
  rate numeric(7,3),                     -- dobândă / cupon, % pe an
  start_date date not null default current_date,
  maturity_date date,
  current_value numeric(14,2),           -- valoarea actuală, dacă o știi (ex. rest de încasat la P2P)
  value_date date,
  status text not null default 'active' check (status in ('active','late','closed')),
  member_id uuid references public.members(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null, -- de unde s-a plătit / unde revin banii
  note text,
  created_at timestamptz not null default now()
);
create index on public.investments(family_id);

alter table public.investments enable row level security;
create policy investments_rw on public.investments for all to authenticated
  using (public.is_member(family_id)) with check (public.is_member(family_id));

create or replace function public.check_investment_family() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.member_id is not null and not exists (select 1 from members where id = new.member_id and family_id = new.family_id) then
    raise exception 'persoană invalidă';
  end if;
  if new.account_id is not null and not exists (select 1 from accounts where id = new.account_id and family_id = new.family_id) then
    raise exception 'cont invalid';
  end if;
  return new;
end $$;
create trigger investments_family_check before insert or update on public.investments
  for each row execute function public.check_investment_family();

-- Tranzacțiile legate de investiții
alter table public.transactions drop constraint if exists transactions_kind_check;
alter table public.transactions add constraint transactions_kind_check
  check (kind in ('expense','income','transfer','invest','divest'));
alter table public.transactions add column investment_id uuid references public.investments(id) on delete set null;
create index on public.transactions(investment_id);

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
  if new.investment_id is not null and not exists (select 1 from investments where id = new.investment_id and family_id = new.family_id) then
    raise exception 'investiție invalidă';
  end if;
  return new;
end $$;

-- Soldurile: 'divest' aduce bani în cont, 'invest' scoate
create or replace view public.account_balances with (security_invoker = true) as
select a.id as account_id,
       a.opening_balance
       + coalesce((select sum(case when t.kind in ('income','divest') then t.amount else -t.amount end)
                   from public.transactions t where t.account_id = a.id), 0)
       + coalesce((select sum(coalesce(t.to_amount, t.amount))
                   from public.transactions t where t.to_account_id = a.id and t.kind = 'transfer'), 0)
       as balance
from public.accounts a;

do $$
begin
  alter publication supabase_realtime add table public.investments;
exception when undefined_object then null; when duplicate_object then null;
end $$;
