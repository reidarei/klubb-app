-- Dropp gammel varsler_logg (arrangementsdedup) først
drop table if exists varsler_logg;

-- Rename personlige_varsler → varsel_logg
alter table personlige_varsler rename to varsel_logg;

-- Nye kolonner
alter table varsel_logg
  add column type text,
  add column kanal text,
  add column url text,
  add column arrangement_id uuid references arrangementer(id) on delete set null;

-- Indeks for dedup-sjekk (type + arrangement_id)
create index idx_varsel_logg_dedup on varsel_logg (type, arrangement_id)
  where arrangement_id is not null;

-- Admin kan lese alle varsler
create policy "Admin leser alle varsler"
  on varsel_logg for select
  using (exists (
    select 1 from profiles where id = auth.uid() and rolle = 'admin'
  ));
