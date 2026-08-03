/**
 * Pinner `fylt`-modusen på Icon (#550).
 *
 * MiniKalender tegner glyfene sine på 11 px, der et omriss faller sammen til
 * grøt. Løsningen er å rendre den samme lukkede pathen fylt i stedet — men det
 * hviler på tre ting som alle er lette å brekke ved en opprydding:
 *
 *  1. `stroke` må slås AV i fylt modus. Blir den stående, tegnes glyfen både
 *     fylt og med kontur, og de 11 pikslene klumper seg igjen.
 *  2. `fill-rule` må være `evenodd`. Seidelens håndtak er en utstansing — en
 *     subpath som ligger inni kroppen — og med nonzero fylles hullet igjen så
 *     håndtaket forsvinner. Attributtet settes på <svg> og ARVES ned til
 *     <path>; flyttes det, eller endrer React-navnet seg, ryker det stille.
 *  3. Omriss-modus må være uendret for alle de andre ikonene i appen.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import Icon from '@/components/ui/Icon'

afterEach(cleanup)

function svgFor(ui: React.ReactElement): SVGSVGElement {
  const { container } = render(ui)
  const svg = container.querySelector('svg')
  if (!svg) throw new Error('Icon rendret ingen <svg>')
  return svg as SVGSVGElement
}

describe('Icon fylt-modus', () => {
  it('fyller med fargen og slår av streken', () => {
    const svg = svgFor(<Icon name="beer" fylt color="var(--accent)" />)

    expect(svg.getAttribute('fill')).toBe('var(--accent)')
    expect(svg.getAttribute('stroke')).toBe('none')
  })

  it('setter fill-rule evenodd, slik at seidelens håndtak blir et hull', () => {
    const svg = svgFor(<Icon name="beer" fylt />)

    expect(svg.getAttribute('fill-rule')).toBe('evenodd')
  })

  it('lar omriss-modus være uendret', () => {
    const svg = svgFor(<Icon name="mapPin" color="var(--text-tertiary)" />)

    expect(svg.getAttribute('fill')).toBe('none')
    expect(svg.getAttribute('stroke')).toBe('var(--text-tertiary)')
    // Ingen fill-rule i omriss-modus — den ville vært en no-op her, men et
    // satt attributt inviterer til at noen fyller ikonet og tror det virker.
    expect(svg.getAttribute('fill-rule')).toBeNull()
  })
})

describe('flute har to tegninger', () => {
  // Stetten og foten er streker i omriss-modus (et omrisset rektangel leser som
  // en ramme rundt et hulrom når glyfen blir stor) og lukkede former i fylt
  // modus (en strek har ingen innside å fylle). Boblene finnes kun i omrisset —
  // på 11 px blir de en halv piksel og dytter glasset ut av senter i cellen.
  it('bytter path når fylt er satt', () => {
    const omriss = svgFor(<Icon name="flute" />).querySelector('path')?.getAttribute('d')
    const fylt = svgFor(<Icon name="flute" fylt />).querySelector('path')?.getAttribute('d')

    expect(omriss).toBeTruthy()
    expect(fylt).toBeTruthy()
    expect(fylt).not.toBe(omriss)
  })

  it('viser de samme to boblene i begge moduser', () => {
    // Regresjonsvakt: boblene lå en periode kun i omrisset, fordi de var for
    // små til å overleve 11 px. Da ble det to ulike motiver for samme ting.
    // Riktig fiks var å gjøre boblene større, ikke å fjerne dem i én størrelse.
    // Teller sirkulære subpaths på formen «a<r> <r> 0 110 <2r>» — starten på
    // en hel sirkel. Bevisst uavhengig av radius: boblene er justert i
    // størrelse flere ganger, og en test som hardkoder radien går i stykker
    // av en ren designjustering i stedet for av bugen den skal fange.
    // Koppens bue bruker «0 01», ikke «0 110», så den telles ikke med.
    const bobler = (d: string) => (d.match(/a[\d.]+ [\d.]+ 0 110 /g) ?? []).length

    for (const props of [{}, { fylt: true }]) {
      const d = svgFor(<Icon name="flute" {...props} />).querySelector('path')?.getAttribute('d') ?? ''
      expect(bobler(d)).toBe(2)
    }
  })

  it('lar glyfer uten overstyring bruke samme path i begge moduser', () => {
    const omriss = svgFor(<Icon name="medal" />).querySelector('path')?.getAttribute('d')
    const fylt = svgFor(<Icon name="medal" fylt />).querySelector('path')?.getAttribute('d')

    expect(fylt).toBe(omriss)
  })
})

describe('agenda-familien', () => {
  // De fire glyfene MiniKalender og kortene deler. Alle må være lukkede
  // silhuetter — en path som ender uten `z` gir et åpent område som fylles
  // uforutsigbart. Se #550.
  const AGENDA_GLYFER = ['plane', 'beer', 'flute', 'medal'] as const

  it.each(AGENDA_GLYFER)('%s er en lukket silhuett', (navn) => {
    const svg = svgFor(<Icon name={navn} fylt />)
    const d = svg.querySelector('path')?.getAttribute('d') ?? ''

    expect(d).not.toBe('')
    // Hver subpath (alt som starter med M) skal avsluttes med z før neste.
    for (const subpath of d.split(/(?=M)/).filter(Boolean)) {
      expect(subpath.trim().toLowerCase().endsWith('z')).toBe(true)
    }
  })
})
