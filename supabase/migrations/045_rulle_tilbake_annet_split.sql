-- Rulle tilbake "Annet møte" / "Annet tur"-splittingen fra migrasjon 044.
--
-- Årsak: forretningsmodell bekreftet — "Annet" er ett konsept for brukeren.
-- Skjema-typen (møte/tur) avgjøres via dialog ved opprettelse og lagres i
-- arrangementer.type, ikke via egen mal. Type-kolonnen på arrangementer
-- beholdes derfor, CHECK-constraint tur_felt_kun_for_tur beholdes.
--
-- mal_navn-kolonnen beholdes — den gir ryddigere ansvar-kobling og gjør
-- fremtidig arbeid rundt dialog-UX enklere.

-- 1. Flytt arrangementer tilbake til "Annet"
update arrangementer
set mal_navn = 'Annet'
where mal_navn in ('Annet møte', 'Annet tur');

-- 2. Slett de kunstige "Annet"-malene
delete from arrangementmaler where navn in ('Annet møte', 'Annet tur');

-- Verifisering (kjøres manuelt):
--   select mal_navn, count(*) from arrangementer group by mal_navn order by 1;
--   select navn from arrangementmaler order by "rekkefølge";
