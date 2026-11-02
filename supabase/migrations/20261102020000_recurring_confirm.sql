-- Plăți regulate: confirmare înainte de adăugare și mutarea de pe zilele nelucrătoare
alter table public.recurring add column if not exists confirm boolean not null default true;
alter table public.recurring add column if not exists workday text not null default 'none' check (workday in ('none','before','after'));
-- veniturile (salariul) vin de obicei în ziua lucrătoare dinainte
update public.recurring set workday = 'before' where kind = 'income';
