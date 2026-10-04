import type { ReactNode } from 'react'

// Ramme rundt en liste med brytere på en underside i kontrollpanelet.
// Valgfri overskrift over rammen, valgfri forklaring under.
export default function BryterBoks({
  tittel,
  fotnote,
  children,
}: {
  tittel?: string
  fotnote?: ReactNode
  children: ReactNode
}) {
  return (
    <section style={{ marginBottom: 22 }}>
      {tittel && (
        <h2
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-tertiary)',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            fontWeight: 600,
            margin: '0 0 8px 4px',
          }}
        >
          {tittel}
        </h2>
      )}
      <div
        style={{
          borderRadius: 12,
          border: '0.5px solid var(--border)',
          background: 'var(--bg-elevated)',
          padding: '0 12px',
        }}
      >
        {children}
      </div>
      {fotnote && (
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            color: 'var(--text-tertiary)',
            lineHeight: 1.45,
            margin: '8px 4px 0',
          }}
        >
          {fotnote}
        </p>
      )}
    </section>
  )
}
