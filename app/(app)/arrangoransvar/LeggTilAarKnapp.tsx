'use client'

import { useState, useTransition } from 'react'
import { leggTilArrangoransvarForAar } from '@/lib/actions/arrangoransvar'

export default function LeggTilAarKnapp({ aar }: { aar: number }) {
  const [isPending, startTransition] = useTransition()
  const [feil, setFeil] = useState('')

  function handleKlikk() {
    setFeil('')
    startTransition(async () => {
      try {
        await leggTilArrangoransvarForAar(aar)
      } catch (err) {
        setFeil(err instanceof Error ? err.message : 'Kunne ikke opprette')
      }
    })
  }

  return (
    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button
        type="button"
        onClick={handleKlikk}
        disabled={isPending}
        style={{
          padding: '12px 18px',
          borderRadius: 999,
          background: 'var(--accent-soft)',
          border: '0.5px solid var(--accent)',
          color: 'var(--accent)',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '1.4px',
          textTransform: 'uppercase',
          cursor: isPending ? 'wait' : 'pointer',
          alignSelf: 'flex-start',
        }}
      >
        {isPending ? 'Oppretter…' : `Legg til arrangøransvar for ${aar}`}
      </button>
      {feil && (
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 11,
            color: 'var(--danger)',
          }}
        >
          {feil}
        </span>
      )}
    </div>
  )
}
