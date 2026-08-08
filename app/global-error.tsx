'use client'

// Root error boundary — fanger feil i selve root layout.tsx (sjeldent, men
// f.eks. ved server-komponent-krasj som propagerer helt opp). Bruker
// navigator.sendBeacon fordi fetch ikke er garantert synkront ved unmount.
// Se #366.

import { useEffect } from 'react'
import {
  sendFeilBeacon,
  feilNavn,
  erChunkFeil,
  proevChunkReload,
} from '@/lib/klient-logg'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // sendBeacon er «fire-and-forget» og overlever navigasjon/reload.
    // Beacon sendes til /api/logg-feil som scrubber og lagrer i feil_logg.
    // Transport + diagnosefelter deles med app/error.tsx og FeilFangst via
    // lib/klient-logg.ts (#575) — nivået er det eneste som skiller dem.
    sendFeilBeacon(
      'klient.render.feilet',
      error.message,
      error.stack,
      {
        name: feilNavn(error),
        digest: error.digest,
        cause: error.cause ? String(error.cause) : undefined,
      },
      'fatal',
    )

    // Samme selvhelbredelse som i app/error.tsx: en manglende kodebit fikses
    // av fersk HTML, ikke av at brukeren stirrer på «Noe knakk».
    if (erChunkFeil(error)) proevChunkReload()
  }, [error])

  return (
    <html lang="nb">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 24px',
          textAlign: 'center',
          background: '#0e0f13',
          color: '#e8e6e1',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <h1
          style={{
            fontSize: 24,
            fontWeight: 500,
            marginBottom: 12,
          }}
        >
          Noe knakk
        </h1>
        <p
          style={{
            fontSize: 14,
            color: '#9b9893',
            marginBottom: 24,
            maxWidth: 320,
            lineHeight: 1.5,
          }}
        >
          Gutta er varslet, prøv igjen om litt.
        </p>
        {error.digest && (
          <p
            style={{
              fontFamily: 'monospace',
              fontSize: 11,
              color: '#6b6965',
              marginBottom: 24,
            }}
          >
            {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          style={{
            padding: '12px 24px',
            borderRadius: 999,
            border: 'none',
            background: '#e8d9b5',
            color: '#0a0a0a',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Prøv igjen
        </button>
      </body>
    </html>
  )
}
