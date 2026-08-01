-- Sentral på/av-bryter for den daglige klientfeil-alarmen.
--
-- Varselet (type 'klient_alarm', app/api/cron/sjekk-klientfeil) har aldri hatt
-- en rad i varsel_innstillinger. erVarselAktiv() defaulter til true når raden
-- mangler, så alarmen har gått ut uten at den kunne skrus av fra kontrollpanelet
-- — den var usynlig der alle andre varseltyper styres fra.
--
-- Raden endrer ingen oppførsel (aktiv = true er dagens effektive tilstand);
-- den gjør bryteren synlig. Hvem som mottar alarmen styres fortsatt per medlem
-- via profiles.faar_feilvarsler (migrasjon 123), ikke av denne raden.
--
-- on conflict do nothing slik at en re-kjøring ikke slår alarmen på igjen
-- etter at admin eventuelt har skrudd den av.
insert into varsel_innstillinger (noekkel, aktiv, beskrivelse) values
  ('klient_alarm', true, 'Daglig alarm om feil i appen (til de som får feilvarsler)')
on conflict (noekkel) do nothing;
