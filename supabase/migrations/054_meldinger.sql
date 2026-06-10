-- Meldinger (#90 del 2). Fjerde type element på agenda — innlegg à la
-- Facebook-status. Bygges som tre tabeller:
--   1. meldinger          — selve innlegget
--   2. melding_chat       — kommentarer (speiler poll_chat fra 051)
--   3. melding_reaksjon   — reaksjoner på selve innlegget
-- Reaksjoner på kommentarene gjenbruker chat_reaksjoner (048).

-- === meldinger =================================================
create table meldinger (
  id             uuid primary key default gen_random_uuid(),
  profil_id      uuid not null references profiles(id) on delete cascade,
  innhold        text not null check (char_length(innhold) between 1 and 2000),
  opprettet      timestamptz not null default now(),
  sist_aktivitet timestamptz not null default now()
);

create index meldinger_sist_aktivitet_idx on meldinger (sist_aktivitet desc);

alter table meldinger enable row level security;

create policy "Aktive kan lese meldinger" on meldinger
  for select using (exists (
    select 1 from profiles where id = auth.uid() and aktiv = true
  ));

create policy "Aktive kan poste melding" on meldinger
  for insert with check (
    profil_id = auth.uid()
    and exists (select 1 from profiles where id = auth.uid() and aktiv = true)
  );

create policy "Slette egne melding eller admin" on meldinger
  for delete using (
    profil_id = auth.uid() or er_admin()
  );

create policy "Oppdatere egne melding eller admin" on meldinger
  for update using (
    profil_id = auth.uid() or er_admin()
  );

alter publication supabase_realtime add table meldinger;

-- === melding_chat ==============================================
create table melding_chat (
  id         uuid primary key default gen_random_uuid(),
  melding_id uuid not null references meldinger(id) on delete cascade,
  profil_id  uuid not null references profiles(id) on delete cascade,
  innhold    text not null check (char_length(innhold) between 1 and 500),
  opprettet  timestamptz not null default now()
);

create index melding_chat_melding_opprettet_idx on melding_chat (melding_id, opprettet);

alter table melding_chat enable row level security;

create policy "Aktive kan lese melding_chat" on melding_chat
  for select using (exists (
    select 1 from profiles where id = auth.uid() and aktiv = true
  ));

create policy "Aktive kan poste melding_chat" on melding_chat
  for insert with check (
    profil_id = auth.uid()
    and exists (select 1 from profiles where id = auth.uid() and aktiv = true)
  );

create policy "Slette egne melding_chat eller admin" on melding_chat
  for delete using (
    profil_id = auth.uid() or er_admin()
  );

create policy "Oppdatere egne melding_chat" on melding_chat
  for update using (profil_id = auth.uid());

alter publication supabase_realtime add table melding_chat;

-- === melding_reaksjon ==========================================
create table melding_reaksjon (
  melding_id uuid not null references meldinger(id) on delete cascade,
  profil_id  uuid not null references profiles(id) on delete cascade,
  emoji      text not null,
  opprettet  timestamptz not null default now(),
  primary key (melding_id, profil_id, emoji)
);

create index melding_reaksjon_melding_idx on melding_reaksjon(melding_id);

alter table melding_reaksjon enable row level security;

create policy "Aktive kan lese melding_reaksjon" on melding_reaksjon
  for select using (exists (
    select 1 from profiles where id = auth.uid() and aktiv = true
  ));

create policy "Egne reaksjoner — insert" on melding_reaksjon
  for insert with check (profil_id = auth.uid());

create policy "Egne reaksjoner — delete" on melding_reaksjon
  for delete using (profil_id = auth.uid());

alter publication supabase_realtime add table melding_reaksjon;

-- === Triggere: oppdater sist_aktivitet =========================
-- Vi oppdaterer kun ved INSERT. Ved DELETE lar vi sist_aktivitet stå —
-- en slettet kommentar/reaksjon var en gang ekte aktivitet, og enklere
-- regler gir mer forutsigbar sortering på agenda.
create or replace function oppdater_melding_sist_aktivitet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update meldinger set sist_aktivitet = now() where id = new.melding_id;
  return new;
end;
$$;

create trigger melding_chat_oppdaterer_sist_aktivitet
  after insert on melding_chat
  for each row execute function oppdater_melding_sist_aktivitet();

create trigger melding_reaksjon_oppdaterer_sist_aktivitet
  after insert on melding_reaksjon
  for each row execute function oppdater_melding_sist_aktivitet();
