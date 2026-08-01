-- Egen bryter for manuell purring fra «Purre disse»-knappen. Se #547.
--
-- Manuell purring har hittil sendt type 'purring', som sendVarsel mapper til
-- nøkkelen 'purring_aktiv' — cron-bryteren. Flagget ignorerAktivBryter (#287)
-- skulle la den manuelle purringen gå ut uansett, men hoppet kun over en sjekk
-- i wrapperen; porten i sendVarsel slo opp samme nøkkel på nytt og stoppet
-- purringen likevel. Admin fikk grønn kvittering, ingen fikk varsel.
--
-- Fiksen er en egen varseltype med egen bryter i stedet for et unntak fra
-- porten. Default aktiv = true, altså dagens tiltenkte oppførsel: knappen
-- virker uavhengig av om den automatiske 3-dagers-purringen står på.
insert into varsel_innstillinger (noekkel, aktiv, beskrivelse) values
  ('purring_manuell', true, 'Purring til de som ikke har svart (fra «Purre disse»-knappen)')
on conflict (noekkel) do nothing;

comment on table public.varsel_innstillinger is
  'Sentral på/av-bryter per varseltype. Nøkkelen slås opp av sendVarsel() via typeTilNoekkel() i lib/varsel-typer.ts — det er ENESTE stedet som avgjør om en type er aktiv. Wrapper-funksjoner skal ikke gjøre samme oppslag selv (se #547).';
