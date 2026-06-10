-- Legg til type-kolonne på arrangementmaler. Avgjør hvilken skjemamal
-- (moete/tur) som vises når bruker velger malen i opprett-skjemaet.
-- "Annet" beholder null — brukeren velger selv.
alter table arrangementmaler
  add column type text check (type in ('moete', 'tur'));

update arrangementmaler set type = 'moete'
  where navn in (
    'Januar-februar møte',
    'Mars-april møte',
    'Mai-juni møte',
    'August-september møte',
    'Oktober-november møte',
    'Julebord'
  );

update arrangementmaler set type = 'tur'
  where navn = 'Reisekomiteen';
