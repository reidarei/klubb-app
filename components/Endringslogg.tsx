'use client'

import { useState } from 'react'
import { formaterDato, FORMAT_DATO_AAR } from '@/lib/dato'
import { ENDRINGSLOGG_SYNLIGE } from '@/lib/konstanter'
import type { LoggRad } from '@/lib/endringslogg'

type Props = {
  rader: LoggRad[]
}

// «Hva er nytt»-listen på /om-appen (#595). Client-komponent kun for
// «Vis eldre»-utvidelsen — radene selv er ferdig utledet server-side av
// byggEndringslogg() og sendt inn som props.
export default function Endringslogg({ rader }: Props) {
  const [utvidet, setUtvidet] = useState(false)

  const synlige = utvidet ? rader : rader.slice(0, ENDRINGSLOGG_SYNLIGE)
  const finnesFlere = rader.length > ENDRINGSLOGG_SYNLIGE

  return (
    <div>
      <div id="endringslogg-innhold" style={{ display: 'flex', flexDirection: 'column' }}>
        {synlige.map((rad, i) => (
          <div
            key={rad.visning}
            style={{
              padding: '14px 4px',
              borderBottom:
                i < synlige.length - 1 ? '0.5px solid var(--border-subtle)' : 'none',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--text-tertiary)',
                letterSpacing: '1.4px',
                marginBottom: 6,
              }}
            >
              {rad.visning}
              {rad.dato && ` · ${formaterDato(rad.dato, FORMAT_DATO_AAR)}`}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                lineHeight: 1.55,
                color: rad.mindre ? 'var(--text-tertiary)' : 'var(--text-secondary)',
              }}
            >
              {rad.tekst}
            </div>
          </div>
        ))}
      </div>

      {finnesFlere && (
        <button
          type="button"
          onClick={() => setUtvidet(v => !v)}
          aria-expanded={utvidet}
          aria-controls="endringslogg-innhold"
          style={{
            background: 'transparent',
            border: 'none',
            padding: '10px 4px 0',
            color: 'var(--accent)',
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: 'inline-block',
              transform: utvidet ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 150ms ease',
              fontSize: 9,
              opacity: 0.7,
            }}
          >
            ▼
          </span>
          <span>{utvidet ? 'Vis færre' : 'Vis eldre'}</span>
        </button>
      )}
    </div>
  )
}
