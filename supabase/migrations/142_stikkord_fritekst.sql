-- Stikkord blir fritekst — pills bort (#685, oppfølging av #683).
--
-- Reidar: «jeg vil ikke ha pills». Stikkord var en liste (text[], migrasjon
-- 138/139) med et fast antall elementer og en fast lengde per element,
-- rendret som chips på /profil og medlemsdetaljsiden. Feltet blir nå ett
-- fritekstfelt, akkurat som matallergier (migrasjon 141) — samme skjema,
-- samme constraint-form, samme frihet til å skrive en hel setning i stedet
-- for å måtte tenke i komma-separerte biter.
--
-- ', '-separatoren under speiler formatet formaterStikkord() alt viste i
-- redigeringsfeltet (lib/stikkord.ts, slettet i samme endring) — en mann
-- som hadde «grillmester, gitarist» stående i feltet får nøyaktig den
-- teksten igjen etter migreringen, ikke en omformatert variant.
--
-- Grensen (200 tegn) speiler STIKKORD_MAKS_LENGDE i lib/konstanter.ts, som
-- byttet betydning i samme endring: fra «maks tegn per stikkord» til «maks
-- tegn i hele feltet» — samme semantikk som MATALLERGIER_MAKS_LENGDE.
--
-- Regissørens forsteg (kjørt mot prod før denne migrasjonen ble skrevet):
-- 18 profiler, lengste sammenslåtte stikkord-streng 26 tegn, 0 over 200 —
-- ingen rad mister data ved denne omgjøringen.
--
-- Utrullingsvinduet er en BEVISST avveining (#685-review), ikke en forglemmelse:
-- kolonnen bytter type in-place, så fra db-migrer.yml er ferdig til Vercel-
-- deployen er ute (noen minutter) leser gammel kode en text-kolonne som om den
-- var text[]. Konsekvensen er en feilside på /profil og
-- /klubbinfo/medlemmer/[id] for de profilene som HAR stikkord (2 av 18 i prod)
-- — ingen skriving, ingen datatap. Alternativet, en additiv utrulling (ny
-- kolonne → dual-write → backfill → bytte → slett), er fire deployer og en
-- periode med to sannheter om samme felt; for en klubb på 18 mann koster det
-- mer enn de minuttene det kjøper.

-- Rekkefølgen under er ikke vilkårlig: defaulten ('{}'::text[]) og den gamle
-- sjekk-constrainten må vekk FØR kolonnetypen kastes om — defaulten kan ikke
-- castes til den nye typen, og constrainten refererer til den gamle.
-- Funksjonen stikkord_gyldig(text[]) er derimot fri så snart constrainten som
-- brukte den er borte, og droppes bevisst NEDERST: da står det tydelig at det
-- er en opprydding etter at typebyttet er i havn, ikke et forsteg det henger
-- på.
--
-- Ingen nye GRANT-er: dette er en kolonne-type-endring på en eksisterende
-- tabell, ikke en ny tabell (jf. migrasjon 141 § samme note).

-- Fail-fast FØR noe endres (#685-review): array_to_string() hopper STILLE over
-- NULL-elementer, og den gamle constrainten slapp ARRAY['foo', null] gjennom
-- fordi bool_and() ignorerer NULL. En slik rad ville altså mistet et element
-- uten spor — stikk i strid med «ingen rad mister data» over. Prod har null
-- slike rader i dag, så dette er en vakt, ikke en forventet sti. Vi filtrerer
-- dem bevisst IKKE bort stille: det ville vært nøyaktig feilklassen denne
-- PR-en jobber mot. Finnes de, stopper migrasjonen og en mann rydder manuelt
-- (array_remove(stikkord, null)) før den kjøres på nytt.
do $$
declare
  antall int;
begin
  select count(*) into antall
  from public.profiles
  where stikkord is not null
    and array_position(stikkord, null::text) is not null;

  if antall > 0 then
    raise exception
      'Migrasjon 142 stoppet: % profil(er) har NULL-element i stikkord. array_to_string() ville kastet elementet stille. Rydd opp (update public.profiles set stikkord = array_remove(stikkord, null) where array_position(stikkord, null::text) is not null) og kjør på nytt.',
      antall;
  end if;
end $$;

alter table public.profiles drop constraint if exists profiles_stikkord_gyldig;
alter table public.profiles alter column stikkord drop default;
alter table public.profiles alter column stikkord drop not null;

alter table public.profiles
  alter column stikkord type text
  using nullif(btrim(array_to_string(stikkord, ', ')), '');

alter table public.profiles
  add constraint profiles_stikkord_gyldig
  check (stikkord is null or char_length(btrim(stikkord)) between 1 and 200);

-- Funksjonen tjente kun den gamle array-constrainten — ingen andre steder
-- refererer til den (verifisert: kun profiles_stikkord_gyldig brukte den).
drop function if exists public.stikkord_gyldig(text[]);
