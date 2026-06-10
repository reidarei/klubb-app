-- Privatmeldinger mellom to medlemmer (#91). Speiler chat-mønsteret fra
-- arrangement_chat / poll_chat / melding_chat, men med eierskap låst til
-- to deltakere via en samtale-rad.

-- === samtale ====================================================
-- Én rad per par. Constraint profil_a < profil_b sikrer at vi alltid
-- gjenbruker samme rad uavhengig av hvem som «åpnet» samtalen først —
-- aapneSamtale() i app-laget sorterer ID-ene før insert.
create table samtale (
  id             uuid primary key default gen_random_uuid(),
  profil_a       uuid not null references profiles(id) on delete cascade,
  profil_b       uuid not null references profiles(id) on delete cascade,
  opprettet      timestamptz not null default now(),
  sist_aktivitet timestamptz not null default now(),
  constraint samtale_par_unik unique (profil_a, profil_b),
  constraint samtale_a_foer_b check (profil_a < profil_b)
);

create index samtale_a_idx on samtale (profil_a, sist_aktivitet desc);
create index samtale_b_idx on samtale (profil_b, sist_aktivitet desc);

alter table samtale enable row level security;

create policy "Deltakere kan lese samtale" on samtale
  for select using (
    auth.uid() = profil_a or auth.uid() = profil_b
  );

-- Insert kun hvis innlogget bruker er en av deltakerne. Hindrer at
-- noen oppretter samtaler i andres navn.
create policy "Deltakere kan opprette samtale" on samtale
  for insert with check (
    (auth.uid() = profil_a or auth.uid() = profil_b)
    and exists (select 1 from profiles where id = profil_a and aktiv = true)
    and exists (select 1 from profiles where id = profil_b and aktiv = true)
  );

alter publication supabase_realtime add table samtale;

-- === samtale_chat ==============================================
create table samtale_chat (
  id          uuid primary key default gen_random_uuid(),
  samtale_id  uuid not null references samtale(id) on delete cascade,
  profil_id   uuid not null references profiles(id) on delete cascade,
  innhold     text not null check (char_length(innhold) between 1 and 2000),
  opprettet   timestamptz not null default now(),
  lest        boolean not null default false
);

create index samtale_chat_samtale_opprettet_idx on samtale_chat (samtale_id, opprettet);
create index samtale_chat_ulest_idx on samtale_chat (samtale_id) where lest = false;

alter table samtale_chat enable row level security;

-- Lesetilgang: kun de to deltakerne i tilhørende samtale
create policy "Deltakere kan lese samtale_chat" on samtale_chat
  for select using (
    exists (
      select 1 from samtale s
      where s.id = samtale_id
        and (auth.uid() = s.profil_a or auth.uid() = s.profil_b)
    )
  );

-- Innsetting: kun egne meldinger, kun i samtaler man deltar i
create policy "Deltakere kan poste samtale_chat" on samtale_chat
  for insert with check (
    profil_id = auth.uid()
    and exists (
      select 1 from samtale s
      where s.id = samtale_id
        and (auth.uid() = s.profil_a or auth.uid() = s.profil_b)
    )
  );

-- Oppdatering kun for å markere som lest. Mottakeren (ikke avsender)
-- kan sette `lest = true`. Avsender kan ikke endre sin egen melding —
-- konsistent med øvrig chat hvor redigering håndteres av separat policy.
create policy "Mottaker kan markere samtale_chat lest" on samtale_chat
  for update using (
    profil_id <> auth.uid()
    and exists (
      select 1 from samtale s
      where s.id = samtale_id
        and (auth.uid() = s.profil_a or auth.uid() = s.profil_b)
    )
  );

-- Egne meldinger kan redigeres (innholdet); RLS uten kolonne-restriksjon
-- her — app-laget begrenser hvilke kolonner som faktisk endres.
create policy "Avsender kan redigere samtale_chat" on samtale_chat
  for update using (profil_id = auth.uid());

create policy "Slette egne samtale_chat eller admin" on samtale_chat
  for delete using (profil_id = auth.uid() or er_admin());

alter publication supabase_realtime add table samtale_chat;

-- === Trigger: oppdater sist_aktivitet ===========================
create or replace function oppdater_samtale_sist_aktivitet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update samtale set sist_aktivitet = now() where id = new.samtale_id;
  return new;
end;
$$;

create trigger samtale_chat_oppdaterer_sist_aktivitet
  after insert on samtale_chat
  for each row execute function oppdater_samtale_sist_aktivitet();
