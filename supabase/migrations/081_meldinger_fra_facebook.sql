-- FB-import for meldinger (#?). Tre endringer:
--   1. Ny tabell melding_bilder for tilleggsbilder utover meldinger.bilde_url.
--      For poster med ett bilde brukes fortsatt bilde_url (cover). For poster
--      med flere bilder ligger 2. og videre i melding_bilder.
--   2. fra_facebook + kilde_ekstern_id på meldinger og melding_chat for
--      idempotent re-import + frys-policy (samme mønster som 062, 066, 067).
--   3. meldinger.innhold blir nullable så meldinger kan ha bare bilde uten tekst
--      (bilde-uten-tekst-flyt — ble forespurt av brukeren generelt, ikke bare
--      for FB-import).

-- === 1. melding_bilder ==========================================
create table public.melding_bilder (
  id          uuid primary key default gen_random_uuid(),
  melding_id  uuid not null references meldinger(id) on delete cascade,
  bilde_url   text not null,
  rekkefoelge int  not null default 0,
  opprettet   timestamptz not null default now()
);

create index melding_bilder_melding_id_rekkefoelge_idx
  on melding_bilder(melding_id, rekkefoelge);

alter table public.melding_bilder enable row level security;

-- Data API-tilgang (kreves fra 2026-10-30)
grant select                         on public.melding_bilder to anon;
grant select, insert, update, delete on public.melding_bilder to authenticated;
grant select, insert, update, delete on public.melding_bilder to service_role;

create policy "Aktive kan lese melding_bilder" on melding_bilder
  for select using (exists (
    select 1 from profiles where id = auth.uid() and aktiv = true
  ));

create policy "Forfatter kan legge til melding_bilder" on melding_bilder
  for insert with check (
    exists (select 1 from meldinger where id = melding_id and profil_id = auth.uid())
  );

create policy "Forfatter eller admin kan slette melding_bilder" on melding_bilder
  for delete using (
    exists (select 1 from meldinger where id = melding_id and profil_id = auth.uid())
    or er_admin()
  );

alter publication supabase_realtime add table melding_bilder;

-- === 2. meldinger.innhold blir nullable ===========================
-- For dette trengs det å droppe den eksisterende check (1..2000) og legge på
-- en check som tillater null. Vi lar app-laget håndheve at minst en av
-- (innhold, bilde_url, melding_bilder-rad) er satt — kompliserte cross-table
-- constraints med trigger er ikke verdt det her.
alter table meldinger alter column innhold drop not null;
alter table meldinger drop constraint if exists meldinger_innhold_check;
alter table meldinger add constraint meldinger_innhold_check
  check (innhold is null or char_length(innhold) between 1 and 2000);

-- === 3. fra_facebook + kilde_ekstern_id på meldinger ==============
alter table meldinger
  add column if not exists fra_facebook boolean not null default false;

alter table meldinger
  add column if not exists kilde_ekstern_id text;

-- Idempotens for re-import — samme mønster som 066 (klubb_chat)
create unique index if not exists meldinger_kilde_ekstern_id_unique
  on meldinger(kilde_ekstern_id)
  where kilde_ekstern_id is not null;

create index if not exists meldinger_fra_facebook_idx
  on meldinger(fra_facebook)
  where fra_facebook = true;

-- === 4. fra_facebook + kilde_ekstern_id på melding_chat ===========
alter table melding_chat
  add column if not exists fra_facebook boolean not null default false;

alter table melding_chat
  add column if not exists kilde_ekstern_id text;

create unique index if not exists melding_chat_kilde_ekstern_id_unique
  on melding_chat(kilde_ekstern_id)
  where kilde_ekstern_id is not null;

create index if not exists melding_chat_fra_facebook_idx
  on melding_chat(fra_facebook)
  where fra_facebook = true;

-- === 5. Frys-policy: FB-rader kan ikke endres/slettes =============
-- Speiler 067 (klubb_chat). Hverken UPDATE eller DELETE skal være tillatt
-- for fra_facebook = true, uavhengig av rolle.

drop policy if exists "Slette egne melding eller admin" on meldinger;
create policy "Slette egne melding eller admin (ikke FB)" on meldinger
  for delete using (
    (fra_facebook is null or fra_facebook = false)
    and (profil_id = auth.uid() or er_admin())
  );

drop policy if exists "Oppdatere egne melding eller admin" on meldinger;
create policy "Oppdatere egne melding (ikke FB)" on meldinger
  for update using (
    (fra_facebook is null or fra_facebook = false)
    and (profil_id = auth.uid() or er_admin())
  )
  with check (
    (fra_facebook is null or fra_facebook = false)
    and (profil_id = auth.uid() or er_admin())
  );

drop policy if exists "Slette egne melding_chat eller admin" on melding_chat;
create policy "Slette egne melding_chat eller admin (ikke FB)" on melding_chat
  for delete using (
    (fra_facebook is null or fra_facebook = false)
    and (profil_id = auth.uid() or er_admin())
  );

drop policy if exists "Oppdatere egne melding_chat" on melding_chat;
create policy "Oppdatere egne melding_chat (ikke FB)" on melding_chat
  for update using (
    (fra_facebook is null or fra_facebook = false)
    and profil_id = auth.uid()
  )
  with check (
    (fra_facebook is null or fra_facebook = false)
    and profil_id = auth.uid()
  );
