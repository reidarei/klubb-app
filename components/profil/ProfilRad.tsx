import Link from 'next/link'
import type { ReactNode } from 'react'
import Icon from '@/components/ui/Icon'

// Rader i bokser på /profil (samme stil som Skjema.tsx og PanelRad.tsx), for
// de tilfellene SkjemaRad ikke passer: SkjemaRad er et <label> uten
// undertekst, og et <label> rundt en bryter-knapp gir dobbel aktivering.
// Ingen 'use client' — brukes fra både server- og klientkomponenter.

const ETIKETT = {
  fontFamily: 'var(--font-body)',
  fontSize: 15,
  color: 'var(--text-primary)',
  lineHeight: 1.25,
} as const

const UNDERTEKST = {
  fontFamily: 'var(--font-body)',
  fontSize: 12,
  color: 'var(--text-tertiary)',
  lineHeight: 1.3,
} as const

/** Rad med etikett (og valgfri undertekst) til venstre og et kontrollelement til høyre. */
export function ProfilRad({
  etikett,
  undertekst,
  children,
}: {
  etikett: string
  undertekst?: string
  children?: ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minHeight: 54,
        padding: '8px 14px',
      }}
    >
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={ETIKETT}>{etikett}</span>
        {undertekst && <span style={UNDERTEKST}>{undertekst}</span>}
      </span>
      {children}
    </div>
  )
}

/** Lenkerad uten ikonfirkant: etikett til venstre, valgfri verdi og pil til høyre. */
export function ProfilLenkeRad({
  href,
  etikett,
  status,
  aksent,
}: {
  href: string
  etikett: string
  status?: ReactNode
  aksent?: boolean
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minHeight: 48,
        padding: '0 14px',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <span style={{ ...ETIKETT, flex: 1, minWidth: 0, color: aksent ? 'var(--accent)' : 'var(--text-primary)' }}>
        {etikett}
      </span>
      {status != null && (
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
          {status}
        </span>
      )}
      <Icon name="chevron" size={14} color="var(--text-tertiary)" />
    </Link>
  )
}
