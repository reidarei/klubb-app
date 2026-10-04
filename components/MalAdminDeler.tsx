'use client'

// Felles deler for malene i kontrollpanelet (faste arrangementer, kåringer):
// pilleknappene og en rad som ikke er et felt (navn + knapper). Resten bygges
// med Skjema.tsx — se «Policy: Skjemaer» i CLAUDE.md.

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import { treffflateRundt } from '@/components/ui/Treffflate'
import { MIN_TREFFMAAL_PX } from '@/lib/konstanter'

// Synlig pille: 26 px høy (text-xs + py-1 + 1 px kant), minWidth 44 (#700).
const ADMIN_KNAPP_TREFF = treffflateRundt({ hoyde: 26 })

// Usynlig knapp vokser vertikalt til 44; pillen inni bærer utseendet og får reell
// minstebredde, så ingen X-utvidelse trengs og gap-1 mellom naboer overlapper ikke.
export function AdminKnapp({
  stil,
  children,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style' | 'className' | 'type'> & { stil: CSSProperties }) {
  return (
    <button
      type="button"
      {...props}
      style={{
        ...ADMIN_KNAPP_TREFF.stil,
        background: 'none',
        border: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        flexShrink: 0,
        fontFamily: 'inherit',
      }}
    >
      <span
        className="text-xs px-2 py-1 rounded-lg"
        style={{ display: 'block', minWidth: MIN_TREFFMAAL_PX, textAlign: 'center', border: '1px solid transparent', ...stil }}
      >
        {children}
      </span>
    </button>
  )
}

export const KNAPP_NORMAL: CSSProperties = { border: '1px solid var(--border)', color: 'var(--text-secondary)', background: 'none' }

/** Rad uten felt: innhold til venstre, knapper til høyre. Samme høyde som SkjemaRad. */
export function ListeRad({ venstre, children }: { venstre?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 48, padding: '0 14px' }}>
      <div style={{ flex: 1, minWidth: 0 }}>{venstre}</div>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>{children}</div>
    </div>
  )
}
