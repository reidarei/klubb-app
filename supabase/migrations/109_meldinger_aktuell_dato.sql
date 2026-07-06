-- #419 — Festedato for meldinger (valgfritt).
--
-- aktuell_dato: valgfritt festedato-felt; innlegg festes øverst på agenda
-- t.o.m. denne datoen, uavhengig av MELDING_LEVENDE_DAGER. Se #419.
-- Ingen grants (arves fra tabellen via mig. 107).

alter table public.meldinger
  add column if not exists aktuell_dato date;
