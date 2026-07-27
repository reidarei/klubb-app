import { describe, it, expect } from 'vitest'
import { fyllHullAar } from '@/lib/reiserute'

describe('fyllHullAar', () => {
  it('fyller hull for årene klubben ikke reiste (2020 og 2021)', () => {
    const rader = [
      ...Array.from({ length: 10 }, (_, i) => ({ aar: 2010 + i })), // 2010–2019
      ...Array.from({ length: 5 }, (_, i) => ({ aar: 2022 + i })), // 2022–2026
    ]
    const resultat = fyllHullAar(rader)

    const hullAar = resultat.filter(r => 'hull' in r && r.hull).map(r => r.aar)
    expect(hullAar).toEqual([2020, 2021])
    // Ingen ekte turer skal ha blitt borte eller duplisert
    expect(resultat.length).toBe(rader.length + 2)
  })

  it('sammenhengende år gir ingen hull', () => {
    const rader = [{ aar: 2020 }, { aar: 2021 }, { aar: 2022 }]
    const resultat = fyllHullAar(rader)
    expect(resultat).toEqual(rader)
  })

  it('tom liste gir tom liste', () => {
    expect(fyllHullAar([])).toEqual([])
  })

  it('ett enkelt år gir ingen hull', () => {
    const rader = [{ aar: 2023 }]
    expect(fyllHullAar(rader)).toEqual(rader)
  })

  it('flere turer samme år bryter ikke sorteringen, og fyller ikke utover siste turår', () => {
    const rader = [
      { aar: 2018, id: 'a' },
      { aar: 2018, id: 'b' },
      { aar: 2016, id: 'c' },
    ]
    const resultat = fyllHullAar(rader)
    expect(resultat.map(r => r.aar)).toEqual([2016, 2017, 2018, 2018])
    // 2016 og 2018 er ekte, 2017 er hull
    const hull = resultat.filter(r => 'hull' in r && r.hull)
    expect(hull).toEqual([{ aar: 2017, hull: true }])
    // Siste år er 2018 — ingen hull-rad for f.eks. 2019 eller senere
    expect(Math.max(...resultat.map(r => r.aar))).toBe(2018)
  })
})
