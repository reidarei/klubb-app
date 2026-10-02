// Ingen 'use client': ren layout, brukes fra både server- og klientkomponenter.
import type { ReactNode } from 'react'

/**
 * Rad i et skjema med etikett over og et ubrukt, kantløst felt under (#700 PR 3).
 * Samlet her etter å ha stått kopiert i seks skjemaer. Feltet er minst 44 px høyt
 * (klassen `skjemafelt`, regelen står i globals.css), så raden har bare 4 px vertikal luft — 10 px som før
 * ville gjort hvert felt til en 64+ px høy rad.
 */
export default function FeltRad({ last, children }: { last?: boolean; children: ReactNode }) {
  return (
    <div
      className="skjemafelt"
      style={{
        padding: '4px 4px',
        borderBottom: last ? 'none' : '0.5px solid var(--border-subtle)',
      }}
    >
      {children}
    </div>
  )
}
