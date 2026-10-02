'use client'

import type { CSSProperties } from 'react'
import { treffflateRundt } from '@/components/ui/Treffflate'

type Option<V extends string> = {
  value: V
  label: string
}

type Props<V extends string> = {
  value: V
  onChange: (value: V) => void
  options: Option<V>[]
}

// Synlig cellehøyde (#700): padding 10px topp/bunn + ~20 px tekstlinje ved
// fontSize 14 → ~37–41 px, under 44. Kun vertikal utvidelse (jf.
// SegmentPiller) — bredden følger `flex: 1` og er aldri det trange målet her.
const SYNLIG_HOYDE = 39
const TREFF = treffflateRundt({ hoyde: SYNLIG_HOYDE })

export default function Segment<V extends string>({ value, onChange, options }: Props<V>) {
  return (
    <div
      style={{
        display: 'flex',
        borderTop: '0.5px solid var(--border-subtle)',
        borderBottom: '0.5px solid var(--border-subtle)',
      }}
      role="tablist"
    >
      {options.map((opt, i) => {
        const aktiv = opt.value === value
        // Alt det SYNLIGE (padding, kant, posisjon for understreket) ligger på
        // denne inner-cellen, UBERØRT av treffflate-utvidelsen under — ellers
        // ville den absolutt-posisjonerte underlinja (bottom: -1, relativt til
        // nærmeste `position: relative`-forelder) flyttet seg nedover med
        // utvidelsen, og det ER en synlig endring vi ikke vil ha.
        const innerStyle: CSSProperties = {
          padding: '10px 0',
          textAlign: 'center',
          fontFamily: 'var(--font-display)',
          fontSize: 14,
          fontWeight: 500,
          color: aktiv ? 'var(--text-primary)' : 'var(--text-tertiary)',
          borderLeft: i === 0 ? 'none' : '0.5px solid var(--border-subtle)',
          position: 'relative',
        }
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={aktiv}
            onClick={() => onChange(opt.value)}
            style={{
              // Usynlig knapp: flex:1 for lik bredde på alle fanene, ellers
              // kun den vertikale treffflate-utvidelsen. Se innerStyle for
              // hvorfor ALT synlig ligger ett nivå ned.
              flex: 1,
              background: 'transparent',
              border: 'none',
              padding: 0,
              ...TREFF.stil,
            }}
          >
            <div style={innerStyle}>
              {opt.label}
              {aktiv && (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    bottom: -1,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 24,
                    height: '1.5px',
                    background: 'var(--accent)',
                  }}
                />
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
