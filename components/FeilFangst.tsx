'use client'

// Global feil-lytter som fanger uncaught exceptions og unhandled promise
// rejections. Monteres én gang i root layout. Sender til /api/logg-feil
// via navigator.sendBeacon. Se #366.

import { useEffect } from 'react'
// Beacon-transporten bor i lib/klient-logg.ts, slik at håndterte klientfeil
// (f.eks. i chat-hookene) kan bruke samme vei til feil_logg som de ufangede.
import { sendFeilBeacon, feilNavn } from '@/lib/klient-logg'

export default function FeilFangst() {
  useEffect(() => {
    function handterFeil(ev: ErrorEvent) {
      sendFeilBeacon(
        'klient.window.feilet',
        ev.message ?? 'Ukjent feil',
        ev.error?.stack,
        { name: feilNavn(ev.error) },
      )
    }

    // Ressursfeil — en <script>, <link> eller <img> som ikke lot seg laste.
    // Disse fyrer en error-event på ELEMENTET, og den bobler ikke opp til
    // window. Lytteren over ser dem derfor aldri; de må fanges i
    // capture-fasen (tredje argument `true`).
    //
    // Dette er nøyaktig hullet i august-feilen (#575): en manglende kodebit
    // etter deploy var usynlig for oss, og filnavnet — det som ville avgjort
    // saken — sto i ev.target.src hele tiden uten at noen leste det.
    function handterRessursfeil(ev: Event) {
      const maal = ev.target as (HTMLElement & { src?: string; href?: string }) | null
      // Vanlige ErrorEvents passerer også capture-fasen. De har window (ikke
      // et element) som target og ingen src/href — vi lar dem gå videre til
      // handterFeil i stedet for å logge dem to ganger.
      if (!maal || maal === (window as unknown as HTMLElement)) return
      const kilde = maal.src ?? maal.href
      if (!kilde) return
      sendFeilBeacon(
        'klient.ressurs.feilet',
        `${maal.tagName.toLowerCase()} lastet ikke`,
        undefined,
        { ressurs: kilde },
      )
    }

    function handterAvvistPromise(ev: PromiseRejectionEvent) {
      const reason = ev.reason
      const message =
        reason instanceof Error
          ? reason.message
          : String(reason ?? 'Avvist promise')
      const stack = reason instanceof Error ? reason.stack : undefined
      sendFeilBeacon('klient.promise.avvist', message, stack, {
        name: feilNavn(reason),
      })
    }

    window.addEventListener('error', handterFeil)
    window.addEventListener('error', handterRessursfeil, true)
    window.addEventListener('unhandledrejection', handterAvvistPromise)

    return () => {
      window.removeEventListener('error', handterFeil)
      window.removeEventListener('error', handterRessursfeil, true)
      window.removeEventListener('unhandledrejection', handterAvvistPromise)
    }
  }, [])

  // Ingen visuelt output — kun event-lyttere
  return null
}
