import 'server-only'

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import {
  erBlokkertVert,
  erPrivatIp,
  parseForhaandsvisning,
  type Forhaandsvisning,
} from '@/lib/lenke-forhaandsvisning-core'
import {
  LENKE_CACHE_SEK,
  LENKE_HENT_MAKS_BYTES,
  LENKE_HENT_TIDSGRENSE_MS,
  LENKE_MAKS_OMDIRIGERINGER,
} from '@/lib/konstanter'

// Henter tittel/bilde for en lenke et medlem har delt i chatten.
//
// In-memory cache per server-instans (samme valg som sted-sok.ts): enkel å
// resonnere om, og telefonens HTTP-cache (satt i ruta) tar de fleste gjentatte
// visninger uansett. «Siden har ingen tittel» (null) caches — det er et svar.
// Nettverksfeil og tidsavbrudd caches IKKE, så et nettsted som var nede
// et øyeblikk får nytt forsøk neste gang noen åpner chatten.

type CacheRad = { verdi: Forhaandsvisning | null; utlop: number }
const cache = new Map<string, CacheRad>()
const iFlyt = new Map<string, Promise<Forhaandsvisning | null | undefined>>()
const CACHE_MAKS_RADER = 500

class IkkeHentbar extends Error {}

/** Kaster hvis verten peker til et internt nett. Sjekker ALLE DNS-svar. */
async function sjekkVert(u: URL): Promise<void> {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new IkkeHentbar('protokoll')
  if (u.port && u.port !== '80' && u.port !== '443') throw new IkkeHentbar('port')
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (erBlokkertVert(host)) throw new IkkeHentbar('vert')
  const adresser = isIP(host) ? [host] : (await lookup(host, { all: true })).map(a => a.address)
  if (adresser.length === 0 || adresser.some(erPrivatIp)) throw new IkkeHentbar('privat adresse')
  // Kjent restrisiko: DNS-rebinding (et annet svar ved selve fetch-en enn ved
  // oppslaget). Vi får bare tilbake tittel og bilde-URL, aldri råinnhold, så
  // gevinsten for en angriper er liten.
}

/** Leser kroppen til og med </head>, maks LENKE_HENT_MAKS_BYTES. */
async function lesHead(res: Response): Promise<string> {
  const charset = res.headers.get('content-type')?.match(/charset=([\w-]+)/i)?.[1] ?? 'utf-8'
  let dekoder: TextDecoder
  try { dekoder = new TextDecoder(charset) } catch { dekoder = new TextDecoder('utf-8') }
  const leser = res.body?.getReader()
  if (!leser) return ''
  let html = ''
  let bytes = 0
  while (bytes < LENKE_HENT_MAKS_BYTES) {
    const { done, value } = await leser.read()
    if (done) break
    bytes += value.byteLength
    html += dekoder.decode(value, { stream: true })
    if (/<\/head>/i.test(html)) break
  }
  await leser.cancel().catch(() => {})
  return html
}

async function hent(start: string): Promise<Forhaandsvisning | null> {
  let url = new URL(start)
  const signal = AbortSignal.timeout(LENKE_HENT_TIDSGRENSE_MS)
  // Omdirigeringer følges manuelt, så vakta kjører på HVER adresse —
  // ellers kunne en ekstern side sende oss videre til en intern.
  for (let hopp = 0; hopp <= LENKE_MAKS_OMDIRIGERINGER; hopp++) {
    await sjekkVert(url)
    const res = await fetch(url, {
      redirect: 'manual',
      signal,
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LinkPreview/1.0)',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'nb-NO,nb;q=0.9,no;q=0.8,en;q=0.5',
      },
    })
    const videre = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && videre) {
      await res.body?.cancel().catch(() => {})
      url = new URL(videre, url)
      continue
    }
    if (!res.ok || !/html/i.test(res.headers.get('content-type') ?? '')) {
      await res.body?.cancel().catch(() => {})
      return null
    }
    return parseForhaandsvisning(await lesHead(res), url.toString())
  }
  return null
}

/**
 * Forhåndsvisning for en (normalisert) lenke. `null` = siden har ingen
 * forhåndsvisning (varig svar), `undefined` = hentingen feilet midlertidig
 * (nettverk, tidsavbrudd) og skal ikke caches noe sted. Kaster aldri — et
 * nettsted som feiler er normal drift, ikke en feil i appen, og skal ikke
 * fylle feil_logg.
 */
export async function hentForhaandsvisning(
  href: string,
): Promise<Forhaandsvisning | null | undefined> {
  const naa = Date.now()
  const treff = cache.get(href)
  if (treff && treff.utlop > naa) return treff.verdi

  const paagaar = iFlyt.get(href)
  if (paagaar) return paagaar

  const jobb = hent(href)
    .then(verdi => {
      if (cache.size >= CACHE_MAKS_RADER) cache.delete(cache.keys().next().value!)
      cache.set(href, { verdi, utlop: naa + LENKE_CACHE_SEK * 1000 })
      return verdi
    })
    .catch(() => undefined)
    .finally(() => iFlyt.delete(href))
  iFlyt.set(href, jobb)
  return jobb
}
