import type { CSSProperties, ReactNode } from 'react'

type Props = {
  children: ReactNode
  /** Valgfritt antall som vises som « · N» etter teksten */
  count?: number
  style?: CSSProperties
}

// Samme gruppeoverskrift som kontrollpanel/profil/fond: mono 10 px, 600,
// uppercase, ingen hårstrek, 4 px innrykk.
export default function SectionLabel({ children, count, style }: Props) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--text-tertiary)',
        textTransform: 'uppercase',
        letterSpacing: '1.6px',
        margin: '0 0 8px 4px',
        ...style,
      }}
    >
      {children}
      {typeof count === 'number' && ` · ${count}`}
    </div>
  )
}
