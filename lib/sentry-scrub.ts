// Felles PII-scrubbing for Sentry-events. Brukes av både
// sentry.server.config.ts og sentry.edge.config.ts slik at whitelist
// og request-scrubbing ikke drifter fra hverandre mellom runtime-ene.
// Se #366 for bakgrunn.

import type * as Sentry from '@sentry/nextjs'

// Hvilke felter vi tillater i Sentry-events fra server/edge-siden.
// Speiler whitelist i lib/logg.ts og lib/api/logg-feil.
// 'ctx' er med her fordi logg.feil bruker scope.setContext('ctx', ...)
// — men noen kode-stier setter det som extra og da må nøkkelen slippe gjennom.
export const SERVER_WHITELIST = new Set([
  'profil_id',
  'arrangement_id',
  'event',
  'code',
  'tabell',
  'fingerprint',
  'count',
  'nivaa',
  'ctx',
])

export function scrubbEvent(
  event: Sentry.ErrorEvent,
): Sentry.ErrorEvent | null {
  // Skrubb extra-felter — beholder kun whitelist-godkjente nøkler.
  if (event.extra) {
    const renset: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(event.extra)) {
      if (SERVER_WHITELIST.has(k)) renset[k] = v
    }
    event.extra = renset
  }
  // Fjern request-body, headers og cookies — kan inneholde bruker-payload.
  if (event.request) {
    delete event.request.data
    delete event.request.headers
    delete event.request.cookies
  }
  return event
}
