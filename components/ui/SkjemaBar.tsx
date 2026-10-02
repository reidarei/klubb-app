import type { ReactNode } from 'react'
import { treffflateRundt } from '@/components/ui/Treffflate'
import { MIN_TREFFMAAL_PX } from '@/lib/konstanter'

// Synlig høyde (#700), kun vertikal utvidelse (jf. SegmentPiller/Segment —
// bredden er aldri det trange målet på disse to). Tallene er bevisst satt
// LAVERE enn reell rendret høyde (Avbryt ~28 px, Lagre ~32 px med dagens
// padding/fontSize): det gir noe MER usynlig treffflate enn strengt
// nødvendig i stedet for å risikere å lande under 44 px på en finjustering
// av skrifttype/linjehøyde vi ikke kontrollerer presist her.
const AVBRYT_TREFF = treffflateRundt({ hoyde: 24 })
const LAGRE_TREFF = treffflateRundt({ hoyde: 28 })

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
          // 4px er den ORIGINALE, synlige avstanden — treffflate-utvidelsen
          // legges PÅ TOPP av den og kanselleres av samme negative margin
          // (#700), så teksten står i nøyaktig samme punkt som før.
          paddingTop: 4 + AVBRYT_TREFF.utvidY,
          paddingBottom: 4 + AVBRYT_TREFF.utvidY,
          paddingLeft: 0,
          paddingRight: 0,
          // «Avbryt» er ~42 px bred; uten minWidth bommer pluss-punktet ytterst til høyre (#700).
          // Venstrejustert så teksten står der den stod — utvidelsen havner mot tittelen, som ikke er klikkbar.
          minWidth: MIN_TREFFMAAL_PX,
          textAlign: 'left',
          flexShrink: 0,
          marginTop: -AVBRYT_TREFF.utvidY,
          marginBottom: -AVBRYT_TREFF.utvidY,
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
            // Usynlig knapp: bakgrunn/kant/padding sitter på den synlige
            // pillen (span under), ikke her — ellers ville treffflate-
            // utvidelsen blåst opp selve pillen (#700).
            background: 'transparent',
            border: 'none',
            padding: 0,
            ...LAGRE_TREFF.stil,
          }}
        >
          <span
            style={{
              display: 'block',
              background: 'var(--accent)',
              color: 'var(--accent-foreground)',
              padding: '7px 14px',
              borderRadius: 999,
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              fontWeight: 600,
              opacity: laster ? 0.7 : 1,
            }}
          >
            {laster ? 'Lagrer…' : lagreLabel}
          </span>
        </button>
      )}
    </div>
  )
}
