import { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive'

const styles: Record<Variant, React.CSSProperties> = {
  primary: {
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
  },
  secondary: {
    background: 'var(--bg-elevated-2)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: 'none',
  },
  destructive: {
    background: 'var(--destructive-subtle)',
    color: 'var(--destructive)',
    border: 'none',
  },
}

export default function Button({
  children,
  variant = 'primary',
  fullWidth = false,
  className = '',
  ...props
}: {
  children: ReactNode
  variant?: Variant
  fullWidth?: boolean
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`rounded-xl px-4 py-2.5 font-semibold text-sm transition-colors disabled:opacity-50 ${fullWidth ? 'w-full' : ''} ${className}`}
      style={{ ...styles[variant], fontFamily: 'inherit', cursor: 'pointer' }}
      {...props}
    >
      {children}
    </button>
  )
}
