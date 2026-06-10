'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { lagrePassInfo } from '@/lib/actions/pass'

type Props = {
  initialNummer?: string
  initialUtloper?: string
  onAvbryt: () => void
}

export default function PassInfoSkjema({ initialNummer = '', initialUtloper = '', onAvbryt }: Props) {
  const [nummer, setNummer] = useState(initialNummer)
  const [utloper, setUtloper] = useState(initialUtloper)
  const [feil, setFeil] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleLagre() {
    setFeil('')
    if (!nummer.trim() || !utloper) {
      setFeil('Begge felter må fylles ut.')
      return
    }
    startTransition(async () => {
      try {
        await lagrePassInfo({ nummer, utloper })
        router.refresh()
        onAvbryt() // lukk skjema
      } catch (e) {
        setFeil(e instanceof Error ? e.message : 'Noe gikk galt')
      }
    })
  }

  const inputStil = {
    width: '100%',
    background: 'transparent',
    border: 'none',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-body)',
    fontSize: 14,
    outline: 'none',
    padding: '8px 0',
  } as const

  const labelStil = {
    fontFamily: 'var(--font-mono)',
    fontSize: 9.5,
    fontWeight: 600,
    color: 'var(--text-tertiary)',
    letterSpacing: '1.6px',
    textTransform: 'uppercase' as const,
    marginBottom: 2,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <div style={labelStil}>Passnummer</div>
        <input
          type="text"
          value={nummer}
          onChange={e => setNummer(e.target.value)}
          autoComplete="off"
          maxLength={20}
          style={{ ...inputStil, borderBottom: '0.5px solid var(--border-subtle)' }}
        />
      </div>
      <div>
        <div style={labelStil}>Utløpsdato</div>
        <input
          type="date"
          value={utloper}
          onChange={e => setUtloper(e.target.value)}
          style={{ ...inputStil, borderBottom: '0.5px solid var(--border-subtle)' }}
        />
      </div>

      {feil && (
        <div style={{ color: 'var(--danger)', fontSize: 12 }}>{feil}</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          type="button"
          onClick={onAvbryt}
          disabled={isPending}
          style={{
            flex: 1,
            padding: '10px 0',
            background: 'transparent',
            border: '0.5px solid var(--border)',
            borderRadius: 999,
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Avbryt
        </button>
        <button
          type="button"
          onClick={handleLagre}
          disabled={isPending}
          style={{
            flex: 1,
            padding: '10px 0',
            background: 'var(--accent)',
            border: 'none',
            borderRadius: 999,
            color: '#0a0a0a',
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            fontWeight: 600,
            cursor: isPending ? 'wait' : 'pointer',
            opacity: isPending ? 0.6 : 1,
          }}
        >
          {isPending ? 'Lagrer…' : 'Lagre'}
        </button>
      </div>
    </div>
  )
}
