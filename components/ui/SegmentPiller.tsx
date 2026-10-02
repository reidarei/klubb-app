'use client'

import { treffflateRundt } from '@/components/ui/Treffflate'

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

// Synlig pillehøyde (#700): padding 6px topp/bunn + ~15 px tekstlinje ved
// fontSize 12. Kun vertikal utvidelse — bredden er tekst-drevet og ligger
// allerede godt over 44 px for alle labels i bruk i dag («Alt», «Viktig», …).
// Målt pillehøyde er 32 px (ikke 27): da blir boksen 44 px og ikke 50 — mindre usynlig overlapp
// mot naboer over/under (en nabo som overlapper stjeler treffpunkter, #700).
const SYNLIG_HOYDE = 32
const TREFF = treffflateRundt({ hoyde: SYNLIG_HOYDE })

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
    // Radgap (#508-fella): pillene vokser inn i luften over/under seg selv,
    // men står i ÉN rad uten linjebryting (ingen flexWrap) — det finnes ingen
    // nabo-rad treffområdet kan overlappe med.
    <div style={{ display: 'flex', gap: 6 }}>
      {valg.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onVelg(key)}
          disabled={disabled}
          aria-pressed={aktiv === key}
          style={{
            // Usynlig knapp: ingen egen bakgrunn/kant/padding her, kun den
            // vertikale treffflate-utvidelsen. Padding+negativ margin holder
            // den SYNLIGE pillen (span under) i nøyaktig samme posisjon —
            // bredden/radgapet i raden er derfor også uendret.
            background: 'transparent',
            border: 'none',
            padding: 0,
            opacity: disabled ? 0.6 : 1,
            ...TREFF.stil,
          }}
        >
          <span
            style={{
              display: 'block',
              background: aktiv === key ? 'var(--accent-soft)' : 'transparent',
              border: '0.5px solid var(--border-subtle)',
              borderRadius: 999,
              padding: '6px 14px',
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              fontWeight: 600,
              color: aktiv === key ? 'var(--accent)' : 'var(--text-tertiary)',
              letterSpacing: '-0.1px',
            }}
          >
            {label}
          </span>
        </button>
      ))}
    </div>
  )
}
