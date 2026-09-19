-- Fjerde kartmarkerings-symbol: babe (#759).
--
-- Reidar: «I tillegg til milf må vi ha en babe. Ferdig snakka. Skal være på
-- samme måte som milf.» Tre ting i denne fila:
--
-- 1) Check-constrainten utvides med 'babe'. Listen speiles av
--    MARKERING_SYMBOLER i lib/markering-symboler.ts (samme presedens som
--    migrasjon 146) — uten dette avviser databasen noe UI-et tilbyr.
-- 2) Seed-rad for babe_alert i varsel_innstillinger, slik at admin faktisk
--    har en bryter for det panel-etiketten i lib/varsel-typer.ts lover.
-- 3) Seed-rad for milf_alert i SAMME fil. Den bryteren har manglet siden
--    #747 innførte MILF alert — ingen migrasjon seedet den, så panel-etiketten
--    var død kode og erVarselAktiv() falt alltid til aktiv = true. Null
--    atferdsendring her (fallback var allerede true), men lukker
--    asymmetrien der babe fikk en fungerende bryter og milf ikke.

-- Vakt FØR endringen: en ANNEN check-constraint på symbol ville ikke blitt
-- rørt av drop-en under, og de to hadde gjeldt samtidig — migrasjonen melder
-- suksess mens databasen fortsatt avviser 'babe'. Vi dropper den ikke
-- automatisk (vi vet ikke hvorfor den er der); vi nekter å kjøre, så et
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
-- til den nye og melde suksess mens noe ukjent fortsatt avviser 'babe'. En
-- migrasjon som feiler høyt er billigere enn en som lyver.
--
-- Re-add skanner eksisterende rader — alle har lovlige verdier ('ol',
-- 'mat', 'milf'), så dette er en ren utvidelse, ingen backfill.
alter table public.kart_markering
  drop constraint kart_markering_symbol_gyldig;
alter table public.kart_markering
  add constraint kart_markering_symbol_gyldig
  check (symbol in ('ol', 'mat', 'milf', 'babe'));

-- Ingen ny tabell opprettes her — varsel_innstillinger har grants fra
-- migrasjon 107, så ingen GRANT-statements trengs i denne fila.
--
-- beskrivelse er ORDRETT lik panel-teksten i lib/varsel-typer.ts (samme
-- konvensjon som migrasjon 134/144) — varselPanelNavn() bruker DB-teksten
-- kun som fallback, men de skal aldri si to forskjellige ting til admin.
insert into public.varsel_innstillinger (noekkel, aktiv, beskrivelse) values
  ('babe_alert', true, 'Babe alert (når noen setter en 😍-markering på kartet)'),
  ('milf_alert', true, 'MILF alert (når noen setter en 💋-markering på kartet)')
on conflict (noekkel) do nothing;
