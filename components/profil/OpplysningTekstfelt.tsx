'use client'

import { useEffect, useRef } from 'react'
import { opplysningVerdiStil, OPPLYSNING_INPUT_RESET } from './OpplysningRad'

/**
 * Redigerbar FRITEKST-verdi i en `OpplysningRad` — matallergier og stikkord
 * (#685-review, BLOCKER). Et `<input type="text">` er énlinjet og scroller
 * horisontalt: `overflowWrap: 'break-word'` fra `opplysningVerdiStil()` har
 * ingen effekt på en input, så av 200 tillatte tegn så medlemmet ~38 og
 * resten forsvant uten spor. Det er samme kapping som #683-BLOCKER-en, bare
 * flyttet fra visnings- til redigeringstilstand.
 *
 * Derfor en `<textarea rows={1}>` med auto-høyde i stedet: feltet vokser
 * nedover etter innholdet og wrapper akkurat som verdien gjør på `/profil`.
 * Poenget med at dette er en EGEN komponent (og ikke bare et bytte av tag i
 * `RedigerProfilForm`) er at et framtidig kallsted ikke skal KUNNE velge
 * `<input type="text">` for en fritekstverdi — én trakt, samme grep som
 * `bildeSrc()`.
 *
 * Enter fanges med `preventDefault()`: feltet er én logisk linje (verdien
 * lagres som én streng, og `normaliserFritekst()` kollapser uansett
 * linjeskift til mellomrom), det er bare LAYOUTEN som er flerlinjet.
 *
 * Bor i egen fil, ikke i `OpplysningRad.tsx`: auto-høyden krever hooks og
 * dermed `'use client'`, og `/profil` (server component) kaller
 * `opplysningVerdiStil()` direkte — den kallet kaster hvis modulen blir en
 * klientmodul.
 */
export default function OpplysningTekstfelt({
  verdi,
  onEndre,
  maksLengde,
  placeholder,
  ariaLabel,
}: {
  verdi: string
  onEndre: (ny: string) => void
  maksLengde: number
  placeholder?: string
  ariaLabel?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  // Kjører også ved mount (ikke bare ved endring): en lagret verdi som
  // allerede wrapper over to linjer skal være helt synlig med én gang siden
  // åpnes, ikke først når medlemmet rører feltet.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // 'auto' først — uten nullstilling vokser scrollHeight monotont og
    // feltet krymper aldri igjen når tekst slettes.
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [verdi])

  return (
    <textarea
      ref={ref}
      rows={1}
      value={verdi}
      onChange={e => onEndre(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') e.preventDefault()
      }}
      maxLength={maksLengde}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className="opplysning-verdi"
      style={{
        ...OPPLYSNING_INPUT_RESET,
        ...opplysningVerdiStil(),
        // Ingen dra-håndtak og ingen egen scroll: høyden styres av effekten
        // over, så alt innholdet er synlig uten at feltet kan scrolles bort.
        resize: 'none',
        overflow: 'hidden',
        display: 'block',
      }}
    />
  )
}
