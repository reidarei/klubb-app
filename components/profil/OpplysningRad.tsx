import type { CSSProperties, ReactNode } from 'react'

/**
 * Visuell primitiv for en «opplysnings-rad» på /profil (visning, se
 * `EgneOpplysninger.tsx`): etikett venstre, verdi høyre, samme linje.
 * Ligger inni en SkjemaGruppe-boks, som gir skillelinjene (.panel-liste).
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
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div
      // Stabilt feste for e2e-vakten (#685-review): den finner både verdien
      // og etikett-settet på /profil og /profil/rediger uten å kjenne
      // DOM-formen på hver av dem.
      data-opplysning={label}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        minHeight: 48,
        padding: '10px 14px',
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
        // Samme etikettstil som SkjemaRad (Skjema.tsx), så visning og redigering ser like ut.
        fontFamily: 'var(--font-body)',
        fontSize: 15,
        color: 'var(--text-primary)',
        lineHeight: 1.25,
        flexShrink: 0,
        maxWidth: '45%',
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
    fontSize: 15,
    lineHeight: 1.4,
    color: dempet ? 'var(--text-tertiary)' : 'var(--text-primary)',
    letterSpacing: mono ? '0.2px' : '0.1px',
    textAlign: 'right',
    // Verdien wrapper fritt i stedet for å kappes med ellipsis (#683) —
    // gjelder like mye for et redigerbart felt som for ren visning.
    overflowWrap: 'break-word',
    minWidth: 0,
    flex: 1,
  }
}
