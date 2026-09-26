-- Møtemodus-flagget (#780) — kill-switch i app_innstillinger, samme mønster
-- som reisemodus (migrasjon 150).
--
-- Landes AV: samme begrunnelse som reisemodus — produkteieren skrur på selv
-- fra /innstillinger etter å ha sett geometrien stemme på telefonen.
insert into public.app_innstillinger (noekkel, aktiv, beskrivelse)
values ('moetemodus', false, 'Vis møtemodus (fullskjerm kart) fra møtestart til kl. 06 dagen etter')
on conflict (noekkel) do nothing;
