-- Symbolformat i stedet for en verdiliste (#767).
--
-- Migrasjon 146 (og utvidet i 151) listet gyldige symbol-verdier eksplisitt i
-- check-constrainten kart_markering_symbol_gyldig: hvert nytt symbol krevde en
-- ny migrasjon som droppet og la constrainten til på nytt. Arkitekturstyret
-- (#767) landet på at symbolSETTET er data, ikke skjema — ingen policy, index,
-- join eller type i databasen avhenger av de konkrete verdiene, bare av at
-- formen er trygg (kort, ren id). Fra nå håndhever constrainten FORM, ikke
-- INNHOLD, og et nytt symbol krever ikke lenger en migrasjon.
--
-- Rekkefølgen i denne fila er bindende: constraint-byttet i blokk 1 MÅ skje
-- FØR opprydningen i blokk 2. Motsatt rekkefølge kjører opprydningen mot en
-- constraint som ennå ikke er byttet — ufarlig for akkurat denne deleten (den
-- rører ikke kart_markering), men rekkefølgen er den generelle regelen for
-- migrasjoner som både bytter en constraint og rydder data den beskytter.

-- ── Blokk 1: format-check i stedet for verdiliste ───────────────────────────
--
-- Samme navn som før (kart_markering_symbol_gyldig) — det er navnet
-- lib/markering-symboler.ts sin kommentar peker til, og et nytt navn her ville
-- brutt den referansen uten grunn.
--
-- ^[a-z] — første tegn må være en bokstav, aldri siffer eller understrek.
-- [a-z0-9_]{0,23} — resten (opptil 23 tegn til, maks 24 tegn totalt) tillater
-- bokstaver, SIFFER og understrek. Siffer er bevisst tillatt: 'obs1'/'obs2'
-- ble valgt som id-er nedstrøms, og styrets opprinnelige forslag (kun
-- bokstaver og understrek) ville avvist nøyaktig de to.
--
-- Lengdetaket (24) og not-null består uendret fra 146: verdilisten var også
-- lengdevakten (symbol har ingen egen lengde-check), og et medlem kan POSTe
-- direkte mot PostgREST — et format-check, ikke et fravær av check.
alter table public.kart_markering
  drop constraint kart_markering_symbol_gyldig;
alter table public.kart_markering
  add constraint kart_markering_symbol_gyldig
  check (symbol ~ '^[a-z][a-z0-9_]{0,23}$');

-- ── Blokk 2: rydd bryterne migrasjon 151 opprettet ─────────────────────────
--
-- 146 og 151 er fra dette punktet semantisk DØDE: de listet konkrete
-- symbolverdier ('ol', 'mat', 'obs1', 'obs2') som constrainten ovenfor ikke
-- lenger håndhever. Vi endrer IKKE tekst-literalene i dem — en substitusjon i
-- en allerede bokført .sql-fil er usynlig for Supabase CLI (den sammenligner
-- kun versjonsnummer, ingen sjekksum av innhold) og ville latt en
-- nedstrøms-instans tro migrasjonen fortsatt sier noe den ikke lenger gjør.
--
-- Varseltyper avledet av symbolregisteret (i dag obs1_alert/obs2_alert) skal
-- fra nå IKKE seedes av en statisk migrasjon — settet er klubb-konfigurerbart,
-- og en migrasjon skrevet i dag kan ikke forutse et symbol som legges til i
-- morgen. Bryteren for en slik varseltype kommer i stedet fra registeret i
-- app-laget (innstillinger-siden flikker inn en syntetisk rad, aktiv: true,
-- for enhver symbol-varseltype som mangler en rad — speiler fallback-verdien i
-- erVarselAktiv() i lib/varsler.ts).
--
-- NAVNGITT sletting, ikke mønster: et `noekkel like '%_alert'` ville hvilt på
-- en konvensjon databasen ikke håndhever noe sted, og ville derfor kunne rive
-- med seg en bryter noen har opprettet for hånd som tilfeldigvis endte på
-- «_alert». De to radene under er nøyaktig de migrasjon 151 selv satte inn, og
-- det er de eneste denne migrasjonen har noe med å fjerne. Et femte symbol som
-- legges til SENERE får uansett aldri en seedet rad — det er hele poenget med
-- blokken — så mønsteret ville heller ikke vokst med registeret.
-- Pinnet av `__tests__/varsel-typer.test.ts`, som leser begge filene og krever
-- at listene er identiske.
--
-- `and aktiv = true` er bevisst: en bryter en admin faktisk har slått AV skal
-- ikke smyge seg tilbake på som følge av en opprydding. En rad admin har
-- deaktivert blir stående (erVarselAktiv() finner den fortsatt og respekterer
-- aktiv = false); kun rader i sin default AKTIVE tilstand fjernes, og gir dermed
-- rom for at en syntetisk rad (også aktiv = true) tar over i UI-et — samme
-- verdi, ingen atferdsendring for noen admin.
delete from public.varsel_innstillinger
where noekkel in ('obs1_alert', 'obs2_alert')
  and aktiv = true;

-- ── Blokk 3: admin må kunne SETTE INN en varselbryter ──────────────────────
--
-- Direkte følge av blokk 2: når radene ikke lenger seedes, er første klikk på
-- en slik bryter et INSERT, ikke et UPDATE. Migrasjon 009 ga kun en
-- update-policy, og 107 trimmet authenticated til `select, update` — uten det
-- under måtte skrivingen gått gjennom service role og omgått RLS helt, som er
-- nøyaktig det Policy: Auth forbyr.
--
-- Formen er kopiert fra app_innstillinger (migrasjon 111), som løste samme
-- behov for funksjonsflaggene: grant til authenticated + `with check
-- (er_admin())`. Ingen delete-grant — ingenting i appen sletter en bryter.
-- Ingen anon-grant (jf. #412-auditen): tabellen har ingen offentlig flate.
grant insert on public.varsel_innstillinger to authenticated;

create policy "Admin kan sette inn varselinnstillinger"
  on public.varsel_innstillinger for insert
  with check (er_admin());

-- Ingen GRANT for nye tabeller: ingen ny tabell opprettes her.
-- Ingen backfill: alle eksisterende kart_markering.symbol-verdier ('ol',
-- 'mat', 'obs1', 'obs2') matcher det nye formatet uendret.
