// Geografi-oppslag: bynavn → koordinat. Kun geografi (universelt), ingen
// klubbdata — trygt å speile til klubb-app. Nøkkelen matcher `destinasjon`
// slik den lagres på tur-arrangementer (se scripts/seed-tur-steder.mjs).
//
// Legger man en tur til en ny by, legg byen til her for at den skal vises på
// kartet. Ukjente byer utelates stille (og listes under kartet som «ikke plottet»).

export type Koordinat = { lat: number; lng: number }

export const BY_KOORDINATER: Record<string, Koordinat> = {
  Riga: { lat: 56.95, lng: 24.11 },
  München: { lat: 48.14, lng: 11.58 },
  København: { lat: 55.68, lng: 12.57 },
  Helsinki: { lat: 60.17, lng: 24.94 },
  Barcelona: { lat: 41.39, lng: 2.16 },
  Berlin: { lat: 52.52, lng: 13.4 },
  Kraków: { lat: 50.06, lng: 19.94 },
  Athen: { lat: 37.98, lng: 23.73 },
  Málaga: { lat: 36.72, lng: -4.42 },
  Paris: { lat: 48.86, lng: 2.35 },
  Madrid: { lat: 40.42, lng: -3.7 },
}
