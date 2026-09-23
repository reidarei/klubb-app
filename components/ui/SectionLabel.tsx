import type { CSSProperties, ReactNode } from 'react'

type Props = {
  children: ReactNode
  /** Valgfritt antall som vises mellom label og hairline */
  count?: number
  style?: CSSProperties
}

export default function SectionLabel({ children, count, style }: Props) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        fontWeight: 500,
        color: 'var(--text-tertiary)',
        textTransform: 'uppercase',
        letterSpacing: '1.6px',
        marginBottom: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        ...style,
      }}
    >
      <span>{children}</span>
      {typeof count === 'number' && (
        <span style={{ color: 'var(--text-secondary)' }}>{count}</span>
      )}
      <span style={{ flex: 1, height: '0.5px', background: 'var(--border-subtle)' }} />
    </div>
  )
}
