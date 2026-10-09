// /tidligere sin keyset-spørring filtrerer bort pågående turer med et
// PostgREST-filter, forsiden med erPaagaaende() i JS. De to må si det samme,
// ellers vises en tur på begge sider eller ingen (#766, #851).

import { describe, it, expect } from 'vitest'
import { erPaagaaende, ikkePaagaaendeFilter, type ArrangementRaad } from '@/lib/agenda-sortering'

const NAA = '2026-10-09T12:00:00.000Z'

// Minimal evaluator for de formene filteret bruker: kommaseparert OR av
// «kolonne.is.null» og «kolonne.<lt|lte|gt|gte|eq>.verdi». Ukjent form kaster,
// så et omskrevet filter ikke kan passere ved å bli feiltolket.
function evaluerOr(filter: string, rad: Record<string, string | null>): boolean {
  return filter.split(',').some(ledd => {
    const [kolonne, op, ...rest] = ledd.split('.')
    const verdi = rest.join('.')
    const v = rad[kolonne]
    if (op === 'is' && verdi === 'null') return v === null
    if (v === null || v === undefined) return false
    switch (op) {
      case 'lt': return v < verdi
      case 'lte': return v <= verdi
      case 'gt': return v > verdi
      case 'gte': return v >= verdi
      case 'eq': return v === verdi
      default: throw new Error(`ukjent filterledd: ${ledd}`)
    }
  })
}

describe('ikkePaagaaendeFilter ↔ erPaagaaende', () => {
  it.each([
    ['ingen sluttid (møte)', null],
    ['sluttid passert', '2026-10-09T11:59:59.999Z'],
    ['sluttid akkurat nå', NAA],
    ['sluttid fram i tid', '2026-10-09T12:00:00.001Z'],
  ])('%s', (_navn, slutt) => {
    const rad = { slutt_tidspunkt: slutt } as ArrangementRaad
    expect(evaluerOr(ikkePaagaaendeFilter(NAA), { slutt_tidspunkt: slutt })).toBe(!erPaagaaende(rad, NAA))
  })
})
