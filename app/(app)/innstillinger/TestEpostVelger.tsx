'use client'

import { useTransition } from 'react'
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
  // Hvis lagret verdi ikke matcher en admin (f.eks. gammel fritekst),
  // viser vi placeholder i stedet for en tom select.
  const gyldigValgt = admins.some(a => a.epost === valgt) ? valgt : null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 4px 14px 16px',
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
          if (epost) startTransition(() => oppdaterTestEpost(epost))
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
  )
}
