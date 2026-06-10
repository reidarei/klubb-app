-- Backfill sist_aktivitet etter at reaksjoner ikke lenger forlenger levetid.
-- Sett sist_aktivitet til største av (opprettet, siste kommentar). Uten dette
-- ville gamle meldinger som er bumpet av reaksjoner fortsatt vises som
-- levende på agenda til reaksjonens 7-dager går ut.
update meldinger m
set sist_aktivitet = greatest(
  m.opprettet,
  coalesce((select max(opprettet) from melding_chat where melding_id = m.id), m.opprettet)
);
