// Delt, React-fri klientmodul for push-klikk-navigasjons-overleveringen
// (#688). Flyttet ut av components/ServiceWorkerRegistrering.tsx fordi
// app/(auth)/login/page.tsx nå MÅ kunne lese samme Cache Storage-entry uten
// å dra med seg en React-komponent.
//
// INGEN import fra lib/config: den modulen er markert 'server-only' (#687) og
// ville kastet i det øyeblikket denne fila lastes i en klientkomponent.
// INGEN React-hooks: modulen er en ren transportlag, ikke en komponent.
//
// public/sw.js er en statisk fil uten bundling og kan derfor IKKE importere
// herfra — NAV_CACHE/NAV_NOKKEL/PUSH_KLIKK_VINDU_MS-literalen der må holdes i
// synk manuelt ved endring (samme mønster som andre statisk-fil-konstanter i
// lib/konstanter.ts). __tests__/sw-pushklikk.test.ts pinner synken.

// NAV_CACHE bærer push-klikk-URL-en over et SW-versjonsbytte (#626). Bevisst
// UTEN CACHE_VERSION i navnet: install kaller skipWaiting() og activate
// kaller clients.claim(), så en cold-start fra en push kan trigge en SW-
// oppdatering FØR klienten rekker å lese overleveringen. En variabel i
// SW-minnet forsvinner med den gamle instansen; et uversjonert cache-navn
// overlever fordi Cache Storage ikke er del av noen spesifikk SW-instans sin
// heap. Se også keep-listen i public/sw.js sin activate-handler.
//
// Navnet er bevisst klubbnøytralt: Cache Storage er per origin, så et
// prefiks kjøper ingenting — og navnet speiles i sw.js og i test, som begge
// deles med nedstrøms-repoet (klubb-app).
export const NAV_CACHE = 'pwa-nav'

// Syntetisk nøkkel på et RFC 2606-reservert .invalid-hostnavn — IKKE en ekte
// path som '/__pending-nav', og ikke «rydd» den til å bli pen igjen. Grunnen:
// fetch-handleren i sw.js bruker caches.match(request) UTEN cacheName, og den
// formen søker på tvers av ALLE cacher — også denne. Med en same-origin path
// som nøkkel ville en navigasjon til den pathen kunne få overleverings-JSON-en
// servert tilbake som sidens innhold. Et .invalid-vertsnavn kan per definisjon
// aldri resolve, så ingen request.url kan noensinne matche nøkkelen.
export const NAV_NOKKEL = 'https://pwa-nav.invalid/pending'

export type PendingNav = {
  url: string
  ts: number
  /** Korrelasjons-ID generert i notificationclick (sw.js) — se #688. */
  klikk_id?: string
  /** Antall tidligere navigasjonsforsøk mot dette målet. Loop-bryter. */
  forsok?: number
  /**
   * Satt til true idet klienten har logget push.klikk.navigert for denne
   * entryen. Hindrer dobbel-logging når entryen skrives tilbake for et nytt
   * forsøk (samme klikk_id ville ellers kollidert med varsel_logg sin
   * dedup-indeks, eller — for feil_logg som ikke deduper på dette feltet —
   * gitt to rader for samme klikk).
   */
  navigert?: boolean
}

/**
 * Leser overleveringen UTEN å slette den. Dette er kjerneendringen i #688:
 * konsumering (sletting) skal skje når navigasjonen faktisk har lyktes, ikke
 * ved lesing — leser vi og sletter før auth får omdirigert oss til /login,
 * er målet borte for godt selv om vi aldri kom fram.
 *
 * Fail-open: Cache Storage kan mangle (privat modus, eldre nettleser), og en
 * kastet feil her skal aldri velte kalleren.
 */
export async function lesPendingNav(): Promise<PendingNav | null> {
  try {
    const cache = await caches.open(NAV_CACHE)
    const cached = await cache.match(NAV_NOKKEL)
    if (!cached) return null
    const data = (await cached.json()) as Partial<PendingNav> | null
    if (!data || typeof data.url !== 'string' || typeof data.ts !== 'number') return null
    return {
      url: data.url,
      ts: data.ts,
      klikk_id: typeof data.klikk_id === 'string' ? data.klikk_id : undefined,
      forsok: typeof data.forsok === 'number' ? data.forsok : undefined,
      navigert: data.navigert === true || undefined,
    }
  } catch {
    return null
  }
}

/** Eksplisitt konsumering — kalles når entryen ikke lenger skal leve videre. */
export async function slettPendingNav(): Promise<void> {
  try {
    const cache = await caches.open(NAV_CACHE)
    await cache.delete(NAV_NOKKEL)
  } catch {
    // Cache Storage utilgjengelig — ingenting å slette uansett.
  }
}

/** Tilbakeskriving — brukes til å oppdatere forsok/navigert på en levende entry. */
export async function skrivPendingNav(entry: PendingNav): Promise<void> {
  try {
    const cache = await caches.open(NAV_CACHE)
    await cache.put(NAV_NOKKEL, new Response(JSON.stringify(entry)))
  } catch {
    // Fail-open: verste utfall er at forsøkstelleren ikke økte denne runden.
  }
}

/**
 * Open-redirect-vakt: validerer at `raw` peker til noe på SAMME origin som
 * siden selv, og returnerer i så fall kun `pathname + search + hash`.
 * Returnerer `null` for alt annet — protokoll-relative URL-er (`//evil.example`),
 * absolutte kryss-origin-URL-er, `javascript:`-URL-er, malformerte strenger, og
 * same-origin URL-er hvis STI i seg selv er protokoll-relativ (`https://oss//evil.example`).
 *
 * Fragmentet (`#kommentarer`) MÅ bevares — det er selve grunnen til at et
 * push-klikk-mål ikke kan bæres i en `?next=`-query-parameter: fragmentet
 * sendes aldri til serveren i utgangspunktet, så en løsning basert på en
 * server-lest parameter ville alltid mistet det. `new URL(...).pathname`
 * alene (slik server-siden sanering i lib/logg-sanitering.ts gjør, med vilje,
 * for feil_logg) ville reintrodusert nøyaktig det tapet her.
 */
export function lokalSti(raw: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    const url = new URL(raw, window.location.origin)
    if (url.origin !== window.location.origin) return null
    const sti = url.pathname + url.search + url.hash
    // Origin-sjekken alene er ikke nok: `https://<vår-origin>//evil.example`
    // er same-origin, men pathname blir `//evil.example` — en PROTOKOLL-
    // RELATIV URL. Kallstedene mater resultatet rett inn i
    // window.location.assign() og router.push(), og begge resolver `//host`
    // til en ekstern origin. Avvist her så alle kallsteder dekkes ett sted
    // (review av #688). Ingen ekte rute i appen begynner med dobbel skråstrek.
    if (sti.startsWith('//')) return null
    return sti
  } catch {
    return null
  }
}

