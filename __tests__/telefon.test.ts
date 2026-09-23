import { describe, it, expect } from 'vitest'
import { normaliserTelefon } from '@/lib/telefon'

describe('normaliserTelefon', () => {
  it('returnerer null for tomt eller null-input', () => {
    expect(normaliserTelefon(null)).toBe(null)
    expect(normaliserTelefon(undefined)).toBe(null)
    expect(normaliserTelefon('')).toBe(null)
    expect(normaliserTelefon('   ')).toBe(null)
  })

  it('legger til +47 på 8-sifret norsk nummer', () => {
    expect(normaliserTelefon('41219458')).toBe('+47 41219458')
    expect(normaliserTelefon('90661382')).toBe('+47 90661382')
  })

  it('lar nummer med +-prefiks stå urørt', () => {
    expect(normaliserTelefon('+47 91583965')).toBe('+47 91583965')
    expect(normaliserTelefon('+4791583965')).toBe('+4791583965')
    expect(normaliserTelefon('+1 555 1234')).toBe('+1 555 1234')
  })

  it('konverterer 0047-prefiks til +', () => {
    expect(normaliserTelefon('004791583965')).toBe('+4791583965')
  })

  it('strip mellomrom og bindestreker for 8-siffer-deteksjon', () => {
    expect(normaliserTelefon('915 83 965')).toBe('+47 91583965')
    expect(normaliserTelefon('91-58-39-65')).toBe('+47 91583965')
  })

  it('lar nummer som ikke matcher mønsteret stå urørt (ukjent format)', () => {
    expect(normaliserTelefon('1234')).toBe('1234')
    expect(normaliserTelefon('hva er dette')).toBe('hva er dette')
  })
})
