import Link from 'next/link'
import type { ReactNode } from 'react'
import Icon, { type IkonNavn } from '@/components/ui/Icon'

// Én rad på kontrollpanelets forside: ikon, navn, status til høyre, pil.
// Samme radmønster som Klubb-siden, så admin-flaten ser ut som resten av appen.
export function PanelRad({
  href,
  ikon,
  tittel,
  status,
  varsle = false,
}: {
  href: string
  ikon: IkonNavn
  tittel: string
  /** Kort status til høyre, f.eks. «28 av 31 på». */
  status?: ReactNode
  /** Fremhev statusen — noe venter på admin eller står i en uvanlig tilstand. */
  varsle?: boolean
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '15px 4px',
        minHeight: 52,
        borderBottom: '0.5px solid var(--border-subtle)',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <span style={{ width: 22, flexShrink: 0, display: 'flex' }}>
        <Icon name={ikon} size={18} color="var(--text-secondary)" strokeWidth={1.4} />
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontFamily: 'var(--font-display)',
          fontSize: 18,
          fontWeight: 500,
          color: 'var(--text-primary)',
          letterSpacing: '-0.3px',
          lineHeight: 1.15,
        }}
      >
        {tittel}
      </span>
      {status != null && (
        <span
          style={
            varsle
              ? {
                  padding: '3px 9px',
                  borderRadius: 999,
                  background: 'var(--accent)',
                  color: 'var(--accent-foreground)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }
              : {
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  letterSpacing: '0.5px',
                  whiteSpace: 'nowrap',
                }
          }
        >
          {status}
        </span>
      )}
      <Icon name="chevron" size={14} color="var(--text-tertiary)" />
    </Link>
  )
}

// Gruppeoverskrift + radene under. Overskriften har samme form som
// seksjons-labelen på Klubb-siden.
export function PanelGruppe({ tittel, children }: { tittel: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--text-tertiary)',
          letterSpacing: '2px',
          textTransform: 'uppercase',
          margin: '0 0 4px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontWeight: 600,
        }}
      >
        {tittel}
        <span style={{ flex: 1, height: '0.5px', background: 'var(--border-subtle)' }} />
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column' }}>{children}</div>
    </section>
  )
}
