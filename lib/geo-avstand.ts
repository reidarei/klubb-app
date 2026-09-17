// Avstand mellom to koordinater, og norsk formatering av den (#728).
//
// avstandM() er flyttet ordrett ut av lib/actions/posisjon.ts — den filen er
// 'use server' og kan derfor ikke importeres fra en klientkomponent, mens
// avstand til en markering/timeplan-post skal vises direkte i UI-et.

const JORDRADIUS_M = 6_371_000

/** Avstand i meter mellom to punkter (haversine). Jorda som kule er mer enn presist nok på gatenivå. */
export function avstandM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = (g: number) => (g * Math.PI) / 180
  const dLat = rad(bLat - aLat)
  const dLng = rad(bLng - aLng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * JORDRADIUS_M * Math.asin(Math.sqrt(h))
}

/**
 * Norsk lesbar avstand: «120 m» avrundet til nærmeste 10 meter under 1000 m,
 * ellers «1,4 km» med komma som desimalskille (#728).
 */
export function formaterAvstand(meter: number): string {
  if (meter < 1000) {
    const avrundet = Math.round(meter / 10) * 10
    return `${avrundet} m`
  }
  const km = (meter / 1000).toFixed(1).replace('.', ',')
  return `${km} km`
}
