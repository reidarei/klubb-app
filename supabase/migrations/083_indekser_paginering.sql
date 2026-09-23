-- Indekser for keyset-paginering på /tidligere-siden. Issue #176.
-- Begge indeksene dekker (sorteringskolonne DESC, id DESC) som er eksakt
-- det ORDER BY-mønsteret vi bruker — Postgres kan dermed scanne fremover
-- i indeksen uten heap-sort.
--
-- poll_tidligere_paginering_idx er ikke inkludert fordi poll-tabellen per
-- 2026-05-14 kun har 1 rad. Legges til ved behov.

create index if not exists arrangementer_tidligere_paginering_idx
  on public.arrangementer (start_tidspunkt desc, id desc);

create index if not exists meldinger_tidligere_paginering_idx
  on public.meldinger (sist_aktivitet desc, id desc);
