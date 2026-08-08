'use client'

import { useEffect } from 'react'
import {
  sendFeilBeacon,
  feilNavn,
  erChunkFeil,
  proevChunkReload,
} from '@/lib/klient-logg'

// Fast norsk brødtekst — vi rendrer ALDRI error.message til brukeren.
// Next 15 maskerer meldinger som stammer fra server components i prod og
// erstatter dem med en engelsk boilerplate («An error occurred in the Server
// Components render… omitted in production builds…»). Den strengen sa
// ingenting til de ~17 som bruker appen. Selve meldingen er uansett ikke tapt:
// useEffect-beaconen under sender message + stack + digest til feil_logg.
export const FEIL_BRODTEKST =
  'Vi klarte ikke hente dataene. Prøv igjen — hjelper det ikke, si fra til Reidar.'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Beacon til /api/logg-feil — scrubbes og lagres i feil_logg. Se #366.
    // Transporten og diagnosefeltene bor i lib/klient-logg.ts (#575), slik at
    // denne boundaryen, global-error og FeilFangst rapporterer likt. Da er
    // radene faktisk sammenlignbare når man leter etter et mønster.
    sendFeilBeacon('klient.render.feilet', error.message, error.stack, {
      name: feilNavn(error),
      digest: error.digest,
      // `cause` bærer ofte den ekte underliggende feilen når en wrapper har
      // kastet på nytt — uten den ser vi bare ytterste lag.
      cause: error.cause ? String(error.cause) : undefined,
    })

    // Mangler nettleseren en kodebit fordi klienten kjører en gammel bundle,
    // er riktig svar å hente fersk HTML — ikke å vise «Noe gikk galt» for noe
    // én reload fikser. proevChunkReload() krever at enheten er online og
    // bremser gjentatte forsøk; returnerer den false, står feilsiden igjen.
    if (erChunkFeil(error)) proevChunkReload()
  }, [error])

  return (
    <div
      // Stabilt holdepunkt for e2e/sider-laster.spec.ts, som asserterer at
      // ingen rute havner i error-boundaryen. Uten det måtte speccen matchet
      // på «Noe gikk galt»-teksten, som er redaksjonell og kan endres.
      data-testid="feil-side"
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
        {FEIL_BRODTEKST}
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
          Feilkode: {error.digest}
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
