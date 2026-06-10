import type { CSSProperties, ReactNode } from 'react'

type Variant = 'accent' | 'success' | 'danger' | 'neutral'

const VARIANTER: Record<Variant, { bg: string; color: string; border: string }> = {
  accent: { bg: 'var(--accent-soft)', color: 'var(--accent-hot)', border: 'var(--border-strong)' },
  success: { bg: 'var(--success-soft)', color: '#94c9a2', border: 'var(--success-border)' },
  danger: { bg: 'var(--danger-soft)', color: '#e89b94', border: 'var(--danger-border)' },
  neutral: { bg: 'var(--border-subtle)', color: 'var(--text-secondary)', border: 'var(--border)' },
}

type Props = {
  children: ReactNode
  variant?: Variant
  small?: boolean
  style?: CSSProperties
}

export default function Pill({ children, variant = 'neutral', small = false, style }: Props) {
  const v = VARIANTER[variant]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: small ? '2px 7px' : '3px 9px',
        fontSize: small ? 10 : 11,
        fontWeight: 600,
        fontFamily: 'var(--font-body)',
        letterSpacing: '0.3px',
        borderRadius: 999,
        background: v.bg,
        color: v.color,
        border: `0.5px solid ${v.border}`,
        textTransform: 'uppercase',
        ...style,
      }}
    >
      {children}
    </span>
  )
}

/**
 * Særtilfelle — solid "I KVELD"-chip på HighlightKort.
 * Ikke en Pill-variant: egen farge og form.
 */
export function IKveldChip({ children = 'I KVELD' }: { children?: ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 10px',
        fontSize: 10,
        fontWeight: 700,
        fontFamily: 'var(--font-body)',
        letterSpacing: '1.2px',
        borderRadius: 999,
        background: 'var(--accent-hot)',
        color: '#1a1208',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </span>
  )
}
