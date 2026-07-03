'use client'

// Global feil-lytter som fanger uncaught exceptions og unhandled promise
// rejections. Monteres én gang i root layout. Sender til /api/logg-feil
// via navigator.sendBeacon. Se #366.

import { useEffect } from 'react'

function sendFeilBeacon(event: string, message: string, stack?: string) {
  if (typeof navigator === 'undefined' || !navigator.sendBeacon) return
  navigator.sendBeacon(
    '/api/logg-feil',
    new Blob(
      [
        JSON.stringify({
          event,
          nivaa: 'error',
          kontekst: {
            message,
            stack: stack?.slice(0, 2000),
            url: typeof window !== 'undefined' ? window.location.href : '',
          },
        }),
      ],
      { type: 'application/json' },
    ),
  )
}

export default function FeilFangst() {
  useEffect(() => {
    function handterFeil(ev: ErrorEvent) {
      sendFeilBeacon(
        'klient.window.feilet',
        ev.message ?? 'Ukjent feil',
        ev.error?.stack,
      )
    }

    function handterAvvistPromise(ev: PromiseRejectionEvent) {
      const reason = ev.reason
      const message =
        reason instanceof Error
          ? reason.message
          : String(reason ?? 'Avvist promise')
      const stack = reason instanceof Error ? reason.stack : undefined
      sendFeilBeacon('klient.promise.avvist', message, stack)
    }

    window.addEventListener('error', handterFeil)
    window.addEventListener('unhandledrejection', handterAvvistPromise)

    return () => {
      window.removeEventListener('error', handterFeil)
      window.removeEventListener('unhandledrejection', handterAvvistPromise)
    }
  }, [])

  // Ingen visuelt output — kun event-lyttere
  return null
}
