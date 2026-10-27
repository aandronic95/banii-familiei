-- Sarcini: treburi ale familiei, sarcini cu bani (devin cheltuială), pași, comentarii, repetare
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 120),
  note text check (note is null or length(note) <= 2000),
  kind text not null default 'task' check (kind in ('task','money')),
  assignee_id uuid references public.members(id) on delete set null,     -- null = oricine
  created_by uuid default auth.uid(),
  due_date date,
  due_time time,                                                          -- ora mementoului (Chișinău)
  repeat text not null default 'none' check (repeat in ('none','daily','weekly','monthly')),
  repeat_every int not null default 1 check (repeat_every between 1 and 12),
  amount numeric(14,2) check (amount is null or amount >= 0),
  category_id uuid references public.categories(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,
  steps jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) <= 50),
  done boolean not null default false,
  done_at timestamptz,
  done_by uuid references public.members(id) on delete set null,
  tx_id uuid references public.transactions(id) on delete set null,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index tasks_family_open on public.tasks(family_id, done, due_date);

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  member_id uuid references public.members(id) on delete set null,
  body text not null check (length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index on public.task_comments(task_id);

-- Lista de cumpărături comună
create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  qty text check (qty is null or length(qty) <= 20),
  price numeric(12,2) check (price is null or price >= 0),
  done boolean not null default false,
  done_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.shopping_items(family_id, done);

do $$
declare t text;
begin
  foreach t in array array['tasks','task_comments','shopping_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_member(family_id)) with check (public.is_member(family_id))', t || '_rw', t);
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when undefined_object then null; when duplicate_object then null;
    end;
  end loop;
end $$;

-- Legăturile (persoană, categorie, cont, cheltuială, sarcină) trebuie să fie din aceeași familie
create trigger tasks_family_check before insert or update on public.tasks for each row execute function public.check_links_family();
create or replace function public.check_task_links() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  j jsonb := to_jsonb(new);
  fid uuid := (j->>'family_id')::uuid;
begin
  -- câmpurile se citesc din jsonb, ca aceeași funcție să meargă pe ambele tabele
  if (j->>'assignee_id') is not null and not exists (select 1 from members where id = (j->>'assignee_id')::uuid and family_id = fid) then
    raise exception 'persoană invalidă';
  end if;
  if (j->>'done_by') is not null and not exists (select 1 from members where id = (j->>'done_by')::uuid and family_id = fid) then
    raise exception 'persoană invalidă';
  end if;
  if (j->>'tx_id') is not null and not exists (select 1 from transactions where id = (j->>'tx_id')::uuid and family_id = fid) then
    raise exception 'tranzacție invalidă';
  end if;
  if (j->>'task_id') is not null and not exists (select 1 from tasks where id = (j->>'task_id')::uuid and family_id = fid) then
    raise exception 'sarcină invalidă';
  end if;
  return new;
end $$;
create trigger tasks_links_check before insert or update on public.tasks for each row execute function public.check_task_links();
create trigger task_comments_links_check before insert or update on public.task_comments for each row execute function public.check_task_links();
create trigger task_comments_family_check before insert or update on public.task_comments for each row execute function public.check_links_family();

-- Istoric (cine a adăugat / bifat / șters)
create trigger tasks_audit after insert or update or delete on public.tasks for each row execute function public.audit_trg();

-- Notificarea „Sarcini” pornită implicit
alter table public.members alter column notify set default '{"loans":true,"budget":true,"weekly":true,"car":true,"invest":true,"recurring":true,"debts":true,"monthly":true,"backup":false,"tasks":true}'::jsonb;
