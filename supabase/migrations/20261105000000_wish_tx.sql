-- Dorința cumpărată se poate lega de cheltuiala deja făcută (fără o a doua scădere din cont)
alter table public.wishes add column if not exists tx_id uuid references public.transactions(id) on delete set null;

create or replace function public.check_wish_tx() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tx_id is not null and not exists (select 1 from transactions where id = new.tx_id and family_id = new.family_id) then
    raise exception 'tranzacție invalidă';
  end if;
  return new;
end $$;
create trigger wishes_tx_check before insert or update on public.wishes for each row execute function public.check_wish_tx();
