'use client'

import { useState } from 'react'
import PassInfoSkjema from './PassInfoSkjema'
import { formaterDato } from '@/lib/dato'

type Props = {
  nummer: string | null
  utloper: string | null // YYYY-MM-DD
}

function sladdet(nummer: string): string {
  const siste4 = nummer.slice(-4)
  return '••••• ' + siste4
}

/**
 * Pass-info på profilsiden. Viser dashed-border kort med oppfordring
 * når tom; vis kompakt rad med sladdet nummer + utløp når fylt.
 * Kun eier ser dette (RLS i DB håndhever).
 */
export default function PassInfoKort({ nummer, utloper }: Props) {
  const [redigerer, setRedigerer] = useState(false)
  const harData = nummer && utloper

  if (redigerer) {
    return (
      <div
        style={{
          padding: '14px 16px',
          background: 'var(--bg-elevated)',
          border: '0.5px solid var(--border)',
          borderRadius: 'var(--radius-card)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--accent)',
            letterSpacing: '1.6px',
            textTransform: 'uppercase',
            fontWeight: 600,
            marginBottom: 12,
          }}
        >
          Pass-info
        </div>
        <PassInfoSkjema
          initialNummer={nummer ?? ''}
          initialUtloper={utloper ?? ''}
          onAvbryt={() => setRedigerer(false)}
        />
      </div>
    )
  }

  if (!harData) {
    return (
      <div
        style={{
          padding: '14px 16px',
          background: 'transparent',
          border: '1px dashed var(--border-strong)',
          borderRadius: 'var(--radius-card)',
          color: 'var(--text-primary)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-tertiary)',
            letterSpacing: '1.6px',
            textTransform: 'uppercase',
            fontWeight: 600,
            marginBottom: 6,
          }}
        >
          Pass-info — fyll ut her
        </div>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            color: 'var(--text-secondary)',
            lineHeight: 1.45,
            marginBottom: 12,
          }}
        >
          Lagre passnummer og utløpsdato slik at reiseansvarlig kan booke tur for
          deg uten å mase.
        </div>

        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: 'var(--text-tertiary)',
            letterSpacing: '1.4px',
            textTransform: 'uppercase',
            fontWeight: 600,
            marginBottom: 6,
          }}
        >
          Slik kontrolleres tilgangen
        </div>
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: '0 0 14px',
            fontFamily: 'var(--font-body)',
            fontSize: 12.5,
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
          }}
        >
          <li style={{ paddingLeft: 14, position: 'relative', marginBottom: 4 }}>
            <span style={{ position: 'absolute', left: 0, color: 'var(--accent)' }}>·</span>
            Kun du ser dataen som default
          </li>
          <li style={{ paddingLeft: 14, position: 'relative', marginBottom: 4 }}>
            <span style={{ position: 'absolute', left: 0, color: 'var(--accent)' }}>·</span>
            Bare arrangøren av en tur du har meldt deg på (Ja) kan be om tilgang
          </li>
          <li style={{ paddingLeft: 14, position: 'relative', marginBottom: 4 }}>
            <span style={{ position: 'absolute', left: 0, color: 'var(--accent)' }}>·</span>
            Generalsekretæren må godkjenne forespørselen
          </li>
          <li style={{ paddingLeft: 14, position: 'relative' }}>
            <span style={{ position: 'absolute', left: 0, color: 'var(--accent)' }}>·</span>
            Godkjent tilgang varer i 24 timer
          </li>
        </ul>

        <button
          type="button"
          onClick={() => setRedigerer(true)}
          style={{
            width: '100%',
            padding: '10px 0',
            background: 'var(--accent)',
            border: 'none',
            borderRadius: 999,
            color: '#0a0a0a',
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Fyll ut pass-info
        </button>
      </div>
    )
  }

  return (
    <div
      style={{
        padding: '14px 16px',
        background: 'var(--bg-elevated)',
        border: '0.5px solid var(--border)',
        borderRadius: 'var(--radius-card)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--accent)',
              letterSpacing: '1.6px',
              textTransform: 'uppercase',
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            Pass-info
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              color: 'var(--text-primary)',
              letterSpacing: '0.5px',
            }}
          >
            {sladdet(nummer!)} · gyldig til {formaterDato(`${utloper}T12:00:00Z`, 'd. MMM yyyy')}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setRedigerer(true)}
          style={{
            padding: '8px 14px',
            background: 'transparent',
            border: '0.5px solid var(--border)',
            borderRadius: 999,
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          Endre
        </button>
      </div>
      <div
        style={{
          marginTop: 10,
          paddingTop: 10,
          borderTop: '0.5px solid var(--border-subtle)',
          fontFamily: 'var(--font-body)',
          fontSize: 11.5,
          color: 'var(--text-tertiary)',
          lineHeight: 1.45,
        }}
      >
        Kun synlig for deg. Arrangør av kommende tur du er meldt på (Ja) kan be om
        24-timers tilgang via generalsekretæren.
      </div>
    </div>
  )
}
