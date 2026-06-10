import KaaringKandidat from './KaaringKandidat'

type Props = {
  navn: string
  bildeUrl?: string | null
  rolle?: string | null
  variant: 'profil' | 'arrangement'
  undertittel?: string
}

// Sticky-top vinnerbanner for avgjort kåringspoll.
export default function VinnerBanner({ navn, bildeUrl, rolle, variant, undertittel }: Props) {
  return (
    <div
      style={{
        position: 'sticky',
        // Stikk under sticky TopHeader (z-30) — uten dette havner banneret bak headeren.
        top: 'calc(var(--top-header-h, 60px) + env(safe-area-inset-top))',
        zIndex: 5,
        margin: '0 -20px 24px',
        padding: '18px 20px',
        background: 'var(--accent-soft)',
        borderBottom: '0.5px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <KaaringKandidat
        navn={navn}
        bildeUrl={bildeUrl}
        rolle={rolle}
        variant={variant}
        size={56}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            fontWeight: 600,
            color: 'var(--accent)',
            letterSpacing: '1.6px',
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
        >
          Vinner
        </div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            fontWeight: 500,
            color: 'var(--text-primary)',
            letterSpacing: '-0.3px',
            lineHeight: 1.15,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {navn}
        </div>
        {undertittel && (
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              color: 'var(--text-secondary)',
              marginTop: 2,
            }}
          >
            {undertittel}
          </div>
        )}
      </div>
    </div>
  )
}
