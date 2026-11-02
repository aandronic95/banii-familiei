-- Partea A: plata dobânzii (cupon), contoare, lista de dorințe, zile de naștere și evenimente, regula 50/30/20

-- 1. Investiții: cât de des se plătește dobânda (eVMS: la 6 luni; licitații: anual; certificate: la scadență)
alter table public.investments add column if not exists coupon_freq text not null default 'maturity'
  check (coupon_freq in ('maturity','monthly','quarterly','semiannual','annual'));

-- 2. Categorii: necesar / dorință (pentru regula 50/30/20); null = după tipul categoriei
alter table public.categories add column if not exists bucket text check (bucket is null or bucket in ('needs','wants'));

-- 3. Contoare și indicii lor
create table public.meters (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 40),
  kind text not null default 'electricity' check (kind in ('electricity','gas','water_cold','water_hot','heat','other')),
  unit text not null default 'kWh' check (length(unit) <= 10),
  tariff numeric(12,4) check (tariff is null or tariff >= 0),
  reminder_day int check (reminder_day is null or reminder_day between 1 and 28),
  sort int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.meter_readings (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  meter_id uuid not null references public.meters(id) on delete cascade,
  date date not null default current_date,
  value numeric(14,3) not null check (value >= 0),
  note text check (note is null or length(note) <= 200),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.meter_readings(meter_id, date);

-- 4. Lista de dorințe
create table public.wishes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 80),
  price numeric(14,2) check (price is null or price >= 0),
  currency text not null default 'MDL' check (currency in ('MDL','EUR','USD')),
  priority int not null default 2 check (priority between 1 and 3),
  link text check (link is null or (length(link) <= 500 and link ~* '^https?://')),
  member_id uuid references public.members(id) on delete set null,     -- pentru cine
  note text check (note is null or length(note) <= 500),
  goal_id uuid references public.goals(id) on delete set null,
  done boolean not null default false,
  done_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- 5. Zile de naștere, aniversări, evenimente
create table public.events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 80),
  kind text not null default 'birthday' check (kind in ('birthday','anniversary','holiday','other')),
  date date not null,                    -- anul contează doar dacă has_year (vârsta / câți ani)
  has_year boolean not null default true,
  yearly boolean not null default true,
  member_id uuid references public.members(id) on delete set null,
  gift_budget numeric(12,2) check (gift_budget is null or gift_budget >= 0),
  remind_days int not null default 7 check (remind_days between 0 and 60),
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['meters','meter_readings','wishes','events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_member(family_id)) with check (public.is_member(family_id))', t || '_rw', t);
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when undefined_object then null; when duplicate_object then null;
    end;
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_trg()', t || '_audit', t);
  end loop;
end $$;

-- Legăturile din aceeași familie
create or replace function public.check_partA_links() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  j jsonb := to_jsonb(new);
  fid uuid := (j->>'family_id')::uuid;
begin
  if (j->>'meter_id') is not null and not exists (select 1 from meters where id = (j->>'meter_id')::uuid and family_id = fid) then
    raise exception 'contor invalid';
  end if;
  if (j->>'member_id') is not null and not exists (select 1 from members where id = (j->>'member_id')::uuid and family_id = fid) then
    raise exception 'persoană invalidă';
  end if;
  if (j->>'goal_id') is not null and not exists (select 1 from goals where id = (j->>'goal_id')::uuid and family_id = fid) then
    raise exception 'obiectiv invalid';
  end if;
  return new;
end $$;
create trigger meter_readings_links before insert or update on public.meter_readings for each row execute function public.check_partA_links();
create trigger wishes_links before insert or update on public.wishes for each row execute function public.check_partA_links();
create trigger events_links before insert or update on public.events for each row execute function public.check_partA_links();
