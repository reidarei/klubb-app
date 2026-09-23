import type { CSSProperties, ReactNode } from 'react'

type Props = {
  children: ReactNode
  className?: string
  style?: CSSProperties
  /** Accent-variant: kremgul bakgrunnstone og sterkere border */
  accent?: boolean
  /** Legger på standard padding (20px). Default true. */
  padding?: boolean
}

export default function Card({
  children,
  className = '',
  style,
  accent = false,
  padding = true,
}: Props) {
  return (
    <div
      className={className}
      style={{
        background: accent ? 'var(--accent-soft)' : 'var(--bg-elevated)',
        backdropFilter: 'var(--blur-card)',
        WebkitBackdropFilter: 'var(--blur-card)',
        border: `1px solid ${accent ? 'var(--border-strong)' : 'var(--border)'}`,
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        padding: padding ? 20 : 0,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
