-- Fjerde kartmarkerings-symbol.
--
-- To ting i denne fila:
--
-- 1) Check-constrainten utvides med det fjerde symbolet. Listen speiles av
--    KLUBB_SYMBOLER i lib/klubb-symboler.ts (samme presedens som migrasjon
--    146) — uten dette avviser databasen noe UI-et tilbyr.
-- 2) Seed-rader i varsel_innstillinger for de to varslende symbolene, slik at
--    admin faktisk har brytere for det panel-etikettene lover. Uten radene er
--    etiketten død kode og erVarselAktiv() faller alltid til aktiv = true.
--
-- MERK: både verdilisten og seed-radene er bundet til symbol-id-ene som gjaldt
-- da fila ble skrevet. Migrasjon 152 gjør verdilisten semantisk død; bytter du
-- ut et symbol i lib/klubb-symboler.ts etter at denne har kjørt, må du selv
-- legge til bryter-raden for den nye varseltypen.

-- Vakt FØR endringen: en ANNEN check-constraint på symbol ville ikke blitt
-- rørt av drop-en under, og de to hadde gjeldt samtidig — migrasjonen melder
-- suksess mens databasen fortsatt avviser det nye symbolet. Vi dropper den
-- ikke automatisk (vi vet ikke hvorfor den er der); vi nekter å kjøre, så et
-- menneske avgjør. Ingen av de tre andre constraintene på tabellen (lat, lng,
-- tekst — migrasjon 145) nevner symbol, så vakten gir ingen falske treff.
do $$
declare andre text;
begin
  select string_agg(conname, ', ') into andre
  from pg_constraint
  where conrelid = 'public.kart_markering'::regclass
    and contype = 'c'
    and conname <> 'kart_markering_symbol_gyldig'
    and pg_get_constraintdef(oid) ilike '%symbol%';
  if andre is not null then
    raise exception 'Uventet check-constraint på symbol: %. Fjern eller omdøp den før 151 kjøres.', andre;
  end if;
end $$;

-- Uten IF EXISTS med vilje: migrasjon 146 oppretter alltid constrainten under
-- NØYAKTIG dette navnet, så et manglende navn her betyr at databasen ikke er
-- den vi tror den er. Da skal migrasjonen stoppe høyt (42704) framfor å legge
-- til den nye og melde suksess mens noe ukjent fortsatt avviser verdien. En
-- migrasjon som feiler høyt er billigere enn en som lyver.
--
-- Re-add skanner eksisterende rader — alle har lovlige verdier, så dette er en
-- ren utvidelse, ingen backfill.
alter table public.kart_markering
  drop constraint kart_markering_symbol_gyldig;
alter table public.kart_markering
  add constraint kart_markering_symbol_gyldig
  check (symbol in ('ol', 'mat', 'obs1', 'obs2'));

-- Ingen ny tabell opprettes her — varsel_innstillinger har grants fra
-- migrasjon 107, så ingen GRANT-statements trengs i denne fila.
--
-- beskrivelse er ORDRETT lik panel-teksten i lib/klubb-symboler.ts (samme
-- konvensjon som migrasjon 134/144) — varselPanelNavn() bruker DB-teksten kun
-- som fallback, men de skal aldri si to forskjellige ting til admin.
insert into public.varsel_innstillinger (noekkel, aktiv, beskrivelse) values
  ('obs1_alert', true, 'Obs 1 (når noen setter en 🚨-markering på kartet)'),
  ('obs2_alert', true, 'Obs 2 (når noen setter en 📣-markering på kartet)')
on conflict (noekkel) do nothing;
