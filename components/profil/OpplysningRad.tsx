import type { CSSProperties, ReactNode } from 'react'

/**
 * Visuell primitiv for en «opplysnings-rad» på /profil (visning, se
 * `EgneOpplysninger.tsx`): etikett venstre, verdi høyre, samme linje.
 *
 * Kun VISNING. Redigeringsskjemaet (`/profil/rediger`) bruker
 * byggeklossene i `components/ui/Skjema.tsx` (Policy: Skjemaer), med samme
 * rader i samme rekkefølge (vaktet av e2e/profil-opplysninger.spec.ts).
 *
 * INGEN `'use client'`: brukes fra en server component, og
 * `opplysningVerdiStil()` kalles direkte derfra.
 */
export default function OpplysningRad({
  label,
  children,
  last,
}: {
  label: string
  children: ReactNode
  last?: boolean
}) {
  return (
    <div
      // Stabilt feste for e2e-vakten (#685-review): den finner både verdien
      // og etikett-settet på /profil og /profil/rediger uten å kjenne
      // DOM-formen på hver av dem.
      data-opplysning={label}
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 12,
        padding: '8px 4px',
        borderBottom: last ? 'none' : '0.5px solid var(--border-subtle)',
      }}
    >
      <OpplysningLabel>{label}</OpplysningLabel>
      {children}
    </div>
  )
}

export function OpplysningLabel({ children }: { children: ReactNode }) {
  return (
    <div
      className="opplysning-etikett"
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9.5,
        fontWeight: 600,
        color: 'var(--text-tertiary)',
        textTransform: 'uppercase',
        letterSpacing: '1.6px',
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  )
}

/**
 * Verdi-stil delt mellom visning og redigering. `dempet` er eksplisitt satt
 * av kalleren (ikke utledet her) fordi betydningen er ulik i de to
 * tilstandene: på visningssiden betyr det «feltet er tomt», i skjemaet
 * betyr det «feltet er ikke redigerbart» (e-post).
 */
export function opplysningVerdiStil({
  mono,
  dempet,
}: { mono?: boolean; dempet?: boolean } = {}): CSSProperties {
  return {
    fontFamily: mono ? 'var(--font-mono)' : 'var(--font-body)',
    fontSize: 14,
    lineHeight: 1.4,
    color: dempet ? 'var(--text-tertiary)' : 'var(--text-primary)',
    letterSpacing: mono ? '0.2px' : '0.1px',
    textAlign: 'right',
    // Verdien wrapper fritt i stedet for å kappes med ellipsis (#683) —
    // gjelder like mye for et redigerbart felt som for ren visning.
    overflowWrap: 'break-word',
    minWidth: 0,
  }
}
