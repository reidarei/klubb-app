-- Fase 1 av refactor #76: forbereder at mal blir kilde til sannhet for
-- arrangement-type. Legger til mal_navn-kolonne på arrangementer og splitter
-- "Annet"-malen i "Annet møte" og "Annet tur" slik at type alltid er implisitt
-- i malnavnet.
--
-- Dette er bakoverkompatibelt: arrangementer.type beholdes som kilde. Ingen
-- eksisterende kode berøres. Fase 5 fjerner type-kolonnen og CHECK-constraint.

-- 1. Unique constraint på navn (forutsetning for FK fra arrangementer.mal_navn)
alter table arrangementmaler add constraint arrangementmaler_navn_unique unique (navn);

-- 2. Legg til Annet møte + Annet tur
insert into arrangementmaler (navn, "rekkefølge", type, purredato) values
  ('Annet møte', 98, 'moete', null),
  ('Annet tur',  99, 'tur',   null);

-- 3. Kolonne på arrangementer (nullable inntil fase 5)
alter table arrangementer
  add column mal_navn text references arrangementmaler(navn) on update cascade;

-- 4. Backfill fra arrangoransvar-kobling
update arrangementer a
set mal_navn = ar.arrangement_navn
from arrangoransvar ar
where ar.arrangement_id = a.id
  and a.mal_navn is null;

-- 5. Resten: "Annet møte" / "Annet tur" basert på gammel type
update arrangementer
set mal_navn = case type
  when 'tur'   then 'Annet tur'
  when 'moete' then 'Annet møte'
end
where mal_navn is null;

-- 6. Indeks for raske lookups (arrangementer joiner mot mal_navn)
create index arrangementer_mal_navn_idx on arrangementer(mal_navn);

-- Verifisering (kjøres manuelt etter migrasjon):
--   select count(*) from arrangementer where mal_navn is null;  -- skal være 0
--   select mal_navn, count(*) from arrangementer group by mal_navn order by 1;
