'use client'

// Kompakt månedskalender på agenda-forsiden (#429).
// Viser fylte sirkler på dager med arrangement, outline-sirkler ellers.
// Kun visning i v1 — ingen klikk på enkeltdager.

import { useMemo, useState, type CSSProperties } from 'react'
import { byggMaanedsGrid, harInnhold } from '@/lib/mini-kalender'
import { AGENDA_VINDU_MND } from '@/lib/konstanter'
import Icon from '@/components/ui/Icon'

// Ukedags-forkortelser for header-rad, mandag-først.
const UKEDAGER = ['Ma', 'Ti', 'On', 'To', 'Fr', 'Lø', 'Sø']

// Månedsnavn — bruker nb-locale manuelt for å holde komponenten enkel
// (unngår date-fns-locale-import i klient-bundle). Småbokstaver med vilje:
// CSS textTransform gjør versaliseringen visuelt, mens skjermlesere får
// normal tekst (all-caps kan leses bokstav for bokstav av noen SR-er).
const MAANEDSNAVN = [
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

export default function MiniKalender({ arrangementDatoer, iDag }: Props) {
  const [maanedOffset, setMaanedOffset] = useState(0)

  // Beregn hvilken måned som vises basert på offset fra iDag sin måned.
  // iDag er en date-only-streng (yyyy-MM-dd); `new Date(iDag)` ville tolket den
  // som UTC-midnatt (ES-spec), og påfølgende getMonth() i maskinens lokale TZ
  // kan da bomme på måneden den 1. i negative UTC-offset + gi SSR/klient-avvik.
  // Vi parser strengen manuelt og bygger måneden med den lokale konstruktøren,
  // som er TZ-nøytral for rene kalender-formål.
  const [aar, maaned1] = iDag.split('-').map(Number)
  const visDato = new Date(aar, maaned1 - 1 + maanedOffset, 1)
  const visAar = visDato.getFullYear()
  const visMaaned0 = visDato.getMonth() // 0-basert

  // Bygg grid én gang per synlig måned.
  const grid = useMemo(
    () => byggMaanedsGrid(visAar, visMaaned0),
    [visAar, visMaaned0],
  )

  // Set for O(1)-oppslag — bygges kun når arrangementDatoer endrer seg.
  const datoSett = useMemo(() => new Set(arrangementDatoer), [arrangementDatoer])

  const månedstittel = `${MAANEDSNAVN[visMaaned0]} ${visAar}`

  // Kan vi bla lenger bakover, eller er vi ved datavinduets bakre kant?
  const kanBakover = maanedOffset > MIN_OFFSET

  // Måned til skjermleser-labels («15. juli – arrangement»).
  const maanedNavnLavr = MAANEDSNAVN[visMaaned0]

  const monoMikro: CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--text-tertiary)',
    letterSpacing: '2px',
    textTransform: 'uppercase',
  }

  const chevronKnapp: CSSProperties = {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    padding: '4px 6px',
    display: 'flex',
    alignItems: 'center',
    lineHeight: 0,
  }

  return (
    <div
      style={{
        marginBottom: 20,
        paddingBottom: 16,
        borderBottom: '0.5px solid var(--border-subtle)',
      }}
    >
      {/* Topprad: forrige-pil, månedstittel, neste-pil */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <button
          type="button"
          style={{
            ...chevronKnapp,
            // Dempet + ikke-klikkbar når vi er ved datavinduets bakre kant.
            ...(kanBakover ? {} : { opacity: 0.3, cursor: 'default' }),
          }}
          onClick={() => setMaanedOffset(o => Math.max(MIN_OFFSET, o - 1))}
          disabled={!kanBakover}
          aria-label="Forrige måned"
        >
          {/* chevron-ikonet peker høyre; roteres 180° for å peke venstre.
              aria-hidden: knappen bærer selv labelen — ikonet er ren dekor. */}
          <Icon name="chevron" size={14} style={{ transform: 'rotate(180deg)' }} aria-hidden="true" focusable="false" />
        </button>

        <span style={monoMikro} aria-live="polite">{månedstittel}</span>

        <button
          type="button"
          style={chevronKnapp}
          onClick={() => setMaanedOffset(o => o + 1)}
          aria-label="Neste måned"
        >
          <Icon name="chevron" size={14} aria-hidden="true" focusable="false" />
        </button>
      </div>

      {/* Ukedags-header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 4,
          justifyItems: 'center',
          marginBottom: 4,
        }}
      >
        {UKEDAGER.map(dag => (
          <span key={dag} style={{ ...monoMikro, letterSpacing: '0.5px', fontSize: 9 }}>
            {dag}
          </span>
        ))}
      </div>

      {/* Dag-celler */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 4,
          justifyItems: 'center',
        }}
      >
        {grid.map((nokkel, idx) => {
          if (nokkel === null) {
            // Tom celle for å justere mandag-først
            return <div key={`tom-${idx}`} style={{ width: 26, height: 26 }} />
          }

          const harArr = harInnhold(nokkel, datoSett)
          const erIdag = nokkel === iDag
          const dagtall = parseInt(nokkel.slice(-2), 10)

          // Skjermleser-label kun for dager som «betyr noe» (arrangement/i dag).
          // Vanlige tomme dager forblir uannonsert for å unngå støy.
          let celleLabel: string | undefined
          if (harArr && erIdag) celleLabel = `${dagtall}. ${maanedNavnLavr} – arrangement, i dag`
          else if (harArr) celleLabel = `${dagtall}. ${maanedNavnLavr} – arrangement`
          else if (erIdag) celleLabel = `${dagtall}. ${maanedNavnLavr} – i dag`

          // Fylt sirkel (arrangement) vs. outline-sirkel (tom dag)
          const sirkelStil: CSSProperties = harArr
            ? {
                background: 'var(--text-primary)',
                color: 'var(--bg)',
                border: 'none',
              }
            : {
                background: 'transparent',
                color: 'var(--text-tertiary)',
                border: '0.5px solid var(--border)',
              }

          // Diskret accent-ring for i-dag, uansett om det er arrangement eller ei
          const idagStil: CSSProperties = erIdag
            ? { boxShadow: '0 0 0 1.5px var(--accent)' }
            : {}

          return (
            <div
              key={nokkel}
              aria-label={celleLabel}
              role={celleLabel ? 'img' : undefined}
              // Dager uten label skjules helt fra a11y-treet — ellers leser
              // skjermlesere opp alle dagtallene som løse tall (støy).
              aria-hidden={celleLabel ? undefined : true}
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                fontWeight: harArr ? 600 : 400,
                ...sirkelStil,
                ...idagStil,
              }}
            >
              {dagtall}
            </div>
          )
        })}
      </div>
    </div>
  )
}
