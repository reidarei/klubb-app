-- Album-spotlight på meldinger (#214 — første case). Lar en bruker
-- lage et innlegg som highlighter ett bilde fra et eksisterende album
-- og lenker tilbake til hele albumet, uten å duplisere bildet.
--
-- album_id satt = innlegget er en album-spotlight.
-- album_spotlight_bilde_id satt = bruk dette bildet som spotlight.
-- Null spotlight = klienten faller tilbake til album.cover_bilde_id.
--
-- Begge er nullable og on delete set null så slettet album/bilde
-- ikke kaskader til meldingen. Klienten degraderer da til ren tekst.
--
-- Vi håndhever ikke i DB at spotlight_bilde tilhører samme album som
-- album_id — app-laget velger spotlight FRA bildelisten i valgt album,
-- så feiloppsett er praktisk talt umulig fra UI. Cross-FK check med
-- subquery er ikke verdt kompleksiteten.

alter table public.meldinger
  add column if not exists album_id uuid
    references album(id) on delete set null;

alter table public.meldinger
  add column if not exists album_spotlight_bilde_id uuid
    references album_bilde(id) on delete set null;

-- Spotlight uten album_id gir ingen mening — håndhev at album_id er satt
-- hvis spotlight er satt. (Album uten spotlight er OK; cover brukes.)
alter table public.meldinger
  drop constraint if exists meldinger_spotlight_krever_album;
alter table public.meldinger
  add constraint meldinger_spotlight_krever_album
  check (album_spotlight_bilde_id is null or album_id is not null);

-- Index for at album-side / cleanup kan finne meldinger som peker hit.
create index if not exists meldinger_album_id_idx
  on public.meldinger(album_id)
  where album_id is not null;
