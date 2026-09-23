-- Reaksjoner per bilde i album-lightboxen (#480). Egen tabell adskilt fra
-- melding_reaksjon/chat_reaksjoner — reaksjonen sitter på selve bildet, ikke
-- på et innlegg eller en kommentar.
--
-- Sammensatt PK (bilde_id, profil_id) håndhever «én reaksjon per bruker»
-- direkte — vi trenger IKKE triple-PK (bilde_id, profil_id, emoji) + egen
-- unik-constraint slik melding_reaksjon/chat_reaksjoner måtte patches til i
-- mig. 114. Grunnen der var at Supabase realtime kun sender PK-kolonnene i
-- payload.old ved DELETE (replica identity default), og klienten trengte
-- emoji i den PK-en for å filtrere riktig rad bort. Denne tabellen er IKKE
-- lagt i supabase_realtime-publication — lightboxen bruker router.refresh()
-- etter mutasjon (samme modell som resten av album-flyten), så det problemet
-- oppstår ikke her. Ingen varsler sendes for bilde-reaksjoner.

create table public.album_bilde_reaksjon (
  bilde_id   uuid not null references public.album_bilde(id) on delete cascade,
  profil_id  uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null,
  opprettet  timestamptz not null default now(),
  primary key (bilde_id, profil_id)
);

create index album_bilde_reaksjon_bilde_idx on public.album_bilde_reaksjon(bilde_id);

alter table public.album_bilde_reaksjon enable row level security;

-- Data API-tilgang (kreves fra 2026-10-30 på vårt prosjekt). Ingen anon —
-- ingen offentlige flater, jf. #412-auditen.
grant select, insert, delete on public.album_bilde_reaksjon to authenticated;
grant select, insert, delete on public.album_bilde_reaksjon to service_role;

create policy "Aktive kan lese album_bilde_reaksjon" on public.album_bilde_reaksjon
  for select using (exists (
    select 1 from public.profiles where id = auth.uid() and aktiv = true
  ));

create policy "Egne reaksjoner — insert" on public.album_bilde_reaksjon
  for insert with check (
    profil_id = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and aktiv = true)
  );

create policy "Egne reaksjoner — delete" on public.album_bilde_reaksjon
  for delete using (profil_id = auth.uid());

-- Ingen update-policy: bytte av emoji gjøres som delete+insert i
-- lib/actions/album.ts, samme mønster som melding_reaksjon.
