-- Fond: løpende avkastning per post (#555)
--
-- Eiendom og verdipapir viste bare verdi og urealisert gevinst. Det en
-- eiendom faktisk KASTER AV seg i året — husleie inn, driftskostnader ut —
-- fantes ingen steder, og et fond med utbytte så ut som et fond uten.
-- Kolonnene er «i år»-tall som nullstilles ved årsskiftet, ikke akkumulerte
-- livsløpstall, og oppdateres manuelt via editorene på /fond/rediger.
--
-- numeric(12,2) som resten av fond-beløpene (jf. 112_fond_oere) — eksakt
-- desimal-aritmetikk, aldri float for penger.
-- Default 0 og not null: en post uten registrert husleie har hatt null
-- husleie, ikke «ukjent». Da slipper UI-et å skille de to tilfellene.

alter table public.fond_eiendom
  add column husleie_i_aar numeric(12,2) not null default 0,
  add column driftskostnader_i_aar numeric(12,2) not null default 0;

alter table public.fond_verdipapir
  add column utbytte_i_aar numeric(12,2) not null default 0;

-- Driftskostnader lagres som et POSITIVT tall og trekkes fra i visningen.
-- Alternativet — å lagre dem negativt — gjør at et fortegnsfeil i editoren
-- stille øker netto i stedet for å senke det.
alter table public.fond_eiendom
  add constraint fond_eiendom_driftskostnader_positiv
    check (driftskostnader_i_aar >= 0);

-- RLS, grants og policies er uendret: nye kolonner på en eksisterende tabell
-- arver tabellens policyer, og grants i Postgres er per tabell (ikke per
-- kolonne) med mindre kolonnevern er satt eksplisitt — det er det ikke her.
