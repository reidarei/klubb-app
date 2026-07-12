import { describe, it, expect } from 'vitest'
import { byggMaanedsGrid, harInnhold, harBursdag } from '@/lib/mini-kalender'
import { norskDatoNokkel } from '@/lib/dato'

describe('byggMaanedsGrid', () => {
  it('juli 2026: 2 ledende null + 31 dager', () => {
    // 1. juli 2026 = onsdag (ISO day 3) → 2 ledende null-celler
    const grid = byggMaanedsGrid(2026, 6) // maaned0 = 6 = juli
    const nullCeller = grid.filter(c => c === null)
    const dagCeller = grid.filter(c => c !== null) as string[]

    expect(nullCeller).toHaveLength(2)
    expect(dagCeller).toHaveLength(31)
    expect(dagCeller[0]).toBe('2026-07-01')
    expect(dagCeller[dagCeller.length - 1]).toBe('2026-07-31')
  })

  it('februar 2028 (skuddår): 1 ledende null + 29 dager', () => {
    // 1. feb 2028 = tirsdag (ISO day 2) → 1 ledende null-celle
    // 2028 er skuddår (delelig med 4, ikke med 100)
    const grid = byggMaanedsGrid(2028, 1) // maaned0 = 1 = februar
    const nullCeller = grid.filter(c => c === null)
    const dagCeller = grid.filter(c => c !== null) as string[]

    expect(nullCeller).toHaveLength(1)
    expect(dagCeller).toHaveLength(29)
    expect(dagCeller[0]).toBe('2028-02-01')
    expect(dagCeller[dagCeller.length - 1]).toBe('2028-02-29')
  })

  it('juni 2026: 0 ledende null (1. juni = mandag)', () => {
    // 1. juni 2026 = mandag (ISO day 1) → 0 ledende null-celler
    const grid = byggMaanedsGrid(2026, 5) // maaned0 = 5 = juni
    const nullCeller = grid.filter(c => c === null)
    const dagCeller = grid.filter(c => c !== null) as string[]

    expect(nullCeller).toHaveLength(0)
    expect(dagCeller).toHaveLength(30)
    expect(dagCeller[0]).toBe('2026-06-01')
  })

  it('mars 2026: 6 ledende null (1. mars = søndag)', () => {
    // 1. mars 2026 = søndag (ISO day 7) → 6 ledende null-celler
    const grid = byggMaanedsGrid(2026, 2) // maaned0 = 2 = mars
    const nullCeller = grid.filter(c => c === null)
    const dagCeller = grid.filter(c => c !== null) as string[]

    expect(nullCeller).toHaveLength(6)
    expect(dagCeller).toHaveLength(31)
    expect(dagCeller[0]).toBe('2026-03-01')
    expect(dagCeller[dagCeller.length - 1]).toBe('2026-03-31')
  })
})

describe('harInnhold', () => {
  it('returnerer true når dato finnes i settet', () => {
    const sett = new Set(['2026-07-15', '2026-07-22'])
    expect(harInnhold('2026-07-15', sett)).toBe(true)
  })

  it('returnerer false når dato ikke finnes i settet', () => {
    const sett = new Set(['2026-07-15'])
    expect(harInnhold('2026-07-16', sett)).toBe(false)
  })

  it('returnerer false for tomt sett', () => {
    expect(harInnhold('2026-07-01', new Set())).toBe(false)
  })
})

describe('norskDatoNokkel — tidssone-kanttest', () => {
  it('UTC-tidspunkt som er 00:30 norsk sommertid gir neste dag', () => {
    // 2026-07-10T22:30:00Z = 11. juli 00:30 CEST (UTC+2)
    // Skal telle på 11. juli, ikke 10. juli
    expect(norskDatoNokkel('2026-07-10T22:30:00Z')).toBe('2026-07-11')
  })

  it('UTC-tidspunkt midt på dagen gir riktig norsk dag', () => {
    // 2026-07-15T12:00:00Z = 15. juli 14:00 CEST
    expect(norskDatoNokkel('2026-07-15T12:00:00Z')).toBe('2026-07-15')
  })

  it('vintertid: UTC 23:30 gir norsk dag +1', () => {
    // 2026-01-10T23:30:00Z = 11. januar 00:30 CET (UTC+1)
    expect(norskDatoNokkel('2026-01-10T23:30:00Z')).toBe('2026-01-11')
  })
})

describe('harBursdag (#429-oppfølging)', () => {
  it('matcher på måned-dag uavhengig av år', () => {
    const sett = new Set(['07-15', '12-24'])
    expect(harBursdag('2026-07-15', sett)).toBe(true)
    expect(harBursdag('2031-07-15', sett)).toBe(true) // annet år — fortsatt treff
    expect(harBursdag('2026-12-24', sett)).toBe(true)
    expect(harBursdag('2026-07-16', sett)).toBe(false)
  })

  it('tomt sett gir aldri treff', () => {
    expect(harBursdag('2026-07-15', new Set())).toBe(false)
  })
})
