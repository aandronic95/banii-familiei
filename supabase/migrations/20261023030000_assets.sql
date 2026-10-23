-- Bunuri (mașină, casă, teren…): intră doar în averea netă, nu în banii disponibili.
-- Valoarea = opening_balance la value_date, care scade cu depreciation % pe an (ex. mașina ~12%/an).
alter table public.accounts drop constraint if exists accounts_type_check;
alter table public.accounts add constraint accounts_type_check check (type in ('card','cash','deposit','invest','asset'));
alter table public.accounts
  add column if not exists asset_kind text check (asset_kind is null or asset_kind in ('car','home','land','other')),
  add column if not exists car_id uuid references public.cars(id) on delete set null,
  add column if not exists depreciation numeric(5,2) check (depreciation is null or (depreciation >= 0 and depreciation <= 60)),
  add column if not exists value_date date,
  add column if not exists acquired_date date; -- de când îl aveți (pentru graficul averii nete)

-- Bunurile nu primesc tranzacții (banii nu „ies” din mașină)
create or replace function public.check_tx_not_asset() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from accounts where id in (new.account_id, new.to_account_id) and type = 'asset') then
    raise exception 'pe un bun nu se pot face tranzacții';
  end if;
  return new;
end $$;
drop trigger if exists tx_not_asset on public.transactions;
create trigger tx_not_asset before insert or update on public.transactions for each row execute function public.check_tx_not_asset();

create or replace function public.check_asset_car() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.car_id is not null and not exists (select 1 from cars where id = new.car_id and family_id = new.family_id) then
    raise exception 'mașină invalidă';
  end if;
  return new;
end $$;
drop trigger if exists accounts_car_check on public.accounts;
create trigger accounts_car_check before insert or update on public.accounts for each row execute function public.check_asset_car();
