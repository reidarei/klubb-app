import { ReactNode } from 'react'

type Variant = 'accent' | 'success' | 'destructive' | 'neutral'

const styles: Record<Variant, React.CSSProperties> = {
  accent: {
    background: 'var(--accent-subtle)',
    color: 'var(--accent)',
  },
  success: {
    background: 'var(--success-subtle)',
    color: 'var(--success)',
  },
  destructive: {
    background: 'var(--destructive-subtle)',
    color: 'var(--destructive)',
  },
  neutral: {
    background: 'var(--bg-tertiary)',
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
