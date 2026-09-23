-- Reisemodus-flagget (#723, #724) — kill-switch i app_innstillinger.
--
-- Landes AV: en deploy-revert tar 20–40 min på hotellwifi, og et irreversibelt
-- forsidebytte for 18 mann midt i en tur er ikke noe vi vil oppdage feil i
-- live. Produkteieren skrur på selv fra /innstillinger etter å ha sett
-- geometrien stemme på telefonen (arkitekturstyrets landingsanbefaling, #723).
insert into public.app_innstillinger (noekkel, aktiv, beskrivelse)
values ('reisemodus', false, 'Vis reisemodus (fullskjerm kart) mens en tur med sluttid pågår')
on conflict (noekkel) do nothing;
