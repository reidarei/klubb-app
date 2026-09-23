/**
 * Pinner kronebeløp-formatteringen (#562).
 *
 * Alle beløp i fondet står i samme regnskap og ofte i samme kolonne. Droppet
 * vi desimalene på hele kroner — som vi gjorde før — havnet «0 kr» rett over
 * «20 751,32 kr», og tallene så ut til å ha ulik presisjon selv om de er like
 * eksakte. Med `font-variant-numeric: tabular-nums` linjer de seg heller ikke
 * opp uten desimalene.
 */

import { describe, it, expect } from 'vitest'
import { formaterKr, formaterBelop, signKr, prosent, summerKroner } from '@/lib/belop'

// nb-locale bruker hardt mellomrom (U+00A0) som tusenskille og komma som
// desimalskille. Vi normaliserer mellomrommet så testene leser greit.
const n = (s: string) => s.replace(/ /g, ' ')

describe('formaterKr', () => {
  it('viser alltid to desimaler, også på hele kroner', () => {
    expect(n(formaterKr(0))).toBe('0,00 kr')
    expect(n(formaterKr(500))).toBe('500,00 kr')
    expect(n(formaterKr(20751.32))).toBe('20 751,32 kr')
  })

  it('runder av til to desimaler', () => {
    expect(n(formaterKr(6612.2))).toBe('6 612,20 kr')
    expect(n(formaterKr(0.005))).toBe('0,01 kr')
  })

  it('beholder fortegnet på negative beløp, med ekte minus-tegn', () => {
    // nb-locale gir U+2212 (−), ikke bindestrek. Det er grunnen til at signKr
    // sender inn Math.abs() og setter fortegnet selv — ellers ville de to
    // kildene til minus kollidert.
    expect(n(formaterKr(-1200))).toBe('−1 200,00 kr')
  })
})

describe('signKr', () => {
  // Fortegnet er hele poenget: «+2 400» og «−2 400» er to ulike beskjeder.
  it('setter eksplisitt pluss på positive', () => {
    expect(n(signKr(2400))).toBe('+2 400,00 kr')
  })

  it('bruker minus-tegn (U+2212), ikke bindestrek', () => {
    expect(signKr(-2400)).toContain('−')
    expect(signKr(-2400)).not.toContain('-')
  })

  it('gir null verken pluss eller minus', () => {
    expect(n(signKr(0))).toBe('0,00 kr')
  })
})

describe('prosent', () => {
  // Én desimal er et bevisst valg — fondet er lite nok til at to gir falsk
  // presisjon. Endres den, skal denne testen tvinge en ny vurdering.
  it('viser én desimal med fortegn på positive', () => {
    expect(n(prosent(22.83))).toBe('+22,8 %')
    expect(n(prosent(0))).toBe('0,0 %')
  })
})

describe('summerKroner', () => {
  // Akkumulerer i hele øre for å unngå flyttall-drift. 0.1 + 0.2 er det
  // klassiske tilfellet som ellers gir 0.30000000000000004.
  it('summerer uten flyttall-drift', () => {
    expect(summerKroner([0.1, 0.2])).toBe(0.3)
    expect(summerKroner([12950.55, 47.21, 0.3])).toBe(12998.06)
  })

  it('gir 0 for tom liste', () => {
    expect(summerKroner([])).toBe(0)
  })
})

describe('formaterBelop', () => {
  // Samme desimal-regel som formaterKr, bare uten enheten. Testen finnes for
  // at de to ikke skal drifte fra hverandre.
  it('gir samme tall som formaterKr, uten «kr»', () => {
    for (const v of [0, 500, 20751.32, -1200]) {
      expect(formaterKr(v)).toBe(`${formaterBelop(v)} kr`)
    }
  })
})
