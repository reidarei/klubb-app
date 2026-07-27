-- #496 — dedup-hullet for anonyme feil_logg-rader.
--
-- feil_logg_profil_event_minutt_uq (fra 102_feil_logg_supplement.sql) er en
-- PARTIAL unique-indeks: «where profil_id is not null». Den beskyttet
-- opprinnelig kun klient-feil fra innloggede brukere (rad kommer alltid
-- med profil_id fra sesjonen).
--
-- Nå som logg.feil() (server-siden) også skriver til feil_logg, dukker det
-- opp rader med profil_id = null: cron-jobber, webhooks og andre uten en
-- innlogget bruker i konteksten. Disse traff aldri partial-indeksen, så en
-- storm i f.eks. cron.paaminne.feilet ville skrevet ubegrenset mange rader
-- inn i en tabell med 30 dagers retensjon (LOGG_FEIL_RETENSJONSDAGER).
--
-- Løsning: erstatt partial-indeksen med én som dekker profil_id IS NULL òg,
-- ved å coalesce til en fast nil-uuid for de radene. Ingen partial-predikat
-- lenger — dedup gjelder nå for absolutt alle rader, uansett kilde.
drop index if exists feil_logg_profil_event_minutt_uq;

create unique index feil_logg_profil_event_minutt_uq
  on public.feil_logg (
    coalesce(profil_id, '00000000-0000-0000-0000-000000000000'::uuid),
    event,
    feil_logg_bucket(opprettet)
  );

-- Kun en indeks på en eksisterende tabell — ingen nye kolonner, ingen nye
-- grants (jf. CLAUDE.md § Policy: Migrasjoner, grants gjelder tabeller/
-- funksjoner/sekvenser, ikke indekser).
