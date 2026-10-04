import Link from 'next/link'
import type { ReactNode } from 'react'
import Icon, { type IkonNavn } from '@/components/ui/Icon'

export type PanelFarge = 'gul' | 'groenn' | 'blaa' | 'lilla' | 'sand' | 'rosa' | 'turkis' | 'graa'

// Hvordan statusen til høyre vises: vanlig tekst, eller en brikke når noe
// venter på admin (varsle) eller er i orden (ok).
export type PanelTone = 'noeytral' | 'varsle' | 'ok'

const BRIKKE: Record<Exclude<PanelTone, 'noeytral'>, { bakgrunn: string; farge: string }> = {
  varsle: { bakgrunn: 'var(--warning-soft)', farge: 'var(--warning)' },
  ok: { bakgrunn: 'var(--success-soft)', farge: 'var(--success)' },
}

// Én rad på kontrollpanelets forside: farget ikonfirkant, navn, status til
// høyre og pil. Ligger inni en PanelGruppe-boks.
export function PanelRad({
  href,
  ikon,
  farge,
  tittel,
  undertekst,
  status,
  tone = 'noeytral',
}: {
  href: string
  ikon: IkonNavn
  farge: PanelFarge
  tittel: string
  undertekst?: string
  /** Kort status til høyre, f.eks. «28 av 31 på». */
  status?: ReactNode
  tone?: PanelTone
}) {
  const brikke = tone === 'noeytral' ? null : BRIKKE[tone]
  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '11px 14px',
        minHeight: 54,
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <span
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          background: `var(--panel-ikon-${farge})`,
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
        }}
      >
        <Icon name={ikon} size={16} color="var(--panel-ikon-tegn)" strokeWidth={2} />
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 15,
            fontWeight: 500,
            color: 'var(--text-primary)',
            lineHeight: 1.25,
          }}
        >
          {tittel}
        </span>
        {undertekst && (
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              color: 'var(--text-tertiary)',
              lineHeight: 1.3,
            }}
          >
            {undertekst}
          </span>
        )}
      </span>
      {status != null && (
        <span
          style={
            brikke
              ? {
                  padding: '3px 9px',
                  borderRadius: 999,
                  background: brikke.bakgrunn,
                  color: brikke.farge,
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }
              : {
                  fontFamily: 'var(--font-body)',
                  fontSize: 13,
                  color: 'var(--text-tertiary)',
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

// Gruppeoverskrift + en avrundet boks med radene. Skillelinjene mellom radene
// kommer fra klassen panel-liste i globals.css.
export function PanelGruppe({ tittel, children }: { tittel: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 22 }}>
      <h2
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--text-tertiary)',
          letterSpacing: '1.6px',
          textTransform: 'uppercase',
          fontWeight: 600,
          margin: '0 0 8px 4px',
        }}
      >
        {tittel}
      </h2>
      <div
        className="panel-liste"
        style={{
          borderRadius: 14,
          border: '0.5px solid var(--border)',
          background: 'var(--bg-elevated)',
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </section>
  )
}
