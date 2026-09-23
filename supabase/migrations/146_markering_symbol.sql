-- Symbol på kartmarkeringer.
--
-- Et sted kan markeres med ett av tre symboler i tillegg til
-- fritekstbeskrivelsen. Symbolet er det man ser på kartet på avstand; teksten
-- er detaljen man leser når man trykker.
--
-- Lagret som en kort nøkkel, ikke som emojien selv: emojien er en
-- PRESENTASJONSDETALJ som hører hjemme i koden (lib/klubb-symboler.ts).
-- Lagrer vi tegnet, kan vi aldri bytte det ut uten en datamigrering, og et
-- emoji-tegn varierer dessuten i bredde og komposisjon mellom plattformer.
alter table public.kart_markering
  add column symbol text not null default 'ol';

-- Check og ikke enum: et fjerde symbol skal være en endring av denne listen,
-- ikke en ny type i katalogen. Listen speiles av KLUBB_SYMBOLER i
-- lib/klubb-symboler.ts — endres den ene, må den andre følge etter.
--
-- MERK: verdilisten her er historisk. Migrasjon 152 erstatter den med en
-- format-check, og fra og med den krever et nytt symbol ingen migrasjon.
alter table public.kart_markering
  add constraint kart_markering_symbol_gyldig
  check (symbol in ('ol', 'mat', 'obs1'));

-- Eksisterende markeringer får 'ol' via default-verdien over. Det er et valg,
-- ikke en tilfeldighet: de ble satt før symboler fantes.
