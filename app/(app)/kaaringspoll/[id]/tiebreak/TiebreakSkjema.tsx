'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { velgTiebreakVinner } from '@/lib/actions/kaaringspoll'
import KaaringKandidat from '@/components/poll/KaaringKandidat'

type Kandidat = {
  id: string
  navn: string
  bildeUrl?: string | null
  rolle?: string | null
  variant: 'profil' | 'arrangement'
}

type Props = {
  pollId: string
  tittel: string
  undertittel: string
  kandidater: Kandidat[]
}

// Bevisst minimal: ingen stemmetall vises, kun navn + bilde. Det er
// generalsekretærens egen vurdering — stemmetallene er likt og hjelper
// ikke i å bryte uavgjort.
export default function TiebreakSkjema({ pollId, tittel, undertittel, kandidater }: Props) {
  const [valgt, setValgt] = useState<string>('')
  const [feil, setFeil] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleVelg() {
    setFeil('')
    if (!valgt) {
      setFeil('Velg én kandidat.')
      return
    }
    startTransition(async () => {
      try {
        await velgTiebreakVinner(pollId, valgt)
      } catch (err) {
        if (
          typeof err === 'object' &&
          err !== null &&
          'digest' in err &&
          typeof (err as Record<string, unknown>).digest === 'string' &&
          ((err as Record<string, unknown>).digest as string).startsWith('NEXT_REDIRECT')
        ) {
          throw err
        }
        setFeil(err instanceof Error ? err.message : 'Kunne ikke lagre vinneren.')
      }
    })
  }

  return (
    <div style={{ padding: '0 20px 20px' }}>
      <header style={{ marginTop: 20, marginBottom: 24 }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--accent)',
            letterSpacing: '1.6px',
            textTransform: 'uppercase',
            marginBottom: 8,
          }}
        >
          Tiebreak
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 26,
            fontWeight: 500,
            margin: '0 0 6px',
            color: 'var(--text-primary)',
          }}
        >
          {tittel}
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            color: 'var(--text-secondary)',
            margin: 0,
          }}
        >
          {undertittel}
        </p>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {kandidater.map(k => {
          const erValgt = valgt === k.id
          return (
            <button
              key={k.id}
              type="button"
              onClick={() => setValgt(k.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '12px 14px',
                border: `1px solid ${erValgt ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-card)',
                background: erValgt ? 'var(--accent-soft)' : 'transparent',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-body)',
                fontSize: 15,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <KaaringKandidat
                navn={k.navn}
                bildeUrl={k.bildeUrl}
                rolle={k.rolle}
                variant={k.variant}
                size={40}
              />
              <span style={{ flex: 1, fontWeight: erValgt ? 600 : 400 }}>{k.navn}</span>
            </button>
          )
        })}
      </div>

      {feil && (
        <p style={{ fontSize: 13, color: 'var(--danger)', marginTop: 12 }}>{feil}</p>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button
          type="button"
          onClick={() => router.back()}
          style={{
            flex: 1,
            padding: '12px 0',
            background: 'transparent',
            color: 'var(--text-secondary)',
            border: '0.5px solid var(--border)',
            borderRadius: 999,
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Avbryt
        </button>
        <button
          type="button"
          onClick={handleVelg}
          disabled={isPending || !valgt}
          style={{
            flex: 2,
            padding: '12px 0',
            background: 'var(--accent)',
            color: 'var(--accent-foreground)',
            border: 'none',
            borderRadius: 999,
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            fontWeight: 600,
            cursor: isPending || !valgt ? 'default' : 'pointer',
            opacity: isPending || !valgt ? 0.5 : 1,
          }}
        >
          {isPending ? 'Lagrer…' : 'Kåre vinneren'}
        </button>
      </div>
    </div>
  )
}
