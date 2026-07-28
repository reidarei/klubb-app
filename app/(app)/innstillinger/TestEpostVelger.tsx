'use client'

import { useState, useTransition } from 'react'
import { oppdaterTestEpost } from './actions'

// Velger hvilken admin-epost testmodus-varsler rutes til. Selve på/av-
// togglen håndteres av VarselToggle — denne styrer kun beskrivelse-feltet.
export default function TestEpostVelger({
  valgt,
  admins,
}: {
  valgt: string | null
  admins: { navn: string | null; epost: string }[]
}) {
  const [isPending, startTransition] = useTransition()
  const [feil, setFeil] = useState<string | null>(null)
  // Hvis lagret verdi ikke matcher en admin (f.eks. gammel fritekst),
  // viser vi placeholder i stedet for en tom select.
  const gyldigValgt = admins.some(a => a.epost === valgt) ? valgt : null

  return (
    <div style={{ padding: '10px 4px 14px 16px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: 'var(--font-body)',
            fontSize: 12.5,
            color: 'var(--text-secondary)',
            lineHeight: 1.3,
          }}
        >
          Test-epost (mottaker i testmodus)
        </div>
        <select
          value={gyldigValgt ?? ''}
          disabled={isPending}
          onChange={e => {
            const epost = e.target.value
            if (!epost) return
            setFeil(null)
            // Feilen fanges her og vises inline. Lot vi den avvise inne i
            // transitionen, ville React 19 sendt den til nærmeste error boundary
            // og byttet ut hele innstillingssiden med feilskjermen.
            startTransition(async () => {
              try {
                const res = await oppdaterTestEpost(epost)
                if (!res.ok) setFeil(res.feil)
              } catch {
                setFeil('Kunne ikke lagre test-epost. Prøv igjen.')
              }
            })
          }}
          aria-label="Velg test-epost for testmodus"
          style={{
            maxWidth: 180,
            padding: '6px 8px',
            borderRadius: 8,
            border: '0.5px solid var(--border-strong)',
            background: 'var(--bg-elevated, transparent)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
            fontSize: 12.5,
            opacity: isPending ? 0.6 : 1,
          }}
        >
          {!gyldigValgt && <option value="">Velg admin…</option>}
          {admins.map(a => (
            <option key={a.epost} value={a.epost}>
              {a.navn ?? a.epost}
            </option>
          ))}
        </select>
      </div>
      {feil && (
        <p
          role="alert"
          style={{
            margin: '6px 0 0',
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            color: 'var(--danger)',
            lineHeight: 1.35,
          }}
        >
          {feil}
        </p>
      )}
    </div>
  )
}
