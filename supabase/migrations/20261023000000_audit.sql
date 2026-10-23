-- Istoricul modificărilor: cine a adăugat / schimbat / șters și când.
-- Se scrie doar din trigger (security definer); clienții pot doar citi istoricul familiei lor.
create table public.audit_log (
  id bigserial primary key,
  family_id uuid not null references public.families(id) on delete cascade,
  tbl text not null,
  row_id uuid not null,
  action text not null check (action in ('insert','update','delete')),
  member_id uuid references public.members(id) on delete set null,
  old_row jsonb,
  new_row jsonb,
  at timestamptz not null default now()
);
create index audit_log_family_at on public.audit_log(family_id, at desc);
create index audit_log_row on public.audit_log(row_id);

alter table public.audit_log enable row level security;
create policy audit_read on public.audit_log for select to authenticated using (public.is_member(family_id));
revoke insert, update, delete, truncate on public.audit_log from anon, authenticated;
revoke all on sequence public.audit_log_id_seq from anon, authenticated;

create or replace function public.audit_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  n jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  fid uuid := coalesce(n->>'family_id', o->>'family_id')::uuid;
  uid uuid := coalesce(auth.uid(), nullif(coalesce(n->>'created_by', o->>'created_by'), '')::uuid);
  mid uuid;
begin
  if tg_op = 'UPDATE' and o = n then return null; end if;
  if uid is not null then
    select id into mid from members where user_id = uid and family_id = fid limit 1;
  end if;
  insert into audit_log(family_id, tbl, row_id, action, member_id, old_row, new_row)
  values (fid, tg_table_name, coalesce(n->>'id', o->>'id')::uuid, lower(tg_op), mid, o, n);
  return null;
exception when others then
  return null; -- istoricul nu are voie să blocheze salvarea
end $$;
revoke execute on function public.audit_trg() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['transactions','accounts','categories','loans','investments','debts','goals','recurring','cars','car_events'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_trg()', t || '_audit', t);
  end loop;
end $$;
