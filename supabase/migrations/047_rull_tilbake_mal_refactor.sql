-- Rulle tilbake mal-refactor til tilstand før migrasjon 044.
--
-- Migrasjonene 044-046 ble kjørt mot prod som del av en refactor som ble
-- avbrutt. Koden er revertet til V2.067. Denne migrasjonen bringer DB-state
-- i synk med kode-state.
--
-- Operasjoner:
--   1. Flytt arrangementer fra Bonus-maler tilbake til ingen kobling
--   2. Slett Bonus-malene
--   3. Gjenopprett Annet-malen (type=null, slik den var opprinnelig)
--   4. Dropp mal_navn-kolonnen, indeks og FK
--   5. Dropp unique-constraint på arrangementmaler.navn

-- 1. Flytt Bonus-arrangementer tilbake (de hadde ingen ansvars-kobling før)
update arrangementer
set mal_navn = null
where mal_navn in ('Bonusmøte', 'Bonustur');

-- 2. Slett Bonus-malene
delete from arrangementmaler where navn in ('Bonusmøte', 'Bonustur');

-- 3. Gjenopprett Annet-malen
insert into arrangementmaler (navn, "rekkefølge", type, purredato)
values ('Annet', 8, null, null)
on conflict (navn) do nothing;

-- 4. Dropp kolonne + indeks (FK droppes automatisk med kolonnen)
drop index if exists arrangementer_mal_navn_idx;
alter table arrangementer drop column if exists mal_navn;

-- 5. Dropp unique constraint på navn (tilbake til pre-044 tilstand)
alter table arrangementmaler drop constraint if exists arrangementmaler_navn_unique;
