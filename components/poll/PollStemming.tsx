'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { stemPaaPoll } from '@/lib/actions/poll'

type Valg = { id: string; tekst: string }

type Props = {
  pollId: string
  flervalg: boolean
  valg: Valg[]
  mineStemmer: string[] // valg-id-er jeg allerede har stemt på
}

export default function PollStemming({ pollId, flervalg, valg, mineStemmer }: Props) {
  const [valgte, setValgte] = useState<string[]>(mineStemmer)
  const [feil, setFeil] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function toggleValg(valgId: string) {
    setFeil('')
    if (flervalg) {
      setValgte(prev =>
        prev.includes(valgId) ? prev.filter(v => v !== valgId) : [...prev, valgId],
      )
    } else {
      setValgte([valgId])
    }
  }

  function handleStem() {
    setFeil('')
    if (valgte.length === 0) {
      setFeil('Velg minst ett alternativ.')
      return
    }
    startTransition(async () => {
      try {
        await stemPaaPoll(pollId, valgte)
        router.refresh()
      } catch (err) {
        setFeil(err instanceof Error ? err.message : 'Kunne ikke registrere stemmen.')
      }
    })
  }

  const harEndret =
    valgte.length !== mineStemmer.length ||
    valgte.some(v => !mineStemmer.includes(v))

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {valg.map(v => {
          const valgt = valgte.includes(v.id)
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => toggleValg(v.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 16px',
                border: `1px solid ${valgt ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-card)',
                background: valgt ? 'var(--accent-soft)' : 'transparent',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-body)',
                fontSize: 15,
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'background 120ms, border-color 120ms',
              }}
            >
              {/* Radio- eller checkbox-indikator */}
              <span
                aria-hidden="true"
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: flervalg ? 4 : '50%',
                  border: `1.5px solid ${valgt ? 'var(--accent)' : 'var(--border-strong)'}`,
                  background: valgt ? 'var(--accent)' : 'transparent',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {valgt && !flervalg && (
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: '#0a0a0a',
                    }}
                  />
                )}
                {valgt && flervalg && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" strokeWidth="3">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
              <span style={{ flex: 1 }}>{v.tekst}</span>
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
        {isPending
          ? 'Lagrer…'
          : mineStemmer.length > 0
            ? 'Oppdater stemme'
            : 'Stem'}
      </button>
    </div>
  )
}
