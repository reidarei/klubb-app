-- Av/på-bryter for KI-generert bursdagsbilde (#641) i app_innstillinger,
-- samme mønster som reisemodus/møtemodus (migrasjon 150/153).
--
-- Landes PÅ, i motsetning til de to kill-switchene: funksjonen er allerede i
-- drift, og bryteren skal ikke endre dagens oppførsel — bare gi admin en måte
-- å skru den av på. Krever fortsatt Vertex-credentials (BURSDAGSBILDE_PAA).
insert into public.app_innstillinger (noekkel, aktiv, beskrivelse)
values ('bursdagsbilde', true, 'Lag KI-generert bursdagsbilde til bursdagskortet')
on conflict (noekkel) do nothing;
