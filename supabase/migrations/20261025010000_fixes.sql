-- 1. Soldul pe server: banii care intră din investiții / datorii întoarse („divest”) se adună, ca în aplicație
create or replace view public.account_balances with (security_invoker = true) as
select a.id as account_id,
       a.opening_balance
       + coalesce((select sum(case when t.kind in ('income','divest') then t.amount else -t.amount end)
                   from public.transactions t where t.account_id = a.id), 0)
       + coalesce((select sum(coalesce(t.to_amount, t.amount))
                   from public.transactions t where t.to_account_id = a.id and t.kind = 'transfer'), 0)
       as balance
from public.accounts a;

-- 2. Setările personale (notificări, preferințe, limba) le schimbă doar persoana însăși
create or replace function public.protect_member_fields() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated','anon') then
    if new.role is distinct from old.role or new.user_id is distinct from old.user_id
       or new.telegram_id is distinct from old.telegram_id or new.family_id is distinct from old.family_id then
      raise exception 'nu se poate modifica accesul de aici';
    end if;
    if old.user_id is not null and old.user_id is distinct from auth.uid()
       and (new.notify is distinct from old.notify or new.prefs is distinct from old.prefs or new.lang is distinct from old.lang) then
      raise exception 'setările personale le schimbă doar persoana însăși';
    end if;
  end if;
  return new;
end $$;
