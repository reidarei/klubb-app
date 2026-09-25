import { BASE_URL, VAPID_CONTACT_EMAIL } from '@/lib/config'
import { GEOKODING_TIMEOUT_MS, STED_SOK_MAKS_TREFF, STED_SOK_VIEWBOX_GRADER } from '@/lib/konstanter'

export type Koordinat = { lat: number; lng: number }

// Nominatims bruksvilkår krever en identifiserende User-Agent så de kan nå
// oss ved misbruk. BASE_URL + kontakt-epost holder strengen klubb-nøytral
// (ingen hardkodet klubbidentitet) og unik per instans.
function nominatimUserAgent(): string {
  const kontakt = [BASE_URL, VAPID_CONTACT_EMAIL].filter(Boolean).join('; ')
  return `klubb-app/1.0 (${kontakt || 'kontakt ukjent'})`
}

// Felles fetch mot Nominatims /search-endepunkt — bygger URL-en fra en
// query-param-liste, setter User-Agent/Accept-Language og håndhever
// GEOKODING_TIMEOUT_MS. Kaster ved timeout (AbortError), nettverksfeil eller
// ikke-OK status — kallerne (geokod, sokSteder) avgjør selv hva en feil skal
// bety for DEM (geokod: null, sokSteder: eget 'feil'-utfall).
async function nominatimFetch(params: Record<string, string>): Promise<unknown> {
  const q = new URLSearchParams(params).toString()
  const url = `https://nominatim.openstreetmap.org/search?${q}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GEOKODING_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': nominatimUserAgent(), 'Accept-Language': 'nb,no,en' },
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`Nominatim svarte ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

// Geokoder et fritekst-sted (typisk et bynavn) til koordinat via Nominatim
// (OpenStreetMap). Keyless — hver klubb-app-instans slipper å registrere seg
// for en API-nøkkel, noe som er hele poenget for en åpen mal.
//
// Server-side only (kalles fra server actions). Best-effort: returnerer null
// ved feil, timeout eller null-treff, slik at oppretting av en tur aldri
// blokkeres av at geokoding-tjenesten er treg eller nede. Se docs/geokoding.md.
export async function geokod(sted: string): Promise<Koordinat | null> {
  const q = sted.trim()
  if (!q) return null

  try {
    const data = (await nominatimFetch({ format: 'json', limit: '1', q })) as {
      lat?: string
      lon?: string
    }[]
    const treff = data[0]
    if (!treff?.lat || !treff?.lon) return null
    const lat = Number(treff.lat)
    const lng = Number(treff.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng }
  } catch {
    // AbortError, nettverksfeil, ugyldig JSON, ikke-OK status — alt
    // degraderer til «ingen coords».
    return null
  }
}

export type StedTreff = {
  id: string
  navn: string
  beskrivelse: string
  lat: number
  lng: number
}

export type StedSokUtfall =
  | { utfall: 'treff'; treff: StedTreff[] }
  | { utfall: 'ingen' }
  | { utfall: 'tidsavbrudd' }
  | { utfall: 'feil' }

type NominatimSokRad = {
  place_id?: number | string
  name?: string
  display_name?: string
  lat?: string
  lon?: string
}

// Interaktivt stedssøk (#757) — søker ETT KALL per eksplisitt trykk (aldri
// søk-mens-du-skriver, se StedSok.tsx), og returnerer flere kandidater i
// stedet for å gjette på limit=1. `naer` vekter treff mot kartets nåværende
// senter via en viewbox — se STED_SOK_VIEWBOX_GRADER.
//
// Returnerer et diskriminert utfall FRAMFOR å svelge feil til null (#757):
// geokod() sin stille best-effort-form passer en bakgrunnsberikelse, ikke et
// interaktivt søk der brukeren venter på et svar og MÅ få vite om det ikke
// kom noe.
export async function sokSteder(q: string, naer?: Koordinat): Promise<StedSokUtfall> {
  const sok = q.trim()
  if (!sok) return { utfall: 'ingen' }

  const params: Record<string, string> = {
    format: 'jsonv2',
    limit: String(STED_SOK_MAKS_TREFF),
    q: sok,
  }
  if (naer) {
    // Rundet til 1 desimal — presist nok til å vekte riktig by/region, upresist
    // nok til at vi ikke lekker brukerens eksakte posisjon i en URL som (i
    // praksis) logges av Nominatims drift, ikke vår egen.
    const lat = Math.round(naer.lat * 10) / 10
    const lng = Math.round(naer.lng * 10) / 10
    const d = STED_SOK_VIEWBOX_GRADER
    // viewbox=<venstre>,<topp>,<høyre>,<bunn> — lng-d,lat+d,lng+d,lat-d.
    params.viewbox = `${lng - d},${lat + d},${lng + d},${lat - d}`
    // bounded=0: boksen er en PREFERANSE (vekter rangeringen), ikke et
    // filter — et reelt treff utenfor boksen skal fortsatt komme med.
    params.bounded = '0'
  }

  try {
    const data = (await nominatimFetch(params)) as unknown
    if (!Array.isArray(data)) throw new Error('Uventet svarformat fra Nominatim')
    const rader = data as NominatimSokRad[]
    if (rader.length === 0) return { utfall: 'ingen' }

    const treff: StedTreff[] = []
    for (const rad of rader) {
      if (!rad.lat || !rad.lon || !rad.display_name) continue
      const lat = Number(rad.lat)
      const lng = Number(rad.lon)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
      treff.push({
        id: String(rad.place_id ?? `${lat},${lng}`),
        navn: rad.name || rad.display_name.split(',')[0].trim(),
        beskrivelse: rad.display_name,
        lat,
        lng,
      })
    }
    return treff.length > 0 ? { utfall: 'treff', treff } : { utfall: 'ingen' }
  } catch (err) {
    // `.name`, ikke `instanceof Error`: AbortController kaster en
    // DOMException, og DOMException arver IKKE fra Error i Node/undici —
    // en instanceof-vakt her ville aldri truffet timeout-grenen.
    if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') {
      return { utfall: 'tidsavbrudd' }
    }
    return { utfall: 'feil' }
  }
}
