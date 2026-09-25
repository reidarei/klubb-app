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

## Sensurert destinasjon (blåtur)

En tur kan ha `destinasjon` markert som sensurert i `sensurerte_felt` (blåtur —
kun arrangøren ser gjennom sladden). Da må koordinatene **ikke** finnes noe sted
de kan avsløre hemmeligheten. To lag sikrer det:

1. **Geokodes ikke.** `opprettArrangement`/`oppdaterArrangement` hopper over
   geokoding når `sensurerte_felt.destinasjon === true`, så `lat`/`lng` forblir
   null. Slås sladden PÅ for en tur som alt var plottet, nulles coords ved neste
   lagring — turen forsvinner fra kartet.
2. **Kartet filtrerer defensivt.** `/stedene` plotter aldri en sensurert tur, og
   sender ikke den ekte byen til klienten (vises kun som låst i tidslinja) — selv
   om en coord mot formodning skulle ligge på raden.

Fjernes sladden (arrangøren redigerer og skrur den av), geokodes destinasjonen og
turen dukker opp på kartet som normalt.

## Bytte geokoding-tjeneste

Vil man heller bruke en betalt tjeneste (Mapbox, Google, OpenCage) med høyere
rate limit og treffsikkerhet, er `geokod()` det eneste stedet å endre — signaturen
(`(sted: string) => Promise<{lat, lng} | null>`) er tjeneste-uavhengig. Husk at en
nøkkelbasert tjeneste krever at hver klubb-app-instans setter opp egen nøkkel.


## Interaktivt stedssøk

Kartet (`/kart`) har en egen søkeknapp — `components/kart/StedSok.tsx`, kalt via
server-actionen `sokSted()` i `lib/actions/sted-sok.ts`, som bruker `sokSteder()`
i `lib/geokoding.ts`. Samme Nominatim-tjeneste som `geokod()` over, men en annen
form: flere kandidater (`STED_SOK_MAKS_TREFF`, i dag 5) i stedet for `limit=1`, og
et diskriminert utfall (`treff` / `ingen` / `tidsavbrudd` / `feil`) i stedet for en
stille `null` — et interaktivt søk der brukeren venter på svar må få vite om det
ikke kom noe.

- **Kun eksplisitt trykk.** Nominatims bruksvilkår forbyr autocomplete/søk-mens-
  du-skriver. `StedSok.tsx` søker ALDRI fra en `onChange`-handler — kun ved Enter
  eller et knappetrykk, akkurat som `opprettArrangement`/`oppdaterArrangement`
  allerede gjør ved å geokode kun ved lagring.
- **Rate limit-grensen er PR APPEN, ikke per funksjon.** `geokod()` og
  `sokSteder()` deler samme 1 req/s-hensyn — begge er menneskestyrte handlinger
  (lagre en tur, trykke søk), og ingen av dem kan i praksis nærme seg grensen.
- **Strupingen er per server-instans, ikke global.** `sokSted()` har to billige
  vakter: samtidige søk med samme cache-nøkkel deler ett utgående kall
  (coalescing), og to utgående kall fra samme instans holdes minst
  `NOMINATIM_MIN_AVSTAND_MS` (1000 ms) fra hverandre — det neste *venter* på
  luken. Vercel kan kjøre flere instanser samtidig, og hver har sin egen klokke og
  sin egen kø.
- **Caching er påkrevd av vilkårene**, og server-actionen `sokSted()` cacher
  `treff`/`ingen`-svar i en in-memory `Map` med TTL `STED_SOK_CACHE_SEK` (7
  dager). `tidsavbrudd`/`feil` caches ALDRI — en tjeneste som er nede akkurat nå
  skal ikke late som den er tom for alltid. `geokod()` selv cacher fortsatt IKKE
  — den kalles sjelden nok (kun ved lagring av en tur) at det ikke er verdt kompleksiteten.
- **Viewbox, ikke filter.** Har søket et kartsenter å vekte mot (`naer`), sendes
  Nominatims `viewbox`-parameter med `bounded=0` — en PREFERANSE som rangerer
  nære treff høyere, men aldri utelukker et reelt treff langt unna. Se
  `STED_SOK_VIEWBOX_GRADER` i `lib/konstanter.ts`.
- **Søketeksten logges aldri** — verken ved treff, tidsavbrudd eller feil (kun
  event-navnet, se `lib/logg.ts`).
- Et valgt treff er PRIVAT og MIDLERTIDIG inntil brukeren går videre: «Sett
  markering her» ruter gjennom den eksisterende sikte-/bekreftelsesflyten
  (`bekreftSted()` i `PosisjonsKart.tsx`) før noe lagres som en delt `kart_markering`-rad.

## Etterslep / historiske turer

Turer som ble backfillet før geokoding fantes (eller via SQL/script utenom
skjemaet) har ikke coords automatisk. Kjør engangs-scriptet:

```bash
node --env-file=.env.local scripts/geokod-eksisterende-turer.mjs
```

Det finner turer med `destinasjon` men uten `lat`/`lng`, geokoder dem strupt til
1 req/sek, og oppdaterer radene.
