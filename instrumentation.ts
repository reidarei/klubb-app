// Next.js instrumentation hook — kjøres én gang per cold start.
// Sentry kun for Node + Edge; klient-feil går via /api/logg-feil (#366).

import { SENTRY_DSN } from '@/lib/config'

export async function register() {
  // Uten DSN (lokal dev) kjører lib/logg.ts i stdout-only-modus.
  if (!SENTRY_DSN) return

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Fanger feil kastet i Server Components, server actions og route handlers.
// captureRequestError filtrerer ingenting selv — avhenger av scrubbingen i
// lib/sentry-scrub.ts for ikke å lekke radverdier (#498).
// Parameter-typen lånes fra Sentry fordi Next sin
// InstrumentationOnRequestError ikke er offentlig eksportert.
export async function onRequestError(
  ...args: Parameters<typeof import('@sentry/nextjs').captureRequestError>
) {
  const [error, , context] = args

  // feil_logg bevisst UTENFOR DSN-guarden: eneste server-feilkanal som virker
  // uten Sentry-nøkkel (#631). `digest` er eneste kobling til raden
  // app/error.tsx skriver fra klienten.
  // redirect()/notFound()/avbrutte responser når aldri hit — Next filtrerer dem.
  // .catch() fordi vi står inne i Next sin feilhåndtering: en throw herfra
  // (også fra den dynamiske importen) ville maskert den ekte feilen og tatt
  // Sentry-rapporteringen med seg.
  await import('@/lib/logg')
    .then(({ loggRenderFeil }) =>
      loggRenderFeil({
        error,
        // Rute-MØNSTERET, ikke konkret URL: en id er en radverdi vi ikke
        // vil logge (samme grunn som Sentry-scrubbingen fjerner request.url).
        rute: context?.routePath,
        digest: (error as { digest?: string } | null)?.digest,
      }),
    )
    .catch((loggFeil: unknown) => {
      // Ren stdout: logg.feil() ville vært sirkulært. new Date() i stedet for
      // naa() så siste skanse ikke avhenger av enda en modul-import.
      // Kun feilklassen, aldri meldingen — den kan bære umaskerte radverdier.
      console.log(
        JSON.stringify({
          ts: new Date().toISOString(),
          nivaa: 'warn',
          event: 'server.render.logging.feilet',
          navn: loggFeil instanceof Error ? loggFeil.name : typeof loggFeil,
        }),
      )
    })

  // Uten DSN er Sentry aldri initialisert, og captureRequestError kunne kastet.
  if (!SENTRY_DSN) return
  const Sentry = await import('@sentry/nextjs')
  Sentry.captureRequestError(...args)
}
