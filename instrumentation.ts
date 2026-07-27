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
  if (!SENTRY_DSN) return
  const Sentry = await import('@sentry/nextjs')
  Sentry.captureRequestError(...args)
}
