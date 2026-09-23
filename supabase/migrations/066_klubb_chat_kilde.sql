-- Flagg for klubb_chat-meldinger importert fra Facebook/Messenger-historikk.
-- Brukes til å skille importerte historiske meldinger fra ekte meldinger i appen
-- (UI-en kan vise dem litt annerledes — f.eks. med en "fra Messenger"-merkelapp).
--
-- Speiler 062 (arrangementer-tabellen) på `fra_facebook`-flagget og partial
-- indeksen for å filtrere FB-historikk effektivt.
--
-- I tillegg introduseres her `kilde_ekstern_id` + partial unique index — en
-- idempotens-mekanisme som 062 ikke har. Klubb-chat-import kan generere
-- mange tusen rader, og uten unik ekstern id ville re-kjøring av
-- import-skriptet gitt duplikater. Format: `messenger:{timestamp_ms}:{idx}`.
-- Unik-indeksen er partial (kun rader med ikke-null id), så manuelt
-- opprettede meldinger uten ekstern id ikke berøres.
alter table klubb_chat
  add column if not exists fra_facebook boolean not null default false;

alter table klubb_chat
  add column if not exists kilde_ekstern_id text;

-- Unik-indeks for idempotent re-import (kun for rader som faktisk har en ekstern id)
create unique index if not exists klubb_chat_kilde_ekstern_id_unique
  on klubb_chat(kilde_ekstern_id)
  where kilde_ekstern_id is not null;

-- Indeks for å filtrere/skjule FB-historikk i lister effektivt
create index if not exists klubb_chat_fra_facebook_idx
  on klubb_chat(fra_facebook)
  where fra_facebook = true;
