import { ReactNode } from 'react'

type Variant = 'accent' | 'success' | 'danger' | 'neutral'

const styles: Record<Variant, React.CSSProperties> = {
  accent: {
    background: 'var(--accent-soft)',
    color: 'var(--accent)',
  },
  success: {
    background: 'var(--success-soft)',
    color: 'var(--success)',
  },
  danger: {
    background: 'var(--danger-soft)',
    color: 'var(--danger)',
  },
  neutral: {
    background: 'var(--bg-elevated-2)',
    color: 'var(--text-secondary)',
  },
}

export default function Badge({
  children,
  variant = 'accent',
}: {
  children: ReactNode
  variant?: Variant
}) {
  return (
    <span
      className="text-xs font-semibold px-2.5 py-1 rounded-full"
      style={styles[variant]}
    >
      {children}
    </span>
  )
}
