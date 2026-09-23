-- #521: `poll.vinner_varslet_paa` har historisk dekket TO ulike varsler for
-- en kåringspoll som ender uavgjort: tiebreak-varselet («generalsekretæren
-- må avgjøre») OG selve vinner-varselet som sendes etter at han har avgjort
-- via velgTiebreakVinner(). Doktrinen i CLAUDE.md § Policy: Varsler er «to
-- varsler ⇒ to kolonner» — denne migrasjonen gir tiebreak-varselet sin egen
-- kolonne, slik at en vinner-varsel-feil ETTER en tiebreak-avgjørelse
-- fortsatt fanges av retry-spørringen. Før dette: retry-spørringen filtrerte
-- pollen bort fordi vinner_varslet_paa alt var satt av tiebreak-steget, og
-- en feilet vinner-varsling var permanent tapt.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'poll'
      and column_name = 'tiebreak_varslet_paa'
  ) then
    alter table public.poll
      add column tiebreak_varslet_paa timestamptz;

    -- Ufravikelig backfill i SAMME blokk — uten den ser første cron-kjøring
    -- hver historisk tiebreak-poll som «tiebreak-varsel ikke sendt» og purrer
    -- generalsekretæren på nytt om avgjørelser som alt er tatt.
    --
    -- Skiller de to historiske betydningene av vinner_varslet_paa i stedet
    -- for å bare kopiere den til begge kolonner (#521-kravet): en poll som
    -- ENNÅ venter på tiebreak (tiebreak_status = 'venter_paa_tiebreak') og
    -- har vinner_varslet_paa satt, fikk stempelet fra TIEBREAK-varselet —
    -- vinneren er per definisjon ikke avgjort ennå, så vinner-varselet KAN
    -- ikke ha gått ut. Flytt stempelet til riktig kolonne og nullstill
    -- vinner_varslet_paa, slik at en fremtidig tiebreak-avgjørelse faktisk
    -- får sendt (og stemplet) det ekte vinner-varselet.
    update public.poll
       set tiebreak_varslet_paa = vinner_varslet_paa,
           vinner_varslet_paa   = null
     where tiebreak_status = 'venter_paa_tiebreak'
       and vinner_varslet_paa is not null;

    -- Poller som er 'avgjort' (entydig vinner ELLER tiebreak løst) eller
    -- ingen_stemmer (tiebreak_status null) beholder vinner_varslet_paa
    -- uendret — stempelet der representerer korrekt det terminale
    -- utfallsvarselet. tiebreak_varslet_paa forblir null for disse: vi har
    -- ingen pålitelig måte å rekonstruere om et tiebreak-varsel gikk ut
    -- FØR avgjørelsen, og det spiller ingen rolle lenger — pollen er alt
    -- avgjort, og fremtidig stempling skjer aldri på tiebreak_status =
    -- 'avgjort' (se stempleKaaringspollVarslet i lib/varsler-kaaringspoll.ts).
  end if;
end $$;

-- Ny kolonne på en eksisterende tabell arver poll sine grants — ingen nye
-- GRANT-statements trengs (jf. CLAUDE.md § Policy: Migrasjoner, som gjelder
-- nye tabeller/funksjoner/sekvenser).
