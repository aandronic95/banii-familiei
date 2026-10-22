-- Codul de rezervă pentru blocare (când Face ID nu merge).
-- Doar serverul citește tabelul: aplicația nu are nicio politică RLS aici, deci nu vede nici amprenta codului.
create table public.member_pins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pin_hash text not null,
  salt text not null,
  failed int not null default 0,
  locked_until timestamptz,
  reset_hash text,
  reset_expires timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.member_pins enable row level security;
revoke all on public.member_pins from anon, authenticated;
