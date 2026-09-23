-- Legg til innstilling for varsling ved nytt arrangement
INSERT INTO varsel_innstillinger (noekkel, aktiv, beskrivelse)
VALUES ('nytt_arrangement', true, 'Varsel ved nytt arrangement')
ON CONFLICT (noekkel) DO NOTHING;
