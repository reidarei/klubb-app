-- Stram inn stikkord-valideringen (#639, Copilot-funn på PR #647).
--
-- Migrasjon 138 sjekket kun `char_length(x) between 1 and 30`. Det slipper
-- gjennom et stikkord som består av bare mellomrom (`char_length(' ') = 1`),
-- og et med ledende/etterfølgende mellomrom. Fra vår egen UI kan det ikke
-- skje — normaliserStikkord() trimmer — men rad-RLS lar et medlem skrive
-- kolonnen direkte via Data API-et, og da er DB-en eneste vakt. Poenget med
-- constrainten er at grensen skal være DB-sannhet, ikke app-høflighet.
--
-- `x = btrim(x)` dekker begge tilfellene: bare-mellomrom trimmes til tom
-- streng og er da ulik seg selv, og ' foo' er ulik 'foo'. Det speiler
-- nøyaktig hva normaliserStikkord() produserer, så ingen lovlig verdi fra
-- appen avvises.
--
-- Merk (samme forbehold som i 138): create or replace re-validerer IKKE
-- eksisterende rader. Det er trygt her fordi kolonnen ble innført i 138 og
-- ingen produksjonsrad har rukket å få en utrimmet verdi — den eneste veien
-- inn så langt har gått gjennom normaliserStikkord().

create or replace function public.stikkord_gyldig(s text[])
returns boolean
language sql
immutable
parallel safe
set search_path = public
as $$
  select cardinality(s) <= 10
     and coalesce(
           (select bool_and(x = btrim(x) and char_length(x) between 1 and 30)
              from unnest(s) x),
           true);  -- tom array: bool_and over 0 rader gir NULL, og tomt er lovlig
$$;
