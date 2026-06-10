import type { CSSProperties, ReactNode } from 'react'

type Props = {
  label: string
  children: ReactNode
  /** Siste rad i en seksjon — fjerner borderBottom */
  last?: boolean
  /** Kremgul display-stil på verdien */
  accent?: boolean
  /** Element til høyre i verdi-raden (kalender-ikon, toggle, chevron) */
  trailing?: ReactNode
  /** Kun label + trailing, ingen verdi-rad */
  emptyValue?: boolean
  style?: CSSProperties
}

export default function Field({
  label,
  children,
  last,
  accent,
  trailing,
  emptyValue,
  style,
}: Props) {
  const labelStyle: CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: 9.5,
    fontWeight: 600,
    color: 'var(--text-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: '1.6px',
    marginBottom: 4,
  }

  const valueStyle: CSSProperties = accent
    ? {
        fontFamily: 'var(--font-display)',
        fontSize: 19,
        fontWeight: 500,
        letterSpacing: '-0.3px',
        color: 'var(--accent)',
      }
    : {
        fontFamily: 'var(--font-body)',
        fontSize: 14,
        fontWeight: 400,
        color: 'var(--text-primary)',
        lineHeight: 1.5,
      }

  return (
    <div
      style={{
        padding: '10px 4px',
        borderBottom: last ? 'none' : '0.5px solid var(--border-subtle)',
        ...style,
      }}
    >
      <div style={labelStyle}>{label}</div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          justifyContent: trailing ? 'space-between' : 'flex-start',
        }}
      >
        {!emptyValue && <div style={{ ...valueStyle, flex: 1 }}>{children}</div>}
        {trailing && <div style={{ flexShrink: 0 }}>{trailing}</div>}
      </div>
    </div>
  )
}
