-- Egen bryter for purring til de som har svart kanskje. Se #596.
--
-- Samme presedens som #547/128_purring_manuell_innstilling.sql: en manuell
-- purre-handling fra en «Bestem dere»-knapp må kunne stå på uavhengig av
-- cron-bryterne for de andre purretypene, og skal derfor ha sin egen nøkkel
-- i stedet for å gjenbruke purring_aktiv eller purring_manuell — de to
-- rammer en annen mottakergruppe (uten svar) og en annen oppfordring.
--
-- Default aktiv = true, altså dagens tiltenkte oppførsel: knappen virker med
-- en gang den finnes i UI, uten at admin må huske å skru den på først.
insert into varsel_innstillinger (noekkel, aktiv, beskrivelse) values
  ('purring_kanskje', true, 'Purring til de som har svart kanskje (fra «Bestem dere»-knappen)')
on conflict (noekkel) do nothing;
