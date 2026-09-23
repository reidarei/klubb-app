// Next.js instrumentation hook — kjøres én gang per cold start av serveren.
// Se https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
//
// Sentry initialiseres her for Node + Edge runtime, men IKKE for klienten.
// Klient-feil fanges av /api/logg-feil via navigator.sendBeacon. Se #366.

import { SENTRY_DSN } from '@/lib/config'

export async function register() {
  // Uten DSN (f.eks. lokal dev) hopper vi over — lib/logg.ts fungerer
  // da i stdout-only-modus uten Sentry-integrasjon.
  if (!SENTRY_DSN) return

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Next.js 15 krever denne eksporten for at Sentry skal fange feil kastet i
// Server Components, server actions og route handlers (167 `throw new
// Error`-kallsteder i lib/actions/ som i dag ikke når Sentry i det hele tatt
// — se #498). MÅ merges sammen med meldings-scrubbingen i lib/sentry-scrub.ts:
// Sentry.captureRequestError gjør null egen filtrering, så uten scrubbingen
// hadde dette vært en GDPR-lekkasje av radverdier på 167 kaststeder.
//
// Uten DSN (f.eks. lokal dev) er Sentry ALDRI initialisert (register() over
// hopper over Sentry.init), så et kall til Sentry.captureRequestError ville
// kastet — samme eksplisitte guard som i register() gjør denne veien trygg
// uten å måtte stole på at SDK-en no-oper internt.
//
// Parameter-typen hentes fra selve Sentry-funksjonen (type-only import —
// null runtime-kostnad) i stedet for Next sin interne
// InstrumentationOnRequestError-type, som ikke er en offentlig eksport fra
// 'next'-pakken.
export async function onRequestError(
  ...args: Parameters<typeof import('@sentry/nextjs').captureRequestError>
) {
  const [error, , context] = args

  // feil_logg FØR Sentry, og bevisst UTENFOR SENTRY_DSN-guarden under:
  // dette er den eneste server-feilkanalen som virker uten Sentry-nøkkel.
  // Frem til #631 lå all server-side feilrapportering bak den guarden, så en
  // instans uten DSN — og vi vet ikke sikkert at prod har en — logget ingenting
  // i det hele tatt. `digest` tas med fordi Next setter den på feilen FØR den
  // kaller hit (create-error-handler.js), og det er den eneste tråden tilbake
  // til raden app/error.tsx skriver fra klienten.
  //
  // Next kaller ikke denne hooken for redirect(), notFound() eller avbrutte
  // responser — de returnerer tidlig via getDigestForWellKnownError/isAbortError
  // — så vi trenger ingen egen filtrering for dem her.
  // .catch() selv om loggRenderFeil() er dokumentert som «kaster aldri»:
  // vi står INNE i Next sin feilhåndtering, og en throw herfra ville lagt seg
  // oppå — og kunne maskert — den ekte feilen vi nettopp prøvde å beskrive.
  // Samme resonnement som CLAUDE.md § Policy: Varsler krever for sendVarsel()
  // etter en committet tilstandsendring. Uten den ville dessuten selve
  // dynamiske importen under (som kan feile ved cold start) tatt med seg
  // Sentry-rapporteringen på veien ned.
  await import('@/lib/logg')
    .then(({ loggRenderFeil }) =>
      loggRenderFeil({
        error,
        // routePath er rute-MØNSTERET («/arrangementer/[id]»), ikke den
        // konkrete URL-en. Bevisst: en id i loggen er en radverdi vi ikke
        // trenger, og Sentry-scrubbingen fjerner request.url av samme grunn.
        rute: context?.routePath,
        digest: (error as { digest?: string } | null)?.digest,
      }),
    )
    .catch((loggFeil: unknown) => {
      // Ren stdout — logg.feil() herfra ville vært sirkulært (den skriver til
      // samme tabell som nettopp feilet).
      //
      // `ts` settes med new Date() og IKKE med naa() fra lib/dato, som er det
      // resten av loggingen bruker: vi står i catch-en for at en dynamisk
      // import feilet, og skal ikke gjøre siste skanse avhengig av enda en
      // modul som kan feile på samme måte. Verdien er identisk — naa() er
      // new Date().toISOString().
      //
      // Kun feilKLASSEN, aldri meldingen: en melding herfra kan stamme fra en
      // videresendt PostgREST-feil og bære radverdier, og vi er utenfor
      // maskerRadverdier() på dette punktet. Navnet er en konstant fra koden —
      // samme resonnement som normaliserFeil() i lib/logg.ts bygger på.
      // Uten det sto det bare «loggingen feilet», som ikke er til å feilsøke.
      console.log(
        JSON.stringify({
          ts: new Date().toISOString(),
          nivaa: 'warn',
          event: 'server.render.logging.feilet',
          navn: loggFeil instanceof Error ? loggFeil.name : typeof loggFeil,
        }),
      )
    })

  if (!SENTRY_DSN) return
  const Sentry = await import('@sentry/nextjs')
  Sentry.captureRequestError(...args)
}
