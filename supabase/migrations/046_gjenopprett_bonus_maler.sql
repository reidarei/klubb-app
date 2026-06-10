-- Gjenoppretter "Annet"-splittingen som ble rullet tilbake i 045, men med nye
-- navn: Bonusmøte og Bonustur. Disse fungerer som reelle maler i DB slik at
-- arrangement-type kan utledes fra mal alene (forberedelse for fjerning av
-- arrangementer.type i fase E).
--
-- UI-laget slår sammen Bonusmøte + Bonustur til ett virtuelt "Annet"-valg i
-- dropdown, og viser en dialog ved valg.

insert into arrangementmaler (navn, "rekkefølge", type, purredato) values
  ('Bonusmøte', 98, 'moete', null),
  ('Bonustur',  99, 'tur',   null);

-- Flytt arrangementer fra "Annet" til riktig bonus-mal basert på type
update arrangementer set mal_navn = 'Bonusmøte' where mal_navn='Annet' and type='moete';
update arrangementer set mal_navn = 'Bonustur'  where mal_navn='Annet' and type='tur';

-- Slett gammel Annet-mal (ingen arrangement peker til den etter flytting)
delete from arrangementmaler where navn='Annet';

-- Verifisering (kjøres manuelt):
--   select mal_navn, count(*) from arrangementer group by mal_navn order by 1;
--   select navn, type from arrangementmaler order by "rekkefølge";
