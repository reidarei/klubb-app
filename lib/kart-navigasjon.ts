// URL-er for veibeskrivelse fra en kartmarkering (#711) eller timeplan-post (#732).
// Rene funksjoner fordi selve navigeringen (window.location + custom URL-skjema)
// ikke lar seg teste i Playwright — strengbyggingen kan.

/**
 * Google Maps-appens URL-skjema, for et koordinat. Gjør ingenting uten appen
 * installert — derfor nett-varianten som fallback (se aapneVeibeskrivelse).
 */
export function googleMapsAppUrl(lat: number, lng: number): string {
  return `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`
}

/** Vanlig https-lenke, for et koordinat. Fallback for den som ikke har appen. */
export function googleMapsNettUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
}

/**
 * App-skjemaet for en fritekst-adresse (#732). Google er bedre på gateadresser
 * enn Nominatim, så navigering går på TEKSTEN, ikke et geokodet koordinat.
 */
export function googleMapsAppUrlAdresse(adresse: string): string {
  return `comgooglemaps://?daddr=${encodeURIComponent(adresse)}&directionsmode=driving`
}

export function googleMapsNettUrlAdresse(adresse: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(adresse)}`
}

/** Et sted å navigere til: enten et koordinat, eller en fritekst-adresse (#732). */
export type Reisemaal = { lat: number; lng: number } | { adresse: string }

/**
 * Åpner veibeskrivelse til et sted i Google Maps.
 *
 * `comgooglemaps://` FØRST (#711): i en installert iOS-PWA åpner en https-URL
 * en in-app-nettleser oppå appen, som blir stående igjen etter at Maps har tatt
 * over via universal link.
 *
 * Fallback til https etter en kort frist for den som ikke har appen (ellers
 * død knapp). Skjules siden før fristen, åpnet Maps — da ingen nettleser.
 *
 * Heter ikke `navigerTil` for å ikke kollidere med navigeringen i
 * components/ServiceWorkerRegistrering.tsx.
 */
export function aapneVeibeskrivelse(maal: Reisemaal) {
  const app = 'lat' in maal ? googleMapsAppUrl(maal.lat, maal.lng) : googleMapsAppUrlAdresse(maal.adresse)
  const nett = 'lat' in maal ? googleMapsNettUrl(maal.lat, maal.lng) : googleMapsNettUrlAdresse(maal.adresse)

  let byttet = false
  const merkBytte = () => {
    byttet = true
  }
  document.addEventListener('visibilitychange', merkBytte, { once: true })
  window.addEventListener('pagehide', merkBytte, { once: true })

  window.location.href = app

  window.setTimeout(() => {
    document.removeEventListener('visibilitychange', merkBytte)
    window.removeEventListener('pagehide', merkBytte)
    if (!byttet && !document.hidden) window.location.href = nett
  }, 700)
}
