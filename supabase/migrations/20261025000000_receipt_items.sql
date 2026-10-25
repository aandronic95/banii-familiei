-- Produsele de pe bonul fiscal (citite din pagina mev.sfs.md sau din poză), într-o singură cheltuială
alter table public.transactions add column if not exists items jsonb
  check (items is null or (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 300));
