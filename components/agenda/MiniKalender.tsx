'use client'

// Mikro-månedskalender i agenda-headeren (#429).
// Ligger i luken mellom dato-blokka og NyFAB, med samme høyde som datoen —
// derfor prikke-format: fylt prikk = dag med arrangement, outline = tom dag,
// accent-ring = i dag. Ingen dagtall (plassen tillater det ikke, og issuet
// beskrev nettopp fylte/tomme sirkler). Kun visning — ingen klikk på dager.

import { useMemo, useState, type CSSProperties } from 'react'
import { byggMaanedsGrid, harInnhold } from '@/lib/mini-kalender'
import { AGENDA_VINDU_MND } from '@/lib/konstanter'
import Icon from '@/components/ui/Icon'

// Kort månedsnavn til mikro-labelen. Småbokstaver med vilje: CSS textTransform
// versaliserer visuelt, mens skjermlesere får normal tekst (all-caps kan leses
// bokstav for bokstav av noen SR-er).
const MAANED_KORT = [
  'jan', 'feb', 'mar', 'apr', 'mai', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'des',
]

// Fulle månedsnavn til skjermleser-annonsering av månedsskifte.
const MAANED_FULL = [
  'januar', 'februar', 'mars', 'april', 'mai', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'desember',
]

type Props = {
  /** yyyy-MM-dd-nøkler for dager med minst ett arrangement */
  arrangementDatoer: string[]
  /** Dagens dato i norsk tidssone som yyyy-MM-dd (fra iDagOslo() — deterministisk render) */
  iDag: string
}

// Hvor langt bakover det er meningsfullt å bla: datasettet dekker kun
// AGENDA_VINDU_MND måneder tilbake (jf. cutoff i page.tsx), så eldre måneder
// ville vist seg falskt tomme («klubben var inaktiv»). Fremover er fritt —
// tomt = ærlig ingenting planlagt.
const MIN_OFFSET = -AGENDA_VINDU_MND

// Prikke-geometri — velgerne og månedslabelen ligger i en smal side-kolonne
// (ikke over grid-et), så prikkene kan bruke hele header-høyden: 6 ukerader à
// 8 px + 2 px gap ≈ 58 px, som matcher dato-blokkas ~60 px.
const PRIKK = 8
const GAP = 2

