-- Egen bryter for det automatiske bursdagsvarselet til «de andre». Se #638.
--
-- Bevisst IKKE delt med profiles.bursdagsgratulasjon_aktiv (per-admin toggle
-- for gratulasjonen i klubbchatten): dette varselet lever på egne bein, går
-- automatisk hver morgen noen har bursdag, og er uavhengig av om noen admin
-- har skrudd på gratulasjons-automatikken. Se lib/actions/bursdagsvarsel.ts.
--
-- Default aktiv = true — dagens tiltenkte oppførsel med en gang bryteren
-- finnes, uten at admin må huske å skru den på.
insert into varsel_innstillinger (noekkel, aktiv, beskrivelse) values
  ('bursdag_i_dag', true, 'Bursdag i klubben (om morgenen, til alle andre enn bursdagsbarnet)')
on conflict (noekkel) do nothing;
