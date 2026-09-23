-- Kåringspoll (#87): bygger oppå generisk poll-tabell (#86) for å la
-- generalsekretæren kjøre årlige kåringer som anonym avstemming. Vi
-- legger meta-kolonner på poll/poll_valg framfor å lage egne tabeller,
-- slik at chat, realtime og stemming-RLS gjenbrukes.
--
-- Kandidat-kilden velges per mal: enten alle aktive medlemmer
-- (klassiske «Årets X»), eller årets møter (for kåringer som «Årets
-- møte»). Backfill nedenfor antar dagens to navn — om nye maler kommer
-- til må admin sette `kandidat_kilde` manuelt.
--
-- NB: kolonnen i `kaaring_vinnere` heter `mal_id` (fra migr. 023).
-- Vi beholder navnet og refererer til det fra ny `poll_id`-kolonnen
-- — rename ville krevd endring i `lib/actions/kaaring_vinnere.ts` og
-- `app/(app)/kaaringer/page.tsx`, og hadde ingen praktisk gevinst.

-- === kaaringmaler: hvor kommer kandidatene fra? ===========================

alter table kaaringmaler
  add column kandidat_kilde text not null default 'profil'
    check (kandidat_kilde in ('profil', 'arrangement_moete'));

-- Backfill: «Årets møte» trekker kandidater fra årets møte-arrangementer.
-- Andre kåringer beholder default 'profil'.
update kaaringmaler
   set kandidat_kilde = 'arrangement_moete'
 where lower(navn) like '%årets møte%';

-- === poll: kåring-spesifikke felter =======================================

alter table poll
  add column kaaring_mal_id   uuid references kaaringmaler(id) on delete restrict,
  add column aar              integer,
  add column avsluttet_paa    timestamptz,
  add column tiebreak_status  text check (tiebreak_status in ('venter_paa_tiebreak', 'avgjort')),
  add column arrangement_id   uuid references arrangementer(id) on delete set null;

-- Én aktiv kåringspoll per mal+år. Partial index slik at vanlige polls
-- (kaaring_mal_id is null) ikke blir berørt.
create unique index poll_kaaring_unik
  on poll (kaaring_mal_id, aar)
  where kaaring_mal_id is not null;

-- Lookup for cron som finner åpne kåringspoller med utløpt frist.
create index poll_kaaring_aapne
  on poll (svarfrist)
  where avsluttet_paa is null and kaaring_mal_id is not null;

-- === poll_valg: kandidat-referanser =======================================
-- Vi denormaliserer kandidaten inn på selve valget heller enn å lage en
-- egen kandidat-tabell. Tekst-kolonnen brukes fortsatt til vist navn.

alter table poll_valg
  add column referanse_profil_id       uuid references profiles(id) on delete cascade,
  add column referanse_arrangement_id  uuid references arrangementer(id) on delete cascade,
  add column opprettet                 timestamptz not null default now();

-- XOR: et kåringsvalg kan referere én kandidat-type, men ikke begge.
-- Vanlige polls bruker ingen av referansene (begge null) — det er OK.
alter table poll_valg
  add constraint poll_valg_referanse_xor
  check (referanse_profil_id is null or referanse_arrangement_id is null);

-- === kaaring_vinnere: hvilken poll avgjorde kåringen? =====================
-- on delete set null fordi vi ikke vil miste historiske vinnere selv om
-- pollen slettes. Manuelt satte vinnere har poll_id = null.

alter table kaaring_vinnere
  add column poll_id uuid references poll(id) on delete set null;

-- === varsel_logg: dedup på poll_id ========================================
-- Eksisterende dedup går på (type, arrangement_id). Kåringsvarsler
-- kobles til pollen, ikke arrangementet, så vi trenger egen kolonne +
-- partial index.

alter table varsel_logg
  add column poll_id uuid references poll(id) on delete set null;

create index idx_varsel_logg_poll_dedup
  on varsel_logg (type, poll_id)
  where poll_id is not null;
