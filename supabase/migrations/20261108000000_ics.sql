-- Calendarul plăților în telefon (Google Calendar / iPhone): link secret per familie
alter table public.families add column if not exists ics_token text unique;

-- Creează sau schimbă linkul (cel vechi nu mai merge). Doar membrii familiei.
create or replace function public.ics_token(reset boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare fid uuid; tok text;
begin
  select family_id into fid from members where user_id = auth.uid() and role in ('owner','editor') limit 1;
  if fid is null then raise exception 'fără acces'; end if;
  select ics_token into tok from families where id = fid;
  if tok is null or reset then
    tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    update families set ics_token = tok where id = fid;
  end if;
  return tok;
end $$;
revoke all on function public.ics_token(boolean) from public, anon;
grant execute on function public.ics_token(boolean) to authenticated;
