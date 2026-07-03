'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Beacon til /api/logg-feil — scrubbes og lagres i feil_logg. Se #366.
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(
        '/api/logg-feil',
        new Blob(
          [
            JSON.stringify({
              event: 'klient.render.feilet',
              nivaa: 'error',
              kontekst: {
                message: error.message,
                stack: error.stack?.slice(0, 2000),
                digest: error.digest,
                url: typeof window !== 'undefined' ? window.location.href : '',
              },
            }),
          ],
          { type: 'application/json' },
        ),
      )
    }
  }, [error])

  return (
    <div
      style={{
        minHeight: '70vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 24px',
        textAlign: 'center',
      }}
    >
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 28,
          fontWeight: 500,
          letterSpacing: '-0.4px',
          color: 'var(--text-primary)',
          marginBottom: 12,
        }}
      >
        Noe gikk galt
      </h1>
      <p
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          color: 'var(--text-secondary)',
          marginBottom: 20,
          maxWidth: 320,
          lineHeight: 1.5,
        }}
      >
        {error.message || 'En uventet feil oppstod.'}
      </p>
      {error.digest && (
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--text-tertiary)',
            marginBottom: 24,
            letterSpacing: '0.4px',
          }}
        >
          Digest: {error.digest}
        </p>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="button"
          onClick={reset}
          style={{
            padding: '12px 24px',
            borderRadius: 999,
            border: 'none',
            background: 'var(--accent)',
            color: 'var(--accent-foreground)',
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Prøv igjen
        </button>
        <button
          type="button"
          onClick={() => (window.location.href = '/')}
          style={{
            padding: '12px 24px',
            borderRadius: 999,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Til forsiden
        </button>
      </div>
    </div>
  )
}
