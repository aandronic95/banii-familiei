-- Apple Pay → cheltuieli automate prin Scurtături (iOS)
-- Fiecare telefon are o cheie secretă proprie; în bază se păstrează doar amprenta ei (SHA-256).

create table public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'iPhone',
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index on public.device_tokens(family_id);

alter table public.device_tokens enable row level security;
create policy dev_select on public.device_tokens for select to authenticated
  using (public.is_member(family_id));
-- Fiecare își creează cheia doar pentru el însuși
create policy dev_insert on public.device_tokens for insert to authenticated
  with check (
    public.is_member(family_id) and user_id = auth.uid()
    and exists (select 1 from public.members m where m.id = member_id and m.user_id = auth.uid() and m.family_id = device_tokens.family_id)
  );
-- Își poate anula cheia proprietarul cheii sau proprietarul familiei
create policy dev_delete on public.device_tokens for delete to authenticated
  using (user_id = auth.uid() or public.is_owner(family_id));

-- Numele cardului cum apare în Apple Wallet (ca plata să ajungă la contul potrivit)
alter table public.accounts add column if not exists wallet_alias text;
