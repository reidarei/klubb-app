-- Legg til innstilling for varsling ved ny poll. Admin kan skru av via
-- samme innstillingsside som styrer øvrige varsler.
INSERT INTO varsel_innstillinger (noekkel, aktiv, beskrivelse)
VALUES ('ny_poll', true, 'Varsel ved ny avstemming')
ON CONFLICT (noekkel) DO NOTHING;
