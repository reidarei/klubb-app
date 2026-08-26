import { describe, it, expect } from 'vitest'
import { sorterMedlemmer, STANDARD_SORTERING } from '@/lib/medlem-sortering'

type M = { navn: string; narv: number | null }

describe('STANDARD_SORTERING', () => {
  it('er narvaer — selve oppfyllelsen av #629', () => {
    expect(STANDARD_SORTERING).toBe('narvaer')
  })
})

describe('sorterMedlemmer — narvaer', () => {
  it('sorterer høyest prosent først', () => {
    const liste: M[] = [
      { navn: 'Andreas', narv: 40 },
      { navn: 'Bjørn', narv: 90 },
      { navn: 'Christian', narv: 60 },
    ]
    expect(sorterMedlemmer(liste, 'narvaer').map(m => m.navn)).toEqual([
      'Bjørn',
      'Christian',
      'Andreas',
    ])
  })

  it('faller tilbake på alfabetisk ved lik prosent', () => {
    const liste: M[] = [
      { navn: 'Christian', narv: 70 },
      { navn: 'Bjørn', narv: 70 },
    ]
    expect(sorterMedlemmer(liste, 'narvaer').map(m => m.navn)).toEqual([
      'Bjørn',
      'Christian',
    ])
  })

  it('null-nærvær havner sist', () => {
    const liste: M[] = [
      { navn: 'Andreas', narv: null },
      { navn: 'Bjørn', narv: 20 },
    ]
    expect(sorterMedlemmer(liste, 'narvaer').map(m => m.navn)).toEqual([
      'Bjørn',
      'Andreas',
    ])
  })

  it('alle null (januar) blir alfabetisk', () => {
    const liste: M[] = [
      { navn: 'Christian', narv: null },
      { navn: 'Andreas', narv: null },
      { navn: 'Bjørn', narv: null },
    ]
    expect(sorterMedlemmer(liste, 'narvaer').map(m => m.navn)).toEqual([
      'Andreas',
      'Bjørn',
      'Christian',
    ])
  })

  it('alle 0 % (Tidligere-seksjonen) blir alfabetisk', () => {
    const liste: M[] = [
      { navn: 'Christian', narv: 0 },
      { navn: 'Andreas', narv: 0 },
      { navn: 'Bjørn', narv: 0 },
    ]
    expect(sorterMedlemmer(liste, 'narvaer').map(m => m.navn)).toEqual([
      'Andreas',
      'Bjørn',
      'Christian',
    ])
  })

  it('muterer ikke input-arrayet', () => {
    const liste: M[] = [
      { navn: 'Christian', narv: 10 },
      { navn: 'Andreas', narv: 90 },
    ]
    const original = [...liste]
    sorterMedlemmer(liste, 'narvaer')
    expect(liste).toEqual(original)
  })
})

describe('sorterMedlemmer — alfabetisk', () => {
  it('bruker norsk collation — Å kommer etter Z', () => {
    const liste: M[] = [
      { navn: 'Åge', narv: null },
      { navn: 'Zakarias', narv: null },
    ]
    expect(sorterMedlemmer(liste, 'alfabetisk').map(m => m.navn)).toEqual([
      'Zakarias',
      'Åge',
    ])
  })

  it('muterer ikke input-arrayet', () => {
    const liste: M[] = [
      { navn: 'Christian', narv: null },
      { navn: 'Andreas', narv: null },
    ]
    const original = [...liste]
    sorterMedlemmer(liste, 'alfabetisk')
    expect(liste).toEqual(original)
  })
})
