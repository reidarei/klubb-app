// URL-ene for veibeskrivelse fra en kartmarkering (#711), utvidet med
// adresse-varianter for timeplan-poster (#732).
//
// Skilt ut som rene funksjoner fordi selve NAVIGERINGEN ikke lar seg teste
// meningsfullt: den setter window.location, og et custom URL-skjema gir
// verken en request Playwright kan avskjære eller en sidebytte i Chromium.
// Det som faktisk kan gå galt — at koordinatene eller adressen forsvinner,
// eller at parameternavnene er feil — er ren strengbygging, og den testes her.

/**
 * Google Maps-appens eget URL-skjema, for et koordinat.
 *
 * Brukes FØR https-varianten i en installert PWA på iOS: `window.open` med en
 * https-URL åpner en in-app-nettleser som legger seg oppå appen, og den blir
 * stående igjen etter at Maps har tatt over via universal link. App-skjemaet
 * hopper rett til appen.
 *
 * Gjør ingenting hvis Google Maps ikke er installert — derfor finnes
 * nett-varianten under som fallback.
 */
export function googleMapsAppUrl(lat: number, lng: number): string {
  return `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`
}

/**
 * Vanlig https-lenke, for et koordinat. Fallback for den som ikke har appen,
 * og den eneste varianten som gir mening utenfor iOS.
 */
export function googleMapsNettUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
}

/**
 * Samme app-skjema som over, men for en fritekst-adresse (#732). Brukt når en
 * timeplan-post har `adresse` satt — Google er bedre på gateadresser enn
 * Nominatim (vår geokoder), så navigering skal gå på TEKSTEN, ikke på et
 * koordinat vi eventuelt klarte å geokode fram.
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
 * `comgooglemaps://` FØRST, ikke https (#711). I en installert PWA på iOS
 * åpner `window.open` med en https-URL en in-app-nettleser som legger seg oppå
 * appen — observert som en merkelig hvit browser-aktig sak oppå appen — og
 * den blir stående igjen etter at Maps-appen har tatt over via universal link.
 * App-skjemaet hopper rett til appen uten det mellomleddet.
 *
 * Fallback til https etter en kort frist, for den som ikke har Google Maps
 * installert: da gjør app-skjemaet ingenting, og uten fallbacken ville knappen
 * vært død. Fristen avbrytes hvis siden mister fokus — det betyr at Maps
 * faktisk åpnet, og da skal vi ikke i tillegg åpne en nettleser.
 *
 * Flyttet hit fra PosisjonsKart.tsx (#732-uttrekk) — TimeplanRad trenger den
 * like mye som markeringsdetaljen, og navnet er endret fra `navigerTil` til
 * `aapneVeibeskrivelse` for å ikke kollidere med navigering i
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
