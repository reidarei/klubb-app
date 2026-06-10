'use client'

import { useMemo, useState } from 'react'
import MedlemRad from '@/components/klubbinfo/MedlemRad'
import SectionLabel from '@/components/ui/SectionLabel'
import { tittelFor } from '@/lib/roller'

type Medlem = {
  id: string
  navn: string
  rolle: string
  narv: number | null
  erAeres: boolean
  aktiv: boolean
  bildeUrl: string | null
}

export default function MedlemmerListe({
  medlemmer,
  erAdmin,
}: {
  medlemmer: Medlem[]
  erAdmin: boolean
}) {
  const [soek, setSoek] = useState('')
  const [sortering, setSortering] = useState<'alfabetisk' | 'narvaer'>('alfabetisk')

  const filtrert = useMemo(() => {
    const q = soek.trim().toLowerCase()
    let liste = q ? medlemmer.filter(m => m.navn.toLowerCase().includes(q)) : medlemmer
    if (sortering === 'narvaer') {
      liste = [...liste].sort((a, b) => (b.narv ?? -1) - (a.narv ?? -1))
    } else {
      liste = [...liste].sort((a, b) => a.navn.localeCompare(b.navn, 'nb'))
    }
    return liste
  }, [medlemmer, soek, sortering])

  const aktive = filtrert.filter(m => m.aktiv)
  const inaktive = filtrert.filter(m => !m.aktiv)

  return (
    <>
      {/* Søk + sortering */}
      <div style={{ display: 'flex', gap: 8, marginTop: 22, marginBottom: 28 }}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            border: '0.5px solid var(--border)',
            borderRadius: 999,
            background: 'var(--bg-elevated)',
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-tertiary)"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={soek}
            onChange={e => setSoek(e.target.value)}
            placeholder="Søk etter medlem…"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-body)',
              fontSize: 13,
            }}
          />
        </div>
        <button
          type="button"
          onClick={() =>
            setSortering(s => (s === 'alfabetisk' ? 'narvaer' : 'alfabetisk'))
          }
          style={{
            padding: '0 14px',
            borderRadius: 999,
            border: '0.5px solid var(--border)',
            background: 'var(--bg-elevated)',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
          aria-label="Endre sortering"
        >
          {sortering === 'alfabetisk' ? 'A–Å' : '%'}
        </button>
      </div>

      {/* Aktive */}
      <div style={{ marginBottom: 34 }}>
        <SectionLabel count={aktive.length}>Aktive</SectionLabel>
        {aktive.map((m, i) => (
          <MedlemRad
            key={m.id}
            id={m.id}
            navn={m.navn}
            rolle={m.rolle}
            rolleLabel={tittelFor(m.rolle)}
            narv={m.narv}
            erAeres={m.erAeres}
            bildeUrl={m.bildeUrl}
            last={i === aktive.length - 1}
          />
        ))}
        {aktive.length === 0 && (
          <div
            style={{
              padding: '24px 4px',
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              color: 'var(--text-tertiary)',
              textAlign: 'center',
            }}
          >
            Ingen treff
          </div>
        )}
      </div>

      {/* Tidligere (kun admin) */}
      {erAdmin && inaktive.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <SectionLabel count={inaktive.length}>Tidligere</SectionLabel>
          <div style={{ opacity: 0.6 }}>
            {inaktive.map((m, i) => (
              <MedlemRad
                key={m.id}
                id={m.id}
                navn={m.navn}
                rolle={m.rolle}
                rolleLabel={tittelFor(m.rolle)}
                narv={null}
                bildeUrl={m.bildeUrl}
                last={i === inaktive.length - 1}
              />
            ))}
          </div>
        </div>
      )}
    </>
  )
}
