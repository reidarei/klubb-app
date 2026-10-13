-- Fond: påløpte renter hittil i år (renter_hittil) og kontrollert_dato fra
-- oppgjørs-API-et.
--
-- kontrollert_dato er dagen kontoen sist ble gjennomgått. snapshot_dato er
-- siste BOKFØRTE bevegelse og står stille i rolige perioder, så uten denne kan
-- ingen se forskjell på «ingenting har skjedd» og «ingen har sett etter».
-- NULL = eldre oppgjør uten feltet. Egen kolonne, ikke del av rente-pakken:
-- den gjelder hele kontoen og finnes også når renta mangler.
--
-- Fire kolonner på singletonen fond_kontant, skrevet sammen med saldoen når et
-- oppgjør skrives. Renta står UTENFOR saldo og innskyternes andeler til banken
-- bokfører den 31.12, så den hører ikke hjemme i fond_innskudd.
--
-- NULL betyr «ingen avlesning» (før første avlesning i året, eller etter at
-- renta er bokført) — ikke 0. Check-en håndhever alle-eller-ingen, så siden
-- aldri får en halv pakke å vise.
--
-- Ingen nye grants: kolonner på en eksisterende tabell arver tabellens grants,
-- og RLS-policyene (lese: innlogget, skrive: er_admin()) dekker dem uendret.

alter table public.fond_kontant
  add column renter_brutto         numeric(12,2),
  add column renter_netto_anslag   numeric(12,2),
  add column renter_skattesats     numeric(5,4),
  add column renter_observert_dato date,
  add column kontrollert_dato      date;

alter table public.fond_kontant
  add constraint fond_kontant_renter_hele_pakken check (
    (renter_brutto is null and renter_netto_anslag is null
      and renter_skattesats is null and renter_observert_dato is null)
    or
    (renter_brutto is not null and renter_netto_anslag is not null
      and renter_skattesats is not null and renter_observert_dato is not null)
  ),
  add constraint fond_kontant_renter_skattesats check (
    renter_skattesats is null or (renter_skattesats >= 0 and renter_skattesats < 1)
  );
