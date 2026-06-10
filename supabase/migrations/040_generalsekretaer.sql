-- Ny tittel-flagg «generalsekretær». Bæreren beholder rolle='admin' (full
-- RLS-tilgang) men markeres med egen flagg slik at UI kan vise spesiell
-- tittel og glød på profilbildet.

alter table profiles
  add column if not exists generalsekretaer boolean not null default false;

-- Kildeklubbens instans satte flagget på ett medlem her (data-setning,
-- strøket i publisert versjon — en fersk database har ingen profiler ennå).
