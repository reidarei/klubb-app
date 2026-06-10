-- Legg inn alle gjenværende varsel-typer i varsel_innstillinger så
-- admin har én sentral kontrollpanel med på/av per type. Eksisterende
-- rader rører vi ikke. Default aktiv = true for alle nye.

INSERT INTO varsel_innstillinger (noekkel, aktiv, beskrivelse)
VALUES
  ('oppdatert',         true, 'Arrangement endret eller oppdatert'),
  ('purring_ansvar',    true, 'Manuell purring fra «purr»-knapp'),
  ('mention',           true, '@-mention i chat'),
  ('melding-ny',        true, 'Nytt innlegg på agenda'),
  ('privat-melding',    true, 'Ny privatmelding'),
  ('pass-forespørsel',  true, 'Forespørsel om pass-info (til generalsekretær)'),
  ('pass-godkjent',     true, 'Pass-tilgang godkjent (til søker)'),
  ('pass-avslatt',      true, 'Pass-tilgang avslått (til søker)'),
  ('ønske_ny',          true, 'Nytt innspill (til admin)'),
  ('ønske_lukket',      true, 'Ditt innspill er håndtert')
ON CONFLICT (noekkel) DO NOTHING;
