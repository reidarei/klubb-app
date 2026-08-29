// Felles PII-scrubbing for Sentry-events. Brukes av både
// sentry.server.config.ts og sentry.edge.config.ts slik at whitelist
// og request-scrubbing ikke drifter fra hverandre mellom runtime-ene.
// Se #366 for bakgrunn, #498 for exception-meldings-scrubbingen.
//
// #498: denne fila MÅ dekke exception-meldingen før onRequestError
// (instrumentation.ts) slås på — @sentry/nextjs sin captureRequestError gjør
// null filtrering selv, så «alt Next.js sender inn» blir ellers
// captureException rått.

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

// ─── DROPPLISTE (kjente auth-/valideringsmeldinger) ─────────────────────────
// Disse kastes fra forventet brukeradferd, ikke programfeil — men
// onRequestError (#498) sender ALT som kastes videre til Sentry uansett.
// 'Ikke innlogget' fra ensureInnlogget() blir garantert topp-issue på volum:
// iOS ITP spiser cookies rutinemessig, og sesjonen dør midt i en action.
// Uten denne droppen ville den drukne ekte signal i Sentry-UI-et.
const DROPPEDE_MELDINGER = new Set([
  'Ikke innlogget',
  'Ikke admin',
  'Kun generalsekretær kan løse tiebreak',
])

function erDroppetMelding(melding: string | undefined): boolean {
  return typeof melding === 'string' && DROPPEDE_MELDINGER.has(melding)
}

// ─── MASKERING AV RADVERDIER ────────────────────────────────────────────────
// PostgREST-feilmeldinger har form «Key (epost)=(x@y.no) already exists» —
// verdien etter «=» er en rad-verdi og kan være e-post, navn eller
// telefonnummer. `throw new Error(error.message)` forekommer 56 ganger i
// lib/actions/ og sender dette rått videre til Sentry via onRequestError
// uten denne masken.
//
// Grådig match per linje ([^\n]*) — IKKE [^)]* — fordi radverdien selv kan
// inneholde «)»: klubben bruker kallenavn i parentes, så «Key (navn)=(Ola
// (Reka) Nordmann) already exists» er en reell form. Non-greedy stoppet på
// første indre parentes og lot etternavnet overleve. Over-maskering er riktig
// feilretning her — flere «=(...)»-par på SAMME linje slås sammen til én
// maske, altså for mye skjult, ikke for lite. Se #498-review (MINOR 4).
// Eksportert fordi lib/logg.ts bruker samme maske før render-feilmeldingen
// skrives til feil_logg (#631). Masken må være ÉN implementasjon: to kopier
// ville drevet fra hverandre, og den ene ville lekket det den andre skjulte.
export function maskerRadverdier(melding: string): string {
  return melding.replace(/=\([^\n]*\)/g, '=(…)')
}

// ─── BREADCRUMBS ────────────────────────────────────────────────────────────
// consoleIntegration er default-PÅ i @sentry/node: hver console.log blir en
// breadcrumb, og inntil 100 av dem henger på hvert event. logg.feil()
// console-logger `melding` rått (PostgREST-teksten med radverdier) rett før
// captureException — breadcrumben bar dermed akkurat den PII-en beforeSend
// nettopp maskerte bort fra exception-verdien. Verifisert eksperimentelt mot
// @sentry/node 10.63.0 i #498-review (BLOCKER).
//
// Vi dropper hele console-kategorien i stedet for å maskere den: stdout-loggen
// finnes uansett i Vercel, breadcrumbene tilfører ingenting vi ikke har, og en
// droppet kanal kan ikke lekke.
//
// MÅ kobles på i BÅDE sentry.server.config.ts og sentry.edge.config.ts —
// __tests__/sentry-scrub.test.ts pinner begge koblingene.
export function beforeBreadcrumb(
  breadcrumb: Sentry.Breadcrumb,
): Sentry.Breadcrumb | null {
  if (breadcrumb.category === 'console') return null
  return breadcrumb
}

export function scrubbEvent(
  event: Sentry.ErrorEvent,
): Sentry.ErrorEvent | null {
  // Droppliste FØR noe annet skrubbes — ingen vits i å rense et event vi
  // uansett kaster.
  const exceptionMeldinger = event.exception?.values?.map(v => v.value)
  if (exceptionMeldinger?.some(erDroppetMelding) || erDroppetMelding(event.message)) {
    return null
  }

  // Masker rad-verdier i exception-meldinger og i et eventuelt fritt
  // message-felt (captureMessage-stier).
  if (event.exception?.values) {
    for (const verdi of event.exception.values) {
      if (typeof verdi.value === 'string') verdi.value = maskerRadverdier(verdi.value)
    }
  }
  if (typeof event.message === 'string') {
    event.message = maskerRadverdier(event.message)
  }

  // Skrubb extra-felter — beholder kun whitelist-godkjente nøkler.
  if (event.extra) {
    const renset: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(event.extra)) {
      if (SERVER_WHITELIST.has(k)) renset[k] = v
    }
    event.extra = renset
  }
  // Fjern request-body, headers, cookies og URL — kan inneholde bruker-payload.
  // url tas med fordi query-strengen er ustyrt: dagens ruter har ingen PII der,
  // men det er ingen mekanisme som holder det sant. Sentry viser fortsatt
  // transaction-navnet, så vi mister ikke «hvilken rute». Se #498-review.
  if (event.request) {
    delete event.request.data
    delete event.request.headers
    delete event.request.cookies
    delete event.request.url
  }
  return event
}
