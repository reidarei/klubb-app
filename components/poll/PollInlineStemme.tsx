'use client'

import { useState, useTransition, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import { stemPaaPoll } from '@/lib/actions/poll'

type Valg = { id: string; tekst: string }

type Props = {
  pollId: string
  flervalg: boolean
  valg: Valg[]
  mineStemmer: string[]
  stemmerPerValg: Record<string, number>
  antallStemmere: number
}

/**
 * Kompakte stemmeknapper brukt inline på PollKort. Rendres som grid med
 * én kolonne per alternativ — ser best ut med 2–3 alternativer.
 *
 * Fordi knappene ligger inni en Link (hele kortet navigerer til /poll/[id]),
 * må klikk kalle både preventDefault og stopPropagation for ikke å trigge
 * navigering. Vi bruker optimistisk UI: oppdater state umiddelbart og
 * rull tilbake hvis server feiler.
 */
export default function PollInlineStemme({
  pollId,
  flervalg,
  valg,
  mineStemmer,
  stemmerPerValg,
  antallStemmere,
}: Props) {
  const [optimistisk, setOptimistisk] = useState<string[]>(mineStemmer)
  // Etter stemming viser vi resultat som default. Brukeren kan toggle
  // tilbake til stemme-UI via «Endre svar»-knappen.
  const [visStemmeUI, setVisStemmeUI] = useState<boolean>(mineStemmer.length === 0)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const harStemt = optimistisk.length > 0

  function stopper(e: MouseEvent<HTMLElement>) {
    e.preventDefault()
    e.stopPropagation()
  }

  function handleStem(valgId: string, e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault()
    e.stopPropagation()
    if (isPending) return

    const erValgt = optimistisk.includes(valgId)
    let nye: string[]
    if (flervalg) {
      nye = erValgt ? optimistisk.filter(v => v !== valgId) : [...optimistisk, valgId]
    } else {
      // Enkeltvalg: tap på samme alternativ er no-op (stemPaaPoll krever ≥1)
      if (erValgt) return
      nye = [valgId]
    }

    setOptimistisk(nye)
    if (nye.length === 0) return

    startTransition(async () => {
      try {
        await stemPaaPoll(pollId, nye)
        router.refresh()
        // Flipp tilbake til resultat-visning etter vellykket stemme
        setVisStemmeUI(false)
      } catch {
        setOptimistisk(mineStemmer)
      }
    })
  }

  // === Resultat-visning (etter stemme) ===
  if (harStemt && !visStemmeUI) {
    const basis = antallStemmere || 1
    return (
      <div onClick={stopper}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {valg.map(v => {
            const antall = stemmerPerValg[v.id] ?? 0
            const prosent = Math.round((antall / basis) * 100)
            const minStemme = optimistisk.includes(v.id)
            return (
              <div key={v.id}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 6,
                    marginBottom: 2,
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 12,
                      color: 'var(--text-primary)',
                      fontWeight: minStemme ? 600 : 400,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {v.tekst}
                    {minStemme && (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: 9,
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--accent)',
                          letterSpacing: '1.2px',
                          textTransform: 'uppercase',
                        }}
                      >
                        Din
                      </span>
                    )}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      color: 'var(--text-secondary)',
                      fontWeight: 600,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {prosent}%
                  </span>
                </div>
                <div
                  style={{
                    height: 6,
                    borderRadius: 3,
                    background: 'var(--bg-elevated)',
                    overflow: 'hidden',
                    border: '0.5px solid var(--border-subtle)',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${prosent}%`,
                      background: minStemme
                        ? 'var(--accent)'
                        : 'linear-gradient(90deg, var(--accent-soft), var(--accent))',
                      transition: 'width 240ms ease-out',
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={e => {
              e.preventDefault()
              e.stopPropagation()
              setVisStemmeUI(true)
            }}
            style={{
              padding: '4px 12px',
              borderRadius: 999,
              background: 'transparent',
              border: '0.5px solid var(--border)',
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              letterSpacing: '1.4px',
              textTransform: 'uppercase',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Endre svar
          </button>
        </div>
      </div>
    )
  }

  // === Stemme-knapper ===
  return (
    <div onClick={stopper}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${valg.length}, 1fr)`,
          gap: 8,
        }}
      >
        {valg.map(v => {
          const valgt = optimistisk.includes(v.id)
          return (
            <button
              key={v.id}
              type="button"
              onClick={e => handleStem(v.id, e)}
              disabled={isPending}
              style={{
                padding: '12px 8px',
                borderRadius: 14,
                background: valgt ? 'var(--accent)' : 'transparent',
                border: valgt ? 'none' : '1px solid var(--border)',
                color: valgt ? '#0a0a0a' : 'var(--text-primary)',
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                fontWeight: valgt ? 600 : 500,
                letterSpacing: '0.1px',
                cursor: isPending ? 'wait' : 'pointer',
                opacity: isPending ? 0.7 : 1,
                transition: 'background 120ms, border-color 120ms',
                textAlign: 'center',
                minHeight: 42,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {v.tekst}
            </button>
          )
        })}
      </div>
      {harStemt && (
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={e => {
              e.preventDefault()
              e.stopPropagation()
              setVisStemmeUI(false)
            }}
            style={{
              padding: '4px 12px',
              borderRadius: 999,
              background: 'transparent',
              border: '0.5px solid var(--border)',
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              letterSpacing: '1.4px',
              textTransform: 'uppercase',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Se resultat
          </button>
        </div>
      )}
    </div>
  )
}
