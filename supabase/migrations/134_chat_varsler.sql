-- Chat-melding varsler alle aktive medlemmer, ikke bare @-mention. Se #612.
--
-- === a) Fem seed-rader i varsel_innstillinger ================================
-- Én nøkkel PER FLATE, ikke én felles «chat_ny». Klubbchatten går varmest
-- (den er den generelle kanalen for løst og fast) og admin må kunne dempe
-- akkurat den uten å samtidig kutte varsler om arrangement-kommentarer,
-- kåringskommentarer osv. Samme presedens som purring_manuell/purring_kanskje (mig. 128/133):
-- egen bryter per bevisst handling/flate, ikke et unntak fra en delt nøkkel.
--
-- Default aktiv = true — funksjonen skal virke fra dag én uten at admin må
-- huske å skru den på i kontrollpanelet.
--
-- beskrivelse er ORDRETT lik panel-teksten i lib/varsel-typer.ts (VARSEL_TEKSTER)
-- — sistnevnte er sannheten (varselPanelNavn() bruker DB-teksten kun som
-- fallback hvis koden mangler en oppføring), men de skal aldri stå og si to
-- forskjellige ting til admin.
insert into varsel_innstillinger (noekkel, aktiv, beskrivelse) values
  ('chat_klubb', true, 'Ny melding i klubbchatten'),
  ('chat_arrangement', true, 'Ny melding i en arrangement-chat'),
  ('chat_poll', true, 'Ny kommentar på en avstemming'),
  ('chat_melding', true, 'Ny kommentar på et innlegg'),
  ('chat_albumbilde', true, 'Ny kommentar på et bilde')
on conflict (noekkel) do nothing;

-- === b) varsel_logg.teller_ulest ============================================
-- Metadata-only i PG11+ (add column ... default ... not null uten rewrite,
-- ingen backfill) — defaulten ER backfillen: alt som allerede ligger i
-- innboksen skal fortsette å telle som viktig. Kun de fem chat_*-broadcastene
-- (sendVarsel-kallet fra lib/varsler.ts § sendChatVarsler) setter false —
-- @-mention (type 'mention') teller fortsatt, siden noen faktisk ble kalt på.
-- `if not exists` overalt i denne fila, som i migrasjon 121 på samme tabell:
-- en migrasjon som feiler halvveis skal kunne kjøres om igjen uten manuell
-- opprydding.
alter table public.varsel_logg
  add column if not exists teller_ulest boolean not null default true;

-- Ingen grant-endring nødvendig: migrasjon 121 revokerte update på hele
-- tabellen fra authenticated og ga kun `update (lest)` tilbake — den nye
-- kolonnen er dermed automatisk skrivebeskyttet for medlemmer via samme
-- kolonne-grant. Verifisert mot 121 før denne linjen ble skrevet.

-- Erstatt ulest-indeksen med samme predikat + teller_ulest — «Viktig»-fanen på
-- /profil (og prikken i TopHeader via harUlestVarsler()) skal aldri måtte
-- seq-scanne bort de høyvolum-radene fra chat.
--
-- Drop + create uten dekningsvindu er trygt her: hele migrasjonsfila kjører i
-- ÉN transaksjon, så ingen spørring i prod ser tilstanden mellom de to
-- setningene. (Derfor heller ikke `concurrently` — det er forbudt i
-- transaksjon, og tabellen er liten nok til at låsen er kortvarig.)
drop index if exists varsel_logg_profil_ulest_idx;
create index if not exists varsel_logg_profil_ulest_idx
  on public.varsel_logg (profil_id)
  where lest = false and teller_ulest;

-- Ny indeks for «Viktig»-spørringen på /profil (sortert visning, ikke bare
-- boolean-sjekk) — dekker (profil_id, opprettet desc) filtrert til de radene
-- som faktisk skal telle i innboksens hovedfane.
create index if not exists varsel_logg_profil_viktig_idx
  on public.varsel_logg (profil_id, opprettet desc)
  where teller_ulest;

-- Indeks for e-post-døgnbudsjettvakten (chatEpostBudsjettBrukt i lib/varsler.ts):
-- «hvor mange e-poster har vi sendt siste 24 t» kjøres ved HVER chat-melding,
-- og skal ikke seq-scanne hele innboks-historikken. Partial på kanal, sortert
-- på opprettet, så vinduet blir en range-scan.
create index if not exists varsel_logg_epost_doegn_idx
  on public.varsel_logg (opprettet)
  where kanal in ('epost', 'begge');

-- === c) Arkitekturnotat — broadcast er en innholdskopi som forlater kildens RLS
-- Et chat_*-broadcast-varsel kopierer et utdrag av meldingsteksten inn i
-- varsel_logg, en tabell med sin egen (løsere) RLS enn kildetabellen
-- (arrangement_chat/klubb_chat/poll_chat/melding_chat/album_bilde_chat).
-- Det er greit i dag fordi alle fem flatene ER klubbomfattende — enhver aktiv
-- profil har uansett lov til å lese kildemeldingen. Men regelen må stå skrevet
-- FØR noen legger til en sjette flate som IKKE er klubbomfattende (f.eks. en
-- privat gruppe-chat for et delsett av medlemmene): en broadcast av den
-- teksten inn i varsel_logg ville da lekket innhold til noen som ikke har
-- tilgang til kilden. sendChatVarsler() i lib/varsler.ts skal ALDRI utvides
-- til en scope-type uten at dette er vurdert på nytt.
