-- Timeplan for turen (#716).
--
-- En knapp i kartets knapperad («Timeplan · 17:00») åpner et tredje sidepanel
-- der alle medlemmer kan legge inn én linje — «17:00 Middag på Lorry» — som
-- appen selv leser klokkeslettet ut av (lib/timeplan-parse.ts). Valgfritt kan
-- posten ha et punkt på kartet. Den som la inn noe kan fjerne det igjen; det
-- finnes ingen redigering.
--
-- Alternativ A fra planleggingen: bundet til ETT arrangement, ingen `utloper`,
-- ingen cron. En timeplan-post er scopet av hvilken tur/hvilket møte panelet
-- viser, og er dermed usynlig av seg selv når arrangementet ikke lenger er
-- aktuelt — cascade er hele livsløpet. Til forskjell fra kart_markering
-- (migrasjon 145), som er en eierløs etikett tegnet ubetinget og derfor
-- TRENGER en TTL, er timeplanen alltid lest gjennom arrangementet den hører
-- til.
create table public.timeplan_post (
  id             uuid primary key default gen_random_uuid(),
  arrangement_id uuid not null references public.arrangementer(id) on delete cascade,
  opprettet_av   uuid not null references public.profiles(id) on delete cascade,
  tidspunkt      timestamptz not null,
  tekst          text not null,
  -- Nålen er valgfri. På et arrangement med sensurert destinasjon (blåtur)
  -- nekter actionen å lagre lat/lng (samme presedens som geokodingen i
  -- lib/actions/arrangementer.ts:70–79) — teksten går fint, ikke RLS-styrt.
  lat            double precision,
  lng            double precision,
  opprettet      timestamptz not null default now(),
  -- Speiler TIMEPLAN_TEKST_MAKS_LENGDE i lib/konstanter.ts — endres den ene,
  -- må den andre følge etter. 120, ikke 60 som kart_markering: en timeplanlinje
  -- («Avgang fra Grønland, husk pass») har ikke samme plassbegrensning som en
  -- etikett ved siden av en nål.
  constraint timeplan_post_tekst_gyldig check (length(btrim(tekst)) between 1 and 120),
  constraint timeplan_post_lat_gyldig   check (lat is null or lat between -90 and 90),
  constraint timeplan_post_lng_gyldig   check (lng is null or lng between -180 and 180),
  -- Nålen er valgfri, men en HALV nål er ikke en tilstand.
  constraint timeplan_post_naal_hel     check ((lat is null) = (lng is null))
);

-- Driver den eneste lesespørringen (poster for ett arrangement, sortert på
-- tidspunkt). Stabil sekundærsortering (tidspunkt, opprettet, id) er et
-- korrekthetskrav løst i spørringen, ikke i indeksen.
create index timeplan_post_arrangement_tid_idx
  on public.timeplan_post (arrangement_id, tidspunkt);

alter table public.timeplan_post enable row level security;

-- Data API-tilgang (kreves fra 2026-10-30, jf. Policy: Migrasjoner). Ingen anon.
--
-- REVOKE MÅ KOMME FØR GRANTS, og MÅ stå selv om vi ikke grant'er update.
-- Migrasjon 108 skrudde av default privileges kun for `anon` — `authenticated`
-- arver fortsatt GRANT ALL på en ny tabell ved opprettelse. Å bare UNNLATE en
-- `grant update` sperrer ingenting i seg selv; uten denne revoke-linja kunne
-- et medlem oppdatert tekst og tidspunkt på egen (eller andres) post via det
-- arvede privilegiet, og issuet sier uttrykkelig ingen redigering.
revoke all on public.timeplan_post from authenticated;

grant select, insert, delete on public.timeplan_post to authenticated;
grant select, insert, update, delete on public.timeplan_post to service_role;

-- select using (true) er en FORUTSETNING for slette-kvitteringen: samme idiom
-- som kart_markering (migrasjon 145) og markering-mønsteret generelt —
-- .delete().select('id') leser 0 rader tilbake som «blokkert eller allerede
-- borte». Strammer noen inn select senere, ryker kvitteringen stille.
create policy "Timeplanen er synlig for alle medlemmer"
  on public.timeplan_post for select using (true);

create policy "Egen post kan legges inn"
  on public.timeplan_post for insert with check (opprettet_av = auth.uid());

-- Ingen update-policy. Issuet utelukker redigering — en post fjernes og
-- skrives eventuelt på nytt, den rettes ikke (samme mønster som
-- kart_markering).
create policy "Egen post eller admin kan slette"
  on public.timeplan_post for delete
  using (opprettet_av = auth.uid() or er_admin());
