'use client'

import { useState } from 'react'
import { formaterDato } from '@/lib/dato'

// Vertikal kolonnegraf uten npm-dep — flexbox-divs med height i % mot seriens
// maksverdi. Nok for en admin-only trendvisning.
//
// Flyttet ut av page.tsx og gjort til klientkomponent i #561: søylene hadde
// verdien KUN i et title-attributt, og title vises ikke ved touch. På mobil —
// der denne siden faktisk leses — var grafen dermed en rekke søyler uten tall,
// uten akse og uten noen måte å finne ut hva de betydde.
//
// Tre lag med avlesning, i økende presisjon:
//   1. maksverdien står alltid, med en hårfin linje på 100 %-nivået → skala
//   2. korte serier (≤ TETT_GRENSE) får tallet over hver søyle → eksakt
//   3. trykk/hold på en søyle gir dato + verdi → eksakt også i tette serier

// Over denne lengden blir direkte tall-labels til grøt (56 dagssøyler er ~4 px
// brede). Ukesgrafen har 8 punkter og havner under grensen.
const TETT_GRENSE = 14

type Punkt = { nokkel: string; verdi: number }

export default function BarGraf({ data, enhet }: { data: Punkt[]; enhet: string }) {
  // Indeks for søyla brukeren peker på / har trykket. null = ingen.
  const [aktiv, setAktiv] = useState<number | null>(null)

  if (data.length === 0) {
    return (
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>
        Ingen data ennå.
      </p>
    )
  }

  const maks = Math.max(...data.map(d => d.verdi), 1)
  const visTall = data.length <= TETT_GRENSE
  const forste = formaterDato(data[0].nokkel, 'd. MMM')
  const siste = formaterDato(data[data.length - 1].nokkel, 'd. MMM')

  // Skjermlesere får et sammendrag, ikke 56 løse tall. Toppunktet er det
  // eneste enkeltpunktet som er verdt å lese opp — resten er form.
  const toppIdx = data.reduce((best, d, i) => (d.verdi > data[best].verdi ? i : best), 0)
  const sammendrag =
    `Søylediagram, ${data.length} punkter fra ${forste} til ${siste}. ` +
    `Høyest ${data[toppIdx].verdi} ${enhet} ${formaterDato(data[toppIdx].nokkel, 'd. MMMM')}.`

  const aktivPunkt = aktiv !== null ? data[aktiv] : null

  return (
    <div>
      {/* Tooltip-rad over grafen. Høyden er reservert permanent så grafen ikke
          hopper når man trykker — layout-skift under fingeren er verre enn en
          tom linje. */}
      <div
        aria-live="polite"
        style={{
          height: 16,
          marginBottom: 4,
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: aktivPunkt ? 'var(--accent)' : 'transparent',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {aktivPunkt
          ? `${formaterDato(aktivPunkt.nokkel, 'd. MMM')} — ${aktivPunkt.verdi} ${enhet}`
          : ' '}
      </div>

      <div
        role="img"
        aria-label={sammendrag}
        onPointerLeave={() => setAktiv(null)}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-end',
          gap: 3,
          height: 100,
          // Litt ekstra topp-luft når tallene står over søylene, så den høyeste
          // ikke presses mot kanten.
          padding: visTall ? '16px 8px 10px' : '10px 8px',
          borderRadius: 8,
          background: 'var(--bg-elevated)',
          border: '0.5px solid var(--border-subtle)',
        }}
      >
        {/* Maks-linje gir skala til TETTE serier, som ikke har plass til tall
            per søyle. Når tallene står der, er linja både redundant og i veien
            for labelen på den høyeste søyla — derfor kun i den ene grenen. */}
        {!visTall && (
          <>
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: 8,
                right: 8,
                top: 10,
                borderTop: '0.5px dashed var(--border-strong)',
                pointerEvents: 'none',
              }}
            />
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: 8,
                top: -4,
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: 'var(--text-tertiary)',
                background: 'var(--bg-elevated)',
                padding: '0 3px',
              }}
            >
              {maks}
            </span>
          </>
        )}

        {data.map((d, i) => (
          <div
            key={d.nokkel}
            // Hele kolonnen er trykkflate, ikke bare den fargede delen — en
            // søyle med verdi 0 har null høyde og ville ellers vært umulig å
            // treffe.
            onPointerEnter={() => setAktiv(i)}
            onPointerDown={() => setAktiv(i)}
            style={{
              flex: 1,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              alignItems: 'center',
              cursor: 'default',
            }}
          >
            {visTall && (
              <span
                aria-hidden="true"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  lineHeight: 1,
                  marginBottom: 3,
                  color: aktiv === i ? 'var(--accent)' : 'var(--text-tertiary)',
                }}
              >
                {d.verdi}
              </span>
            )}
            <div
              style={{
                width: '100%',
                height: `${Math.max((d.verdi / maks) * 100, d.verdi > 0 ? 4 : 0)}%`,
                minHeight: d.verdi > 0 ? 2 : 0,
                background: 'var(--accent)',
                // Dempes når en annen søyle er aktiv, så den valgte trer fram
                // uten at vi innfører en ny farge.
                opacity: aktiv === null || aktiv === i ? 1 : 0.45,
                borderRadius: '2px 2px 0 0',
                transition: 'opacity 120ms ease',
              }}
            />
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 5,
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--text-tertiary)',
        }}
      >
        <span>{forste}</span>
        {/* Skjul siste hvis serien har bare ett punkt (samme dato begge ender). */}
        {data.length > 1 && <span>{siste}</span>}
      </div>
    </div>
  )
}
