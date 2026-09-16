// URL-ene for veibeskrivelse fra en kartmarkering (#711).
//
// Skilt ut som rene funksjoner fordi selve NAVIGERINGEN ikke lar seg teste
// meningsfullt: den setter window.location, og et custom URL-skjema gir
// verken en request Playwright kan avskjære eller en sidebytte i Chromium.
// Det som faktisk kan gå galt — at koordinatene forsvinner, eller at
// parameternavnene er feil — er ren strengbygging, og den testes her.

/**
 * Google Maps-appens eget URL-skjema.
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
 * Vanlig https-lenke. Fallback for den som ikke har appen, og den eneste
 * varianten som gir mening utenfor iOS.
 */
export function googleMapsNettUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
}
