// Felles PII-scrubbing for Sentry-events, delt av server- og edge-config så de
// ikke drifter (#366). onRequestError i instrumentation.ts filtrerer ingenting
// selv, så denne fila er eneste vern for exception-meldingene (#498).

import type * as Sentry from '@sentry/nextjs'

// Tillatte extra-nøkler. Speiler whitelist i lib/logg.ts og lib/api/logg-feil.
// 'ctx' fordi noen kodestier setter den som extra i stedet for setContext.
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

// ─── DROPPLISTE (kjente auth-/valideringsmeldinger) ─────────────────────────
// Forventet brukeradferd, ikke programfeil. 'Ikke innlogget' ville druknet
// ekte signal: iOS ITP spiser cookies, og sesjonen dør midt i en action.
const DROPPEDE_MELDINGER = new Set([
  'Ikke innlogget',
  'Ikke admin',
  'Kun generalsekretær kan løse tiebreak',
])

function erDroppetMelding(melding: string | undefined): boolean {
  return typeof melding === 'string' && DROPPEDE_MELDINGER.has(melding)
}

// ─── MASKERING AV RADVERDIER ────────────────────────────────────────────────
// PostgREST-meldinger har form «Key (epost)=(x@y.no) already exists», og
// `throw new Error(error.message)` sender dem rått videre.
// Grådig per linje ([^\n]*), ikke [^)]*: radverdien kan selv inneholde «)»
// (kallenavn i parentes). Over-maskering er riktig feilretning (#498).
// Én implementasjon, delt med lib/logg.ts (#631) — to kopier ville drevet.
export function maskerRadverdier(melding: string): string {
  return melding.replace(/=\([^\n]*\)/g, '=(…)')
}

// ─── BREADCRUMBS ────────────────────────────────────────────────────────────
// consoleIntegration gjør hver console.log til en breadcrumb, og logg.feil()
// logger meldingen umaskert — breadcrumben ville lekket PII-en beforeSend
// maskerte (#498). Hele kategorien droppes: stdout finnes uansett i Vercel,
// og en droppet kanal kan ikke lekke.
// MÅ kobles i både server- og edge-config (pinnet i __tests__/sentry-scrub.test.ts).
export function beforeBreadcrumb(
  breadcrumb: Sentry.Breadcrumb,
): Sentry.Breadcrumb | null {
  if (breadcrumb.category === 'console') return null
  return breadcrumb
}

export function scrubbEvent(
  event: Sentry.ErrorEvent,
): Sentry.ErrorEvent | null {
  const exceptionMeldinger = event.exception?.values?.map(v => v.value)
  if (exceptionMeldinger?.some(erDroppetMelding) || erDroppetMelding(event.message)) {
    return null
  }

  // event.message dekker captureMessage-stier.
  if (event.exception?.values) {
    for (const verdi of event.exception.values) {
      if (typeof verdi.value === 'string') verdi.value = maskerRadverdier(verdi.value)
    }
  }
  if (typeof event.message === 'string') {
    event.message = maskerRadverdier(event.message)
  }

  if (event.extra) {
    const renset: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(event.extra)) {
      if (SERVER_WHITELIST.has(k)) renset[k] = v
    }
    event.extra = renset
  }
  // url også: ingenting holder query-strengen fri for PII. Rutenavnet
  // finnes fortsatt i transaction (#498).
  if (event.request) {
    delete event.request.data
    delete event.request.headers
    delete event.request.cookies
    delete event.request.url
  }
  return event
}
