import { describe, it, expect } from 'vitest'
import { erSkuddaar, finnBursdagsbarn, alderIAar } from '@/lib/bursdag'

describe('erSkuddaar', () => {
  it('delelig med 4, ikke 100 → skuddår', () => {
    expect(erSkuddaar(2024)).toBe(true)
  })

  it('delelig med 100, ikke 400 → ikke skuddår', () => {
    expect(erSkuddaar(1900)).toBe(false)
  })

  it('delelig med 400 → skuddår', () => {
    expect(erSkuddaar(2000)).toBe(true)
  })

  it('ikke delelig med 4 → ikke skuddår', () => {
    expect(erSkuddaar(2025)).toBe(false)
  })
})

describe('finnBursdagsbarn', () => {
  const profiler = [
    { id: 'a', fodselsdato: '1990-06-15' },
    { id: 'b', fodselsdato: '1985-06-15' },
    { id: 'c', fodselsdato: '1970-12-24' },
    { id: 'd', fodselsdato: null },
  ]

  it('matcher MM-DD uansett fødselsår', () => {
    const treff = finnBursdagsbarn(profiler, '2026-06-15')
    expect(treff.map(p => p.id).sort()).toEqual(['a', 'b'])
  })

  it('ingen treff en vanlig dag', () => {
    expect(finnBursdagsbarn(profiler, '2026-06-16')).toEqual([])
  })

  it('null fødselsdato gir aldri treff', () => {
    const treff = finnBursdagsbarn(profiler, '2026-06-15')
    expect(treff.find(p => p.id === 'd')).toBeUndefined()
  })

  it('29. februar-barn treffer 29. februar i et skuddår', () => {
    const med29feb = [{ id: 'e', fodselsdato: '1996-02-29' }]
    expect(finnBursdagsbarn(med29feb, '2024-02-29').map(p => p.id)).toEqual(['e'])
  })

  it('29. februar-barn treffer 1. mars i et ikke-skuddår', () => {
    const med29feb = [{ id: 'e', fodselsdato: '1996-02-29' }]
    expect(finnBursdagsbarn(med29feb, '2026-03-01').map(p => p.id)).toEqual(['e'])
  })

  it('29. februar-barn treffer IKKE 28. februar i et ikke-skuddår', () => {
    const med29feb = [{ id: 'e', fodselsdato: '1996-02-29' }]
    expect(finnBursdagsbarn(med29feb, '2026-02-28')).toEqual([])
  })
})

describe('alderIAar', () => {
  it('regner alder som differansen mellom fødselsår og dagens år', () => {
    expect(alderIAar('1990-06-15', '2026-06-15')).toBe(36)
  })

  it('fungerer for et skuddårsbarn (29. februar) som fyller år på erstatningsdatoen', () => {
    expect(alderIAar('1996-02-29', '2026-03-01')).toBe(30)
  })
})
