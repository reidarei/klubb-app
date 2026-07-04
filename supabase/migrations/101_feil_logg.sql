-- Klient-feillogg: samler render-feil, uncaught exceptions og promise-rejections
-- fra PWA-klienten. Skrives via /api/logg-feil med service_role (admin-klient).
-- Se #366 for bakgrunn.

create table public.feil_logg (
  id          bigserial primary key,
  opprettet   timestamptz not null default now(),
  event       text        not null,           -- dot-separert navn, f.eks. «klient.render.feilet»
  nivaa       text        not null check (nivaa in ('warn', 'error', 'fatal')),
  kontekst    jsonb,                          -- scrubbet metadata (ingen PII)
  profil_id   uuid references public.profiles(id) on delete set null,
  url         text,                          -- pathname ved feiltidspunktet (query/hash sanitert bort i /api/logg-feil)
  user_agent  text                           -- UA-streng for enhets-debugging
);

alter table public.feil_logg enable row level security;

-- Data API-tilgang (kreves fra 2026-10-30 på alle Supabase-prosjekter).
-- anon trenger ingen tilgang — logg skrives alltid via service_role.
grant select, insert, update, delete on public.feil_logg to service_role;
-- Admin-panel leser via authenticated + RLS (er_admin()). Uten eksplisitt
-- GRANT SELECT returnerer PostgREST 42501 selv om RLS-policyen tillater raden.
grant select on public.feil_logg to authenticated;
-- Sekvens-grant slik at service_role kan reservere neste id via PostgREST.
grant usage, select on sequence public.feil_logg_id_seq to service_role;

-- Admin-er kan lese loggen via admin-panelet.
create policy "Admin kan lese feil_logg"
  on public.feil_logg
  for select
  to authenticated
  using (er_admin());

-- ─── Indekser ────────────────────────────────────────────────────────────────

-- Primærindeks for tidsbaserte spørringer (siste N rader, rader eldre enn X).
create index on public.feil_logg (opprettet desc);

-- Sekundærindeks for event-type + tids-filtrering (alarm-cron bruker begge).
create index on public.feil_logg (event, opprettet desc);

-- Burst-dedup: forhindrer at én klient-storm duplikater en rad mange ganger
-- innen samme minutt (per innlogget profil). date_trunc er «stable», ikke
-- «immutable», og kan ikke brukes direkte i partial unique index. Løsning:
-- immutable wrapper-funksjon som kaller to_char() på UTC-projeksjon.
-- Merk: to_char(timestamptz, ...) uten AT TIME ZONE bruker serverens TimeZone
-- og er dermed IKKE reelt immutable — endres TimeZone-innstillingen kan
-- indeksen bli inkonsistent. Vi tvinger UTC for deterministisk resultat.
-- Se #366 for diskusjon om date_trunc vs. to_char.
create or replace function feil_logg_bucket(ts timestamptz)
  returns text
  language sql
  immutable
  security definer
  set search_path = ''
  as $$
    select to_char($1 at time zone 'UTC', 'YYYY-MM-DD HH24:MI')
  $$;

-- Unik per (profil, event, minutt-bucket) — kun for innloggede brukere.
-- Anon-feil (profil_id is null) dedupes ikke via DB — rate-limit i route.ts.
create unique index feil_logg_profil_event_minutt_uq
  on public.feil_logg (profil_id, event, feil_logg_bucket(opprettet))
  where profil_id is not null;
