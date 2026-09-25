'use server'

import { ensureInnlogget } from '@/lib/auth'
import { sokSteder, type Koordinat, type StedSokUtfall } from '@/lib/geokoding'
import { logg } from '@/lib/logg'
import {
  STED_SOK_MIN_LENGDE,
  STED_SOK_MAKS_LENGDE,
  STED_SOK_CACHE_SEK,
  NOMINATIM_MIN_AVSTAND_MS,
} from '@/lib/konstanter'

// Klientens diskriminerte resultat: StedSokUtfall pluss et 'ugyldig'-utfall
// for input som aldri når Nominatim (for kort/lang søketekst).
export type SokStedResultat = StedSokUtfall | { utfall: 'ugyldig'; melding: string }

// In-memory cache med TTL — IKKE unstable_cache. Nominatims bruksvilkår
// krever caching av respons; en enkel Map per server-instans er enklere å
// resonnere om og å teste enn next/cache sin Data Cache (som forutsetter en
// request-kontekst vi ikke alltid har i en vitest-kjøring), og «cachet i
// minuttvis, ikke evig, per varm instans» er godt nok for et interaktivt
// søk. Feil caches ALDRI — kun 'treff' og 'ingen' er verdt å lagre.
type CacheRad = { utfall: StedSokUtfall; utlop: number }
const cache = new Map<string, CacheRad>()

// Samtidige søk med samme cache-nøkkel deler ett utgående kall (coalescing).
// Ryddes når kallet er ferdig, så en feil ikke henger igjen som et «svar».
const iFlyt = new Map<string, Promise<StedSokUtfall>>()

// Tidligste tidspunkt (ms) neste utgående Nominatim-kall får starte. Per
// instans — Vercel kan kjøre flere, se docs/geokoding.md.
let nesteLedigeLuke = 0

// Reserverer luken FØR vi venter, så to samtidige kall aldri får samme luke.
// Ingen lås trengs: JS kjører entrådet mellom to await.
async function ventPaaLuke(): Promise<void> {
  const naa = Date.now()
  const start = Math.max(naa, nesteLedigeLuke)
  nesteLedigeLuke = start + NOMINATIM_MIN_AVSTAND_MS
  if (start > naa) await new Promise(r => setTimeout(r, start - naa))
}

// Selve rundturen til Nominatim: struping, logging og caching av svaret.
async function hentFraNominatim(
  sok: string,
  naer: Koordinat | null,
  noekkel: string,
): Promise<StedSokUtfall> {
  await ventPaaLuke()
  const svar = await sokSteder(sok, naer ?? undefined)

  if (svar.utfall === 'tidsavbrudd') {
    logg.warn('kart.sok.tidsavbrudd')
    return svar
  }
  if (svar.utfall === 'feil') {
    // Awaites: logg.feil() persisterer async, og Vercel kan fryse instansen
    // så snart svaret er returnert — da ville feilraden aldri blitt skrevet.
    await logg.feil('kart.sok.feilet', new Error('Nominatim-søk feilet'))
    return svar
  }

  // Kun 'treff' og 'ingen' caches — en tjeneste som er nede akkurat nå skal
  // ikke late som den er tom for alltid.
  cache.set(noekkel, { utfall: svar, utlop: Date.now() + STED_SOK_CACHE_SEK * 1000 })
  return svar
}

function cacheNoekkel(q: string, naer: Koordinat | null): string {
  const naerNoekkel = naer
    ? `${Math.round(naer.lat * 10) / 10},${Math.round(naer.lng * 10) / 10}`
    : ''
  return `${q.toLowerCase()}|${naerNoekkel}`
}

/**
 * Interaktivt stedssøk fra kartet (#757). Kalles KUN ved eksplisitt trykk
 * (Enter/knapp i StedSok.tsx) — aldri fra en onChange-handler, jf.
 * Nominatims forbud mot autocomplete-søk.
 *
 * Søketeksten logges ALDRI — verken ved treff, tidsavbrudd eller feil.
 */
export async function sokSted(q: string, naer: Koordinat | null): Promise<SokStedResultat> {
  await ensureInnlogget()

  const sok = q.trim()
  if (sok.length < STED_SOK_MIN_LENGDE) {
    return { utfall: 'ugyldig', melding: `Skriv minst ${STED_SOK_MIN_LENGDE} tegn.` }
  }
  if (sok.length > STED_SOK_MAKS_LENGDE) {
    return { utfall: 'ugyldig', melding: `Maks ${STED_SOK_MAKS_LENGDE} tegn.` }
  }

  const noekkel = cacheNoekkel(sok, naer)
  const cachet = cache.get(noekkel)
  if (cachet && cachet.utlop > Date.now()) return cachet.utfall

  const paagaar = iFlyt.get(noekkel)
  if (paagaar) return paagaar

  const nytt = hentFraNominatim(sok, naer, noekkel).finally(() => iFlyt.delete(noekkel))
  iFlyt.set(noekkel, nytt)
  return nytt
}
