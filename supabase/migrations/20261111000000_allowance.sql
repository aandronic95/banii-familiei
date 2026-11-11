-- Bani de buzunar: suma săptămânală care intră singură în pușculiță (obiectivul copilului)
alter table public.goals add column if not exists allowance numeric(12,2) check (allowance is null or allowance >= 0);
alter table public.goals add column if not exists allowance_weekday smallint not null default 6 check (allowance_weekday between 0 and 6); -- 0 = duminică
alter table public.goals add column if not exists allowance_from uuid references public.accounts(id) on delete set null;            -- de pe ce cont pleacă banii
alter table public.goals add column if not exists allowance_last date;

create or replace function public.check_allowance_from() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.allowance_from is not null and not exists (select 1 from accounts where id = new.allowance_from and family_id = new.family_id and type <> 'asset') then
    raise exception 'cont invalid';
  end if;
  return new;
end $$;
create trigger goals_allowance_check before insert or update on public.goals for each row execute function public.check_allowance_from();
