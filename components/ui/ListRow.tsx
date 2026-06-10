import Link from 'next/link'
import { ReactNode } from 'react'
import { ChevronRightIcon } from '@heroicons/react/24/outline'

export default function ListRow({
  href,
  icon,
  title,
  subtitle,
}: {
  href: string
  icon: ReactNode
  title: string
  subtitle?: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3.5 px-5 py-3.5 transition-colors"
      style={{
        borderBottom: '0.5px solid var(--border-subtle)',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: 'var(--bg-tertiary)' }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-medium" style={{ color: 'var(--text-primary)' }}>{title}</p>
        {subtitle && (
          <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>{subtitle}</p>
        )}
      </div>
      <ChevronRightIcon className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
    </Link>
  )
}
