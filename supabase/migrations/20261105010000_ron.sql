-- Leul românesc (RON) ca a patra monedă: în conturi, investiții, datorii, obiective, dorințe, călătorii, credite și cursuri
do $$
declare t text; c record;
begin
  foreach t in array array['accounts','loans','investments','debts','goals','wishes','trips','rates'] loop
    for c in select conname from pg_constraint where conrelid = ('public.' || t)::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%currency%' loop
      execute format('alter table public.%I drop constraint %I', t, c.conname);
    end loop;
    if t = 'rates' then
      execute 'alter table public.rates add constraint rates_currency_check check (currency in (''EUR'',''USD'',''RON''))';
    else
      execute format('alter table public.%I add constraint %I check (currency in (''MDL'',''EUR'',''USD'',''RON''))', t, t || '_currency_check');
    end if;
  end loop;
end $$;
