'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { stemPaaPoll } from '@/lib/actions/poll'
import KaaringKandidat from './KaaringKandidat'

export type KaaringValg = {
  id: string
  navn: string
  bildeUrl?: string | null
  rolle?: string | null
  variant: 'profil' | 'arrangement'
}

type Props = {
  pollId: string
  valg: KaaringValg[]
  mineStemmer: string[] // valg-id-er jeg har stemt på (max 1 — kåring er enkeltvalg)
}

export default function KaaringPollStemming({ pollId, valg, mineStemmer }: Props) {
  const initial = mineStemmer[0] ?? ''
  const [valgt, setValgt] = useState<string>(initial)
  const [feil, setFeil] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleStem() {
    setFeil('')
    if (!valgt) {
      setFeil('Velg en kandidat.')
      return
    }
    startTransition(async () => {
      try {
        await stemPaaPoll(pollId, [valgt])
        router.refresh()
      } catch (err) {
        setFeil(err instanceof Error ? err.message : 'Kunne ikke registrere stemmen.')
      }
    })
  }

  const harEndret = valgt !== initial

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {valg.map(v => {
          const erValgt = valgt === v.id
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setValgt(v.id)}
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
                transition: 'background 120ms, border-color 120ms',
              }}
            >
              <KaaringKandidat
                navn={v.navn}
                bildeUrl={v.bildeUrl}
                rolle={v.rolle}
                variant={v.variant}
                size={40}
              />
              <span style={{ flex: 1, fontWeight: erValgt ? 600 : 400 }}>{v.navn}</span>
              <span
                aria-hidden="true"
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  border: `1.5px solid ${erValgt ? 'var(--accent)' : 'var(--border-strong)'}`,
                  background: erValgt ? 'var(--accent)' : 'transparent',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {erValgt && (
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: '#0a0a0a',
                    }}
                  />
                )}
              </span>
            </button>
          )
        })}
      </div>

      {feil && (
        <p style={{ fontSize: 13, color: 'var(--danger)', marginTop: 12 }}>{feil}</p>
      )}

      <button
        type="button"
        onClick={handleStem}
        disabled={isPending || !harEndret}
        style={{
          display: 'block',
          width: '100%',
          marginTop: 16,
          padding: '12px 0',
          background: 'var(--accent)',
          color: '#0a0a0a',
          border: 'none',
          borderRadius: 999,
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          fontWeight: 600,
          cursor: isPending || !harEndret ? 'default' : 'pointer',
          opacity: isPending || !harEndret ? 0.5 : 1,
        }}
      >
        {isPending ? 'Lagrer…' : initial ? 'Oppdater stemme' : 'Stem'}
      </button>
    </div>
  )
}