export default function MiniKalender({ arrangementDatoer, iDag }: Props) {
  const [maanedOffset, setMaanedOffset] = useState(0)

  // iDag er en date-only-streng (yyyy-MM-dd); `new Date(iDag)` ville tolket den
  // som UTC-midnatt (ES-spec), og påfølgende getMonth() i maskinens lokale TZ
  // kan da bomme på måneden den 1. i negative UTC-offset + gi SSR/klient-avvik.
  // Vi parser strengen manuelt og bygger måneden med den lokale konstruktøren.
  const [aar, maaned1] = iDag.split('-').map(Number)
  const visDato = new Date(aar, maaned1 - 1 + maanedOffset, 1)
  const visAar = visDato.getFullYear()
  const visMaaned0 = visDato.getMonth() // 0-basert

  const grid = useMemo(
    () => byggMaanedsGrid(visAar, visMaaned0),
    [visAar, visMaaned0],
  )

  // Set for O(1)-oppslag — bygges kun når arrangementDatoer endrer seg.
  const datoSett = useMemo(() => new Set(arrangementDatoer), [arrangementDatoer])

  const kanBakover = maanedOffset > MIN_OFFSET

  const chevronKnapp: CSSProperties = {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-tertiary)',
    // Rommelig trykkflate rundt et lite ikon — viktigere på mobil enn desktop.
    padding: '2px 4px',
    display: 'flex',
    alignItems: 'center',
    lineHeight: 0,
  }

  // Grid-høyden styrer side-kolonnens høyde så chevrons/label fordeles jevnt.
  const gridHoyde = 6 * PRIKK + 5 * GAP

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        // Fast størrelse: prikke-grid-et kan ikke krympe uten å deformeres,
        // så vi holder det stivt. Trangt først under ~360px viewport —
        // smalere enn noen av klubbens enheter.
        flexShrink: 0,
      }}
    >
      {/* Prikke-grid: 7 kolonner (man–søn), én prikk per dag */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(7, ${PRIKK}px)`,
          gap: GAP,
        }}
      >
        {grid.map((nokkel, idx) => {
          if (nokkel === null) {
            // Tom celle for mandag-først-justering
            return <div key={`tom-${idx}`} style={{ width: PRIKK, height: PRIKK }} />
          }

          const harArr = harInnhold(nokkel, datoSett)
          const erIdag = nokkel === iDag
          const dagtall = parseInt(nokkel.slice(-2), 10)

          // Skjermleser-label kun for dager som «betyr noe» — resten skjules
          // fra a11y-treet så ikke 30 løse prikker annonseres som støy.
          let celleLabel: string | undefined
          if (harArr && erIdag) celleLabel = `${dagtall}. ${MAANED_FULL[visMaaned0]} – arrangement, i dag`
          else if (harArr) celleLabel = `${dagtall}. ${MAANED_FULL[visMaaned0]} – arrangement`
          else if (erIdag) celleLabel = `${dagtall}. ${MAANED_FULL[visMaaned0]} – i dag`

          return (
            <div
              key={nokkel}
              aria-label={celleLabel}
              role={celleLabel ? 'img' : undefined}
              aria-hidden={celleLabel ? undefined : true}
              style={{
                width: PRIKK,
                height: PRIKK,
                borderRadius: '50%',
                // border-box: borderen skal ligge INNENFOR prikk-sporet, ellers
                // blir outline-prikker større enn grid-cellene og overlapper.
                boxSizing: 'border-box',
                // Fylt prikk = arrangement; outline = tom dag (Tema-policy: tokens)
                ...(harArr
                  ? { background: 'var(--text-primary)' }
                  : { border: '0.5px solid var(--border-strong)' }),
                // Diskret accent-ring for i dag
                ...(erIdag ? { boxShadow: '0 0 0 1px var(--accent)' } : {}),
              }}
            />
          )
        })}
      </div>

      {/* Side-kolonne: forrige-pil øverst, vertikal månedslabel i midten,
          neste-pil nederst — frigjør hele høyden til prikke-grid-et. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: gridHoyde,
        }}
      >
        <button
          type="button"
          style={{
            ...chevronKnapp,
            ...(kanBakover ? {} : { opacity: 0.3, cursor: 'default' }),
          }}
          onClick={() => setMaanedOffset(o => Math.max(MIN_OFFSET, o - 1))}
          disabled={!kanBakover}
          aria-label="Forrige måned"
        >
          {/* chevron peker høyre; roteres for å peke opp/bakover. aria-hidden: dekor. */}
          <Icon name="chevron" size={9} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true" focusable="false" />
        </button>

        {/* aria-live annonserer TEKST-endringer, ikke aria-label — derfor
            ligger fullt månedsnavn+år som visuelt skjult tekst i live-regionen,
            mens den vertikale kort-labelen er skjult for skjermlesere. */}
        <span aria-live="polite">
          <span
            aria-hidden="true"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 7,
              fontWeight: 600,
              color: 'var(--text-tertiary)',
              letterSpacing: '1px',
              textTransform: 'uppercase',
              // Vertikal tekst leses ovenfra og ned langs side-kolonnen
              writingMode: 'vertical-rl',
            }}
          >
            {MAANED_KORT[visMaaned0]}
          </span>
          <span
            style={{
              // sr-only: synlig for skjermlesere, usynlig visuelt
              position: 'absolute',
              width: 1,
              height: 1,
              overflow: 'hidden',
              clipPath: 'inset(50%)',
              whiteSpace: 'nowrap',
            }}
          >
            {`${MAANED_FULL[visMaaned0]} ${visAar}`}
          </span>
        </span>

        <button
          type="button"
          style={chevronKnapp}
          onClick={() => setMaanedOffset(o => o + 1)}
          aria-label="Neste måned"
        >
          <Icon name="chevron" size={9} style={{ transform: 'rotate(90deg)' }} aria-hidden="true" focusable="false" />
        </button>
      </div>
    </div>
  )
}
