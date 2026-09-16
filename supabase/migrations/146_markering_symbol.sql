-- Symbol på kartmarkeringer (#707).
--
-- Reidar ba om at et sted kan markeres med ett av tre symboler — øl, mat eller
-- milf — i tillegg til fritekstbeskrivelsen. Symbolet er det man ser på kartet
-- på avstand; teksten er detaljen man leser når man trykker.
--
-- Lagret som en kort nøkkel, ikke som emojien selv: emojien er en
-- PRESENTASJONSDETALJ som hører hjemme i koden (lib/markering-symboler.ts).
-- Lagrer vi tegnet, kan vi aldri bytte det ut uten en datamigrering, og et
-- emoji-tegn varierer dessuten i bredde og komposisjon mellom plattformer.
alter table public.kart_markering
  add column symbol text not null default 'ol';

-- Check og ikke enum: et fjerde symbol skal være en endring av denne listen,
-- ikke en ny type i katalogen. Listen speiles av MARKERING_SYMBOLER i
-- lib/markering-symboler.ts — endres den ene, må den andre følge etter.
alter table public.kart_markering
  add constraint kart_markering_symbol_gyldig
  check (symbol in ('ol', 'mat', 'milf'));

-- Eksisterende markeringer får 'ol' via default-verdien over. Det er et valg,
-- ikke en tilfeldighet: de ble satt før symboler fantes, og øl er det som
-- oftest er tilfelle når gutta markerer et sted.
