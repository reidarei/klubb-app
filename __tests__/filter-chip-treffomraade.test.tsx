/**
 * Pinner at FilterChip-radene ikke får overlappende treffområder når de brytes.
 *
 * Bakgrunn: chippen skiller synlig pille fra tap-flate ved å gi Link-en usynlig
 * vertikal padding pluss like stor negativ margin. Treffområdet vokser dermed
 * *ut av* layoutboksen. Naboer i samme rad merker ingenting (horisontal padding
 * er 0), men når raden brytes strekker chippen på rad to seg opp i rad én. Med
 * det opprinnelige radgapet på 6 px ble overlappet 9 + 9 − 6 = 12 px, hvorav
 * 3 px lå oppå den synlige pillen over — og siden chippen på rad to kommer
 * senere i DOM vant den hit-testen. Brukeren traff feil filter.
 *
 * Testen utleder paddingen fra den faktisk rendrede chippen (ikke fra en
 * duplisert konstant) og krever at radene bruker minst 2 × den som row-gap.
 * Da møtes treffområdene eksakt uten å overlappe. Justeres USYNLIG_PADDING
 * senere uten at radene følger med, ryker denne.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import FilterChip, { CHIP_RAD_GAP } from '@/components/ui/FilterChip'
import TidligereTypeFilter from '@/components/tidligere/TidligereTypeFilter'

afterEach(cleanup)

// Leser den usynlige vertikale paddingen ut av en rendret chip, så testen ikke
// gjentar tallet fra komponenten.
function chipVertikalPadding(): number {
  const { container } = render(
    <FilterChip href="/tidligere" aktiv={false}>
      Alle
    </FilterChip>,
  )
  const lenke = container.querySelector('a')
  expect(lenke).not.toBeNull()
  const top = parseFloat(lenke!.style.paddingTop)
  const bottom = parseFloat(lenke!.style.paddingBottom)
  expect(top).toBeGreaterThan(0)
  expect(top).toBe(bottom)
  return top
}

// jsdom lagrer `gap`-shorthanden som rå streng og fyller ikke rowGap/columnGap
// slik ekte nettlesere gjør — vi må splitte selv. Ett tall = samme gap begge
// veier, to tall = «rad kolonne».
function radOgKolonneGap(el: HTMLElement): { rad: number; kolonne: number } {
  const deler = el.style.gap.trim().split(/\s+/).map(parseFloat)
  return { rad: deler[0], kolonne: deler.length > 1 ? deler[1] : deler[0] }
}

describe('FilterChip — treffområder på tvers av rader', () => {
  it('CHIP_RAD_GAP dekker treffområdet som stikker ut over og under pillen', () => {
    const padding = chipVertikalPadding()
    // Chippen over stikker `padding` ned, chippen under stikker `padding` opp.
    expect(CHIP_RAD_GAP).toBeGreaterThanOrEqual(padding * 2)
  })

  it('chippen nøytraliserer paddingen med negativ margin (layout uendret)', () => {
    const padding = chipVertikalPadding()
    const lenke = document.querySelector('a')!
    // Uten dette ville radhøyden vokst og gapet til naboer endret seg — hele
    // poenget med teknikken er at bare tap-flaten blir større, ikke layouten.
    expect(parseFloat(lenke.style.marginTop)).toBe(-padding)
    expect(parseFloat(lenke.style.marginBottom)).toBe(-padding)
  })

  it('/tidligere-raden bruker CHIP_RAD_GAP som radgap', () => {
    const { container } = render(<TidligereTypeFilter aktiv="alle" />)
    const nav = container.querySelector('nav')
    expect(nav).not.toBeNull()
    const { rad, kolonne } = radOgKolonneGap(nav!)
    expect(rad).toBeGreaterThanOrEqual(CHIP_RAD_GAP)
    // Kolonnegapet skal IKKE ha vokst — horisontal padding er 0, så chipsene
    // ved siden av hverandre trengte aldri ekstra luft.
    expect(kolonne).toBeLessThan(CHIP_RAD_GAP)
    // Raden må faktisk kunne brytes — ellers er hele radgap-resonnementet moot.
    expect(nav!.style.flexWrap).toBe('wrap')
  })

  it('raden er et nav-landmerke med beskrivende etikett', () => {
    const { container } = render(<TidligereTypeFilter aktiv="alle" />)
    const nav = container.querySelector('nav')
    expect(nav?.getAttribute('aria-label')).toBeTruthy()
  })
})
