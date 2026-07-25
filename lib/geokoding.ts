import { BASE_URL, VAPID_CONTACT_EMAIL } from '@/lib/config'

export type Koordinat = { lat: number; lng: number }

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

  // Nominatims bruksvilkår krever en identifiserende User-Agent så de kan nå
  // oss ved misbruk. BASE_URL + kontakt-epost holder strengen klubb-nøytral
  // (ingen hardkodet klubbidentitet) og unik per instans.
  const kontakt = [BASE_URL, VAPID_CONTACT_EMAIL].filter(Boolean).join('; ')
  const userAgent = `klubb-app/1.0 (${kontakt || 'kontakt ukjent'})`

  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`

  // 5s tak: en enkelt menneskestyrt oppretting skal ikke henge på et tregt kall.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': userAgent, 'Accept-Language': 'nb,no,en' },
      signal: controller.signal,
    })
    if (!res.ok) return null
    const data = (await res.json()) as { lat?: string; lon?: string }[]
    const treff = data[0]
    if (!treff?.lat || !treff?.lon) return null
    const lat = Number(treff.lat)
    const lng = Number(treff.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng }
  } catch {
    // AbortError, nettverksfeil, ugyldig JSON — alt degraderer til «ingen coords».
    return null
  } finally {
    clearTimeout(timer)
  }
}
