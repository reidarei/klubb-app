'use client'

// Segmentert velger i PILLE-form (avrundede knapper side om side).
//
// Ikke å forveksle med `components/ui/Segment.tsx`, som er den fullbredde
// tab-baren med understrek-indikator. De to er ulike visuelle idiomer med
// hvert sitt bruksområde: Segment er en fane som deler en hel side i to,
// SegmentPiller er et kompakt filter/valg inne i en seksjon.
//
// Trukket ut fordi VarslerListe («Viktig»/«Alt»-fanen i innboksen) og
// VarslerInnstillinger (nivåvalget på /profil) hadde byte-identisk styling i
// to kopier — og de SKAL se identiske ut, fordi de bevisst bruker samme
// begrepspar (#614-review).
//
// Bevisst tynn, jf. Policy: Avatar: ingen `style`-prop og ingen varianter.
// Trenger et kallsted marger eller padding rundt, wrapper det selv i en div.
export default function SegmentPiller<T extends string>({
  valg,
  aktiv,
  onVelg,
  disabled = false,
}: {
  valg: readonly { key: T; label: string }[]
  aktiv: T
  onVelg: (key: T) => void
  // Under lagring: knappene låses og dempes, så et raskt dobbelttrykk ikke
  // sender to PUT-er som kan lande i motsatt rekkefølge.
  disabled?: boolean
}) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {valg.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onVelg(key)}
          disabled={disabled}
          aria-pressed={aktiv === key}
          style={{
            background: aktiv === key ? 'var(--accent-soft)' : 'transparent',
            border: '0.5px solid var(--border-subtle)',
            borderRadius: 999,
            padding: '6px 14px',
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            fontWeight: 600,
            color: aktiv === key ? 'var(--accent)' : 'var(--text-tertiary)',
            cursor: disabled ? 'default' : 'pointer',
            opacity: disabled ? 0.6 : 1,
            letterSpacing: '-0.1px',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
