import type { ReactNode } from 'react'
import SectionLabel from './SectionLabel'

type Props = {
  label?: string
  count?: number
  children: ReactNode
}

/**
 * Seksjon i et skjema. Valgfri SectionLabel, deretter en container der
 * Field-rader stables. Container har ingen bakgrunn — hairlines kommer fra
 * Field-ene selv (borderBottom per rad).
 */
export default function SkjemaSeksjon({ label, count, children }: Props) {
  return (
    <section style={{ marginBottom: 28 }}>
      {label && <SectionLabel count={count}>{label}</SectionLabel>}
      <div>{children}</div>
    </section>
  )
}
