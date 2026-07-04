-- Supplement til 101_feil_logg.sql. To rettelser fra Copilot-review under
-- pipeline-runden på #366 rakk ikke inn i 101 før den ble kjørt lokalt, så vi
-- legger dem til separat her. Idempotent — trygt å kjøre uansett tilstand.
--
-- 1) GRANT SELECT til authenticated — RLS-policyen «Admin kan lese feil_logg»
--    trenger dette for at PostgREST skal returnere rader (uten grant får
--    admins 42501 selv om policyen tillater).
-- 2) feil_logg_bucket()-funksjonen bruker nå «AT TIME ZONE 'UTC'» slik at
--    to_char blir reelt deterministisk. Rebygg partial unique index slik at
--    indeks-oppføringer reflekterer UTC-versjonen (tabellen er ny og bør ikke
--    ha rader ennå — trygt å drop+create).

grant select on public.feil_logg to authenticated;

drop index if exists feil_logg_profil_event_minutt_uq;

create or replace function feil_logg_bucket(ts timestamptz)
  returns text
  language sql
  immutable
  security definer
  set search_path = ''
  as $$
    select to_char($1 at time zone 'UTC', 'YYYY-MM-DD HH24:MI')
  $$;

create unique index feil_logg_profil_event_minutt_uq
  on public.feil_logg (profil_id, event, feil_logg_bucket(opprettet))
  where profil_id is not null;
