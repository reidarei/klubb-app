-- #463 — Fjern album-spotlight-begrepet (bakgrunn: #461). Innlegg med album
-- viser nå alltid albumets omslagsbilde (fallback første bilde via
-- cover-embed) — det var aldri en reell brukerbehov å velge et annet bilde
-- enn omslaget, så eget spotlight-bilde-valg var unødvendig kompleksitet.
--
-- album_id-kolonnen og meldinger_album_id_idx beholdes uendret — kun
-- spotlight-spesifikke kolonne/constraint fjernes.

alter table public.meldinger
  drop constraint if exists meldinger_spotlight_krever_album;

alter table public.meldinger
  drop column if exists album_spotlight_bilde_id;

-- Backfill: album uten manuelt omslag får første bilde som omslag (#463).
-- Matcher sorteringen UI-et bruker (rekkefolge, deretter opprettet) — samme
-- som album_bilde_album_idx (064). Sikrer at eksisterende album med bilder
-- får et cover, slik at innleggskort viser bilde etter at spotlight er borte.
update public.album a
set cover_bilde_id = (
  select ab.id from public.album_bilde ab
  where ab.album_id = a.id
  order by ab.rekkefolge, ab.opprettet
  limit 1
)
where a.cover_bilde_id is null
  and exists (select 1 from public.album_bilde ab where ab.album_id = a.id);
