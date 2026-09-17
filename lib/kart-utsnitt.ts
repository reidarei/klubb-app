// Rene tall — ingen Leaflet-import (#726) — slik at logikken kan
// enhetstestes uten et DOM/Leaflet-oppsett.

export type KartBounds = { nord: number; syd: number; ost: number; vest: number }

/**
 * Sant hvis punktet ligger UTENFOR det synlige kartutsnittet.
 *
 * Brukt til å avgjøre om en fersk posisjonsoppdatering skal flytte kartet:
 * er du fortsatt innenfor det du ser på, skal kartet stå musestille — det var
 * nettopp det Reidar meldte fra om (#726). Grensene er inklusive: et punkt
 * som lander PÅ kanten regnes som innenfor.
 */
export function trengerNyttUtsnitt(bounds: KartBounds, punkt: { lat: number; lng: number }): boolean {
  return (
    punkt.lat < bounds.syd ||
    punkt.lat > bounds.nord ||
    punkt.lng < bounds.vest ||
    punkt.lng > bounds.ost
  )
}
