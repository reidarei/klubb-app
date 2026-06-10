import type { ReactNode } from 'react'

type Props = {
  overtittel: string
  tittel: string
  avbrytLabel?: string
  lagreLabel?: string
  onAvbryt?: () => void
  /** Når gitt, vises Lagre som en vanlig knapp. Ellers brukes children til egendefinert høyre-knapp. */
  onLagre?: () => void
  laster?: boolean
  /** Overstyrer Lagre-knappen helt */
  hoyre?: ReactNode
}

export default function SkjemaBar({
  overtittel,
  tittel,
  avbrytLabel = 'Avbryt',
  lagreLabel = 'Lagre',
  onAvbryt,
  onLagre,
  laster,
  hoyre,
}: Props) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '2px 0 14px',
        marginBottom: 8,
      }}
    >
      <button
        type="button"
        onClick={onAvbryt}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          cursor: 'pointer',
          padding: '4px 0',
        }}
      >
        {avbrytLabel}
      </button>

      <div style={{ textAlign: 'center', minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            fontWeight: 600,
            color: 'var(--text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '2px',
            marginBottom: 2,
          }}
        >
          {overtittel}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 16,
            fontWeight: 500,
            letterSpacing: '-0.2px',
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {tittel}
        </div>
      </div>

      {hoyre ?? (
        <button
          type="button"
          onClick={onLagre}
          disabled={laster}
          style={{
            background: 'var(--accent)',
            color: '#0a0a0a',
            padding: '7px 14px',
            border: 'none',
            borderRadius: 999,
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            fontWeight: 600,
            cursor: laster ? 'wait' : 'pointer',
            opacity: laster ? 0.7 : 1,
          }}
        >
          {laster ? 'Lagrer…' : lagreLabel}
        </button>
      )}
    </div>
  )
}
