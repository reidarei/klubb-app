# Geokoding — koordinater til Stedene-kartet

Stedene-kartet (`/stedene`, lenket fra Klubb-fanen) plotter alle tur-arrangementer
på et Europakart. For å plassere en markør trenger vi koordinater (`lat`/`lng`)
for hver tur. Disse **lagres på selve arrangementet** — ikke i en hardkodet
by-tabell — slik at kartet virker generisk for enhver klubb og for enhver ny by,
uten at noen må redigere kode.

## Hvordan det virker

1. Når en tur opprettes eller redigeres med en `destinasjon` (fritekst, typisk et
   bynavn), geokoder `opprettArrangement` / `oppdaterArrangement` teksten til
   koordinat via `geokod()` i [`lib/geokoding.ts`](../lib/geokoding.ts).
2. `lat`/`lng` lagres på `arrangementer`-raden (kolonner lagt til i migrasjon
   `118_arrangement_koordinater.sql`).
3. Kart-siden ([`app/(app)/stedene/page.tsx`](../app/(app)/stedene/page.tsx)) leser
   `lat`/`lng` direkte og projiserer dem med `projiser()` fra
   `lib/europa-kart-data.ts`. Turer uten coords listes som «ikke plottet».

## Ekstern avhengighet: Nominatim (OpenStreetMap)

Geokodingen bruker OpenStreetMaps offentlige **Nominatim**-tjeneste.

- **Nøkkelfri.** Ingen registrering, ingen API-nøkkel, ingen miljøvariabel. Dette
  er bevisst valgt så en åpen mal virker for enhver klubb uten oppsett.
- **User-Agent kreves.** Nominatims [bruksvilkår](https://operations.osmfoundation.org/policies/nominatim/)
  krever en identifiserende `User-Agent`. Den bygges automatisk fra `BASE_URL` +
  `VAPID_CONTACT_EMAIL` (`klubb-app/1.0 (<url>; <epost>)`).
- **Rate limit: maks 1 req/sek.** I appen skjer geokoding kun ved oppretting/
  redigering av en tur (sjelden, menneskestyrt) — godt innenfor grensen.
  Bulk-scriptet `scripts/geokod-eksisterende-turer.mjs` struper eksplisitt til
  ~1 req/sek.
- **Best-effort.** `geokod()` har 5s timeout og returnerer `null` ved feil,
  timeout eller null-treff. Oppretting av en tur blokkeres aldri av at tjenesten
  er treg eller nede — turen lagres bare uten coords og plottes ikke (før den
  eventuelt re-geokodes ved en senere redigering).

## Bytte geokoding-tjeneste

Vil man heller bruke en betalt tjeneste (Mapbox, Google, OpenCage) med høyere
rate limit og treffsikkerhet, er `geokod()` det eneste stedet å endre — signaturen
(`(sted: string) => Promise<{lat, lng} | null>`) er tjeneste-uavhengig. Husk at en
nøkkelbasert tjeneste krever at hver klubb-app-instans setter opp egen nøkkel.

## Etterslep / historiske turer

Turer som ble backfillet før geokoding fantes (eller via SQL/script utenom
skjemaet) har ikke coords automatisk. Kjør engangs-scriptet:

```bash
node --env-file=.env.local scripts/geokod-eksisterende-turer.mjs
```

Det finner turer med `destinasjon` men uten `lat`/`lng`, geokoder dem strupt til
1 req/sek, og oppdaterer radene.
