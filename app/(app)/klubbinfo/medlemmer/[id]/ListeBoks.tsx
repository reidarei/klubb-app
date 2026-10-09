'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MIN_TREFFMAAL_PX } from '@/lib/konstanter'

export type ListeRad = {
  id: string
  tittel: string
  /** Liten linje under tittelen (arrangementnavn). */
  undertekst?: string | null
  /** Begrunnelse for en kåring, vist kursivt i anførselstegn under undertittelen. */
  begrunnelse?: string | null
  /** Verdien til høyre (år, måned + år). */
  hoyre: string
  href?: string
}

const MAKS_SYNLIG = 5

const RAD_STIL: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 14,
  padding: '11px 14px',
  minHeight: 54,
  textDecoration: 'none',
  color: 'inherit',
}

// Boks med overskrift og rader (samme stil som PanelGruppe). Viser maks 5 og en
// «Se alle N»-rad som utvider lista på stedet.
export default function ListeBoks({ tittel, rader }: { tittel: string; rader: ListeRad[] }) {
  const [alle, setAlle] = useState(false)
  const synlige = alle ? rader : rader.slice(0, MAKS_SYNLIG)

  return (
    <section style={{ marginBottom: 22 }}>
      <h2
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--text-tertiary)',
          letterSpacing: '1.6px',
          textTransform: 'uppercase',
          fontWeight: 600,
          margin: '0 0 8px 4px',
        }}
      >
        {tittel} · {rader.length}
      </h2>
      <div
        className="panel-liste"
        style={{
          borderRadius: 14,
          border: '0.5px solid var(--border)',
          background: 'var(--bg-elevated)',
          overflow: 'hidden',
        }}
      >
        {synlige.map(r => {
          const innhold = (
            <>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.25 }}>
                  {r.tittel}
                </span>
                {r.undertekst && (
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.3, overflowWrap: 'anywhere' }}>
                    {r.undertekst}
                  </span>
                )}
                {r.begrunnelse && (
                  <span
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 12,
                      fontStyle: 'italic',
                      color: 'var(--text-tertiary)',
                      lineHeight: 1.4,
                      overflowWrap: 'anywhere',
                      display: '-webkit-box',
                      WebkitBoxOrient: 'vertical',
                      WebkitLineClamp: 2,
                      overflow: 'hidden',
                    }}
                  >
                    «{r.begrunnelse}»
                  </span>
                )}
              </span>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                {r.hoyre}
              </span>
            </>
          )
          return r.href ? (
            <Link key={r.id} href={r.href} style={RAD_STIL}>
              {innhold}
            </Link>
          ) : (
            <div key={r.id} style={RAD_STIL}>
              {innhold}
            </div>
          )
        })}
        {!alle && rader.length > MAKS_SYNLIG && (
          <button
            type="button"
            onClick={() => setAlle(true)}
            style={{
              ...RAD_STIL,
              width: '100%',
              background: 'transparent',
              border: 'none',
              justifyContent: 'center',
              minHeight: MIN_TREFFMAAL_PX,
              cursor: 'pointer',
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--accent)',
            }}
          >
            Se alle {rader.length}
          </button>
        )}
      </div>
    </section>
  )
}
