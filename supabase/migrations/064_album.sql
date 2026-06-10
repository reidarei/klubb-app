-- Album (#108 — fase 1). Et album grupperer bilder. Det kan høre til et
-- arrangement (primær bruk) eller stå alene. Bildene lagres i R2 under
-- `albums/{album_id}/...`; her holder vi bare metadata og rekkefølge.
-- Per-bilde kommentarer kommer i en senere fase (egen tabell, ikke her).

create table album (
  id              uuid primary key default gen_random_uuid(),
  tittel          text not null check (char_length(tittel) between 1 and 200),
  arrangement_id  uuid references arrangementer(id) on delete set null,
  cover_bilde_id  uuid,
  opprettet_av    uuid not null references profiles(id) on delete set null,
  opprettet       timestamptz not null default now(),
  oppdatert       timestamptz not null default now()
);

create index album_arrangement_idx on album(arrangement_id);
create index album_opprettet_idx on album(opprettet desc);

alter table album enable row level security;

create policy "Aktive kan lese album" on album
  for select using (exists (
    select 1 from profiles where id = auth.uid() and aktiv = true
  ));

create policy "Aktive kan opprette album" on album
  for insert with check (
    opprettet_av = auth.uid()
    and exists (select 1 from profiles where id = auth.uid() and aktiv = true)
  );

create policy "Eier eller admin kan oppdatere album" on album
  for update using (
    opprettet_av = auth.uid() or er_admin()
  );

create policy "Eier eller admin kan slette album" on album
  for delete using (
    opprettet_av = auth.uid() or er_admin()
  );

-- === album_bilde ===============================================
create table album_bilde (
  id             uuid primary key default gen_random_uuid(),
  album_id       uuid not null references album(id) on delete cascade,
  bilde_url      text not null,
  thumb_url      text,
  bredde         int,
  hoyde          int,
  lastet_opp_av  uuid not null references profiles(id) on delete set null,
  rekkefolge     int not null default 0,
  opprettet      timestamptz not null default now()
);

create index album_bilde_album_idx on album_bilde(album_id, rekkefolge, opprettet);

-- FK fra album.cover_bilde_id legges til ETTER album_bilde finnes,
-- ellers får vi sirkulær avhengighet ved create.
alter table album add constraint album_cover_fk
  foreign key (cover_bilde_id) references album_bilde(id) on delete set null;

alter table album_bilde enable row level security;

create policy "Aktive kan lese album_bilde" on album_bilde
  for select using (exists (
    select 1 from profiles where id = auth.uid() and aktiv = true
  ));

create policy "Aktive kan laste opp album_bilde" on album_bilde
  for insert with check (
    lastet_opp_av = auth.uid()
    and exists (select 1 from profiles where id = auth.uid() and aktiv = true)
  );

create policy "Opplaster, album-eier eller admin kan slette album_bilde" on album_bilde
  for delete using (
    lastet_opp_av = auth.uid()
    or er_admin()
    or exists (select 1 from album a where a.id = album_id and a.opprettet_av = auth.uid())
  );

create policy "Album-eier eller admin kan oppdatere album_bilde" on album_bilde
  for update using (
    er_admin()
    or exists (select 1 from album a where a.id = album_id and a.opprettet_av = auth.uid())
  );
