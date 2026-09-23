-- Koordinater for kart over turer (#Stedene). Fylles ved oppretting/redigering
-- av en tur via geokoding av `destinasjon` (se lib/geokoding.ts), slik at kartet
-- leser lagrede koordinater i stedet for en hardkodet by-tabell. Nullable:
-- møter uten destinasjon, og turer der geokoding feiler/ikke gir treff, står null.
-- Ingen nye grants: kolonner arver tabellens eksisterende grants.
alter table arrangementer
  add column if not exists lat double precision,
  add column if not exists lng double precision;
