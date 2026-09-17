// Bygging og parsing av delte steds-lenker (#719).
//
// Lenken bærer KOORDINATET, ikke en rad-id: en markering utløper etter
// KART_MARKERING_TIMER (12 timer), men en lenke i chatloggen ligger der for
// alltid — en lenke som dør er verre enn en som sentrerer på et sted uten
// boble. Fem desimaler er rundt en meters presisjon, mer enn nok for et sted
// i en by. `tekst` er valgfri og bæres av selve lenken (ikke et oppslag), så
// formatet er robust mot at kilden (markeringen) er utløpt eller slettet.

const DESIMALER = 5

export function byggStedLenke(origin: string, lat: number, lng: number, tekst?: string): string {
  const params = new URLSearchParams({
    lat: lat.toFixed(DESIMALER),
    lng: lng.toFixed(DESIMALER),
  })
  if (tekst && tekst.trim()) params.set('tekst', tekst.trim())
  return `${origin.replace(/\/$/, '')}/kart?${params.toString()}`
}

export type DeltSted = { lat: number; lng: number; tekst: string | null }

/**
 * Tolker ?lat=&lng=&tekst= fra URL-en til /kart.
 *
 * Fail-closed: alt som ikke er et gyldig koordinat gir null, ALDRI et
 * halvveis punkt — en ugyldig lenke (f.eks. `?lat=abc`) skal falle tilbake
 * til vanlig kartoppførsel, ikke krasje siden.
 */
export function parseStedParam(params: {
  lat?: string
  lng?: string
  tekst?: string
}): DeltSted | null {
  if (!params.lat || !params.lng) return null
  const lat = Number(params.lat)
  const lng = Number(params.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng, tekst: params.tekst?.trim() || null }
}
