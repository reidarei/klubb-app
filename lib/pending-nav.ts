// React-fri klientmodul for push-klikk-overleveringen (#688), delt mellom
// ServiceWorkerRegistrering og /login. Se CLAUDE.md § Policy: Navigasjon.
//
// Ingen import fra lib/config — den er 'server-only' og ville kastet her.
//
// public/sw.js kan ikke importere herfra: NAV_CACHE, NAV_NOKKEL og
// PUSH_KLIKK_VINDU_MS-literalen der må holdes i synk manuelt.
// __tests__/sw-pushklikk.test.ts pinner synken.

// Bevisst UVERSJONERT: skipWaiting() + clients.claim() kan bytte SW midt i en
// cold-start fra push, og Cache Storage overlever instansbyttet (#626). Må stå
// på keep-listen i activate i sw.js. Klubbnøytralt navn fordi det deles med klubb-app.
export const NAV_CACHE = 'pwa-nav'

// Syntetisk nøkkel på et .invalid-vertsnavn (RFC 2606) — ikke «rydd» til en
// ekte path. sw.js kaller caches.match(request) uten cacheName, som søker i
// ALLE cacher; en same-origin path kunne fått overleverings-JSON-en servert
// som sideinnhold. .invalid kan aldri matche en request.url.
export const NAV_NOKKEL = 'https://pwa-nav.invalid/pending'

export type PendingNav = {
  url: string
  ts: number
  /** Korrelasjons-ID generert i notificationclick (sw.js) — se #688. */
  klikk_id?: string
  /** Antall tidligere navigasjonsforsøk mot dette målet. Loop-bryter. */
  forsok?: number
  /**
   * True når push.klikk.navigert er logget for entryen. Hindrer dobbel-logging
   * ved tilbakeskriving; målsiden logger push.klikk.landet i stedet. feil_logg
   * deduper per (event, klikk_id, forsok) siden migrasjon 154.
   */
  navigert?: boolean
}

/**
 * Leser overleveringen UTEN å slette den. Sletting skjer først når navigasjonen
 * har lyktes — ellers er målet borte hvis auth omdirigerer til /login (#688).
 * Fail-open: Cache Storage kan mangle.
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
 * Open-redirect-vakt: returnerer `pathname + search + hash` hvis `raw` er
 * same-origin, ellers null (protokoll-relativ, kryss-origin, `javascript:`,
 * malformert, eller same-origin med `//`-sti).
 *
 * Fragmentet MÅ bevares (`#kommentarer`). Det er grunnen til at målet ikke kan
 * bæres i en server-lest `?next=` — fragmentet når aldri serveren.
 */
export function lokalSti(raw: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    const url = new URL(raw, window.location.origin)
    if (url.origin !== window.location.origin) return null
    const sti = url.pathname + url.search + url.hash
    // `https://<oss>//evil.example` er same-origin, men en `//`-sti resolves av
    // location.assign()/router.push() til en ekstern origin. Ingen ekte rute
    // begynner med dobbel skråstrek (#688).
    if (sti.startsWith('//')) return null
    return sti
  } catch {
    return null
  }
}

