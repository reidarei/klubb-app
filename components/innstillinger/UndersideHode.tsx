import TilbakeKnapp from '@/components/ui/TilbakeKnapp'

// Felles topp for undersidene i kontrollpanelet: tilbake-pil, «Kontrollpanel»
// som eyebrow og sidens navn. Valgfri ingress forklarer hva siden styrer.
export default function UndersideHode({ tittel, ingress }: { tittel: string; ingress?: string }) {
  return (
    <header style={{ marginTop: 12, marginBottom: 22 }}>
      <div style={{ marginBottom: 4 }}>
        <TilbakeKnapp href="/innstillinger" til="Kontrollpanel" />
      </div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--text-tertiary)',
          letterSpacing: '1.6px',
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        Kontrollpanel
      </div>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 30,
          fontWeight: 500,
          letterSpacing: '-0.4px',
          margin: 0,
          color: 'var(--text-primary)',
        }}
      >
        {tittel}
      </h1>
      {ingress && (
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
            margin: '10px 0 0',
          }}
        >
          {ingress}
        </p>
      )}
    </header>
  )
}
