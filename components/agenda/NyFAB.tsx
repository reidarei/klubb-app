'use client'

import { useState, useRef, useEffect, type CSSProperties } from 'react'
import Link from 'next/link'
import Icon, { type IkonNavn } from '@/components/ui/Icon'

type Valg = {
  label: string
  href: string
  ikon: IkonNavn
}

// De fire typene element som kan opprettes på agenda. Speiler typene
// definert i lib/agenda-sortering.ts (Møte/Tur er underkategorier av
// arrangement, Poll og Melding er egne tabeller). Kåringer opprettes
// fra /kaaringer-siden (#144), ikke fra denne menyen.
const VALG: Valg[] = [
  { label: 'Møte', href: '/arrangementer/ny?type=moete', ikon: 'calendar' },
  { label: 'Tur', href: '/arrangementer/ny?type=tur', ikon: 'plane' },
  { label: 'Poll', href: '/poll/ny', ikon: 'chart' },
  { label: 'Melding', href: '/meldinger/ny', ikon: 'message' },
]

/**
 * Plussknapp i agenda-header som ekspanderer til en meny med valg av
 * hva slags nytt element som skal opprettes. Lukkes ved klikk utenfor
 * eller ved å trykke knappen igjen. Esc er ikke støttet — mobil først.
 */
export default function NyFAB() {
  const [apen, setApen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!apen) return
    function handleClick(e: Event) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setApen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('touchstart', handleClick)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('touchstart', handleClick)
    }
  }, [apen])

  const knappStil: CSSProperties = {
    width: 52,
    height: 52,
    borderRadius: '50%',
    background: 'var(--accent-soft)',
    border: '0.5px solid var(--border-strong)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--accent)',
    cursor: 'pointer',
    padding: 0,
    transition: 'transform 180ms ease-out',
    transform: apen ? 'rotate(45deg)' : 'rotate(0deg)',
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setApen(v => !v)}
        aria-label="Nytt element"
        aria-expanded={apen}
        aria-haspopup="menu"
        style={knappStil}
      >
        <Icon name="plus" size={24} color="var(--accent)" strokeWidth={1.8} />
      </button>

      {apen && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            right: 0,
            minWidth: 210,
            background: 'var(--bg-elevated)',
            border: '0.5px solid var(--border)',
            borderRadius: 'var(--radius-card)',
            boxShadow: '0 10px 28px rgba(0,0,0,0.35)',
            overflow: 'hidden',
            zIndex: 20,
          }}
        >
          {VALG.map((v, i) => (
            <Link
              key={v.label}
              href={v.href}
              role="menuitem"
              onClick={() => setApen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '14px 18px',
                color: 'var(--text-primary)',
                textDecoration: 'none',
                fontFamily: 'var(--font-body)',
                fontSize: 15,
                borderBottom:
                  i < VALG.length - 1 ? '0.5px solid var(--border-subtle)' : 'none',
              }}
            >
              <Icon name={v.ikon} size={20} color="var(--accent)" strokeWidth={1.6} />
              {v.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
