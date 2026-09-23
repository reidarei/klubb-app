type Type = 'tur' | 'møte' | 'event'

type Props = {
  label?: string
  aspectRatio?: string
  type?: Type
  className?: string
}

const SCENES: Record<Type, string> = {
  tur: `linear-gradient(180deg, var(--accent-soft) 0%, transparent 60%),
        linear-gradient(135deg, oklch(0.22 0.03 230), oklch(0.14 0.04 260))`,
  møte: `linear-gradient(180deg, var(--accent-soft) 0%, transparent 60%),
         linear-gradient(135deg, oklch(0.20 0.02 40), oklch(0.12 0.02 30))`,
  event: `linear-gradient(180deg, var(--accent-soft) 0%, transparent 60%),
          linear-gradient(135deg, oklch(0.20 0.03 200), oklch(0.13 0.03 220))`,
}

export default function Placeholder({
  label,
  aspectRatio = '16/9',
  type = 'event',
  className,
}: Props) {
  const patternId = `stripes-${label ?? type}-${Math.random().toString(36).slice(2, 7)}`
  return (
    <div
      className={className}
      style={{
        aspectRatio,
        background: SCENES[type],
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'flex-end',
        padding: 14,
      }}
    >
      <svg
        width="100%"
        height="100%"
        style={{ position: 'absolute', inset: 0, opacity: 0.08 }}
        aria-hidden="true"
      >
        <defs>
          <pattern
            id={patternId}
            patternUnits="userSpaceOnUse"
            width="8"
            height="8"
            patternTransform="rotate(45)"
          >
            <rect width="4" height="8" fill="var(--accent)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
      {label && (
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-tertiary)',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            position: 'relative',
          }}
        >
          {label}
        </span>
      )}
    </div>
  )
}
