-- Investiții: contul pe care vin dobânzile / ratele și până la ce dată au fost adăugate
alter table public.investments add column if not exists payout_account_id uuid references public.accounts(id) on delete set null;
alter table public.investments add column if not exists payout_mode text not null default 'confirm' check (payout_mode in ('confirm','auto'));
alter table public.investments add column if not exists paid_through date;

create or replace function public.check_payout_account() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.payout_account_id is not null and not exists (select 1 from accounts where id = new.payout_account_id and family_id = new.family_id and type <> 'asset') then
    raise exception 'cont invalid';
  end if;
  return new;
end $$;
create trigger investments_payout_check before insert or update on public.investments for each row execute function public.check_payout_account();
