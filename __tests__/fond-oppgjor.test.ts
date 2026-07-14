import { describe, it, expect } from 'vitest'
import { validerOppgjor } from '@/lib/fond-oppgjor'

// Gyldig oppgjør brukt som base for alle tester
const GYLDIG: unknown = {
  versjon: 1,
  generert: '2026-07-14T18:05:00Z',
  snapshot_dato: '2026-07-13',
  saldo: 19651.31,
  andeler: [
    { visningsnavn: 'Jonna', belop: 6612.2 },
    { visningsnavn: 'Reka', belop: 5000.0 },
  ],
}

describe('validerOppgjor', () => {
  it('godtar gyldig kontrakt', () => {
    const resultat = validerOppgjor(GYLDIG)
    expect(resultat.versjon).toBe(1)
    expect(resultat.andeler).toHaveLength(2)
  })

  it('kaster ved versjon 2', () => {
    expect(() =>
      validerOppgjor({ ...GYLDIG as object, versjon: 2 }),
    ).toThrow('versjon')
  })

  it('kaster ved negativ saldo', () => {
    expect(() =>
      validerOppgjor({ ...GYLDIG as object, saldo: -100 }),
    ).toThrow()
  })

  it('kaster ved negativ belop på andel', () => {
    expect(() =>
      validerOppgjor({
        ...GYLDIG as object,
        andeler: [{ visningsnavn: 'Jonna', belop: -50 }],
      }),
    ).toThrow()
  })

  it('kaster ved belop med mer enn to desimaler', () => {
    // 6612.201 → øre = 661220.1 → Math.abs(661220.1 - Math.round(661220.1)) = 0.1 > 1e-6
    expect(() =>
      validerOppgjor({
        ...GYLDIG as object,
        andeler: [{ visningsnavn: 'Jonna', belop: 6612.201 }],
      }),
    ).toThrow('desimaler')
  })

  it('kaster ved saldo med mer enn to desimaler', () => {
    expect(() =>
      validerOppgjor({ ...GYLDIG as object, saldo: 100.999 }),
    ).toThrow('desimaler')
  })

  it('kaster ved tom andeler-liste', () => {
    expect(() =>
      validerOppgjor({ ...GYLDIG as object, andeler: [] }),
    ).toThrow('andeler')
  })

  it('kaster ved ugyldig snapshot_dato (feil format)', () => {
    expect(() =>
      validerOppgjor({ ...GYLDIG as object, snapshot_dato: '13-07-2026' }),
    ).toThrow('snapshot_dato')
  })

  it('kaster ved ugyldig snapshot_dato (finnes ikke i kalenderen)', () => {
    expect(() =>
      validerOppgjor({ ...GYLDIG as object, snapshot_dato: '2026-02-30' }),
    ).toThrow()
  })

  it('kaster ved manglende snapshot_dato', () => {
    const { snapshot_dato: _, ...uten } = GYLDIG as Record<string, unknown>
    expect(() => validerOppgjor(uten)).toThrow('snapshot_dato')
  })

  it('kaster ved tom visningsnavn', () => {
    expect(() =>
      validerOppgjor({
        ...GYLDIG as object,
        andeler: [{ visningsnavn: '   ', belop: 100 }],
      }),
    ).toThrow('visningsnavn')
  })

  it('kaster ved visningsnavn som ikke er streng', () => {
    expect(() =>
      validerOppgjor({
        ...GYLDIG as object,
        andeler: [{ visningsnavn: null, belop: 100 }],
      }),
    ).toThrow('visningsnavn')
  })

  it('kaster ved ikke-objekt input (null)', () => {
    expect(() => validerOppgjor(null)).toThrow()
  })

  it('kaster ved ikke-objekt input (array)', () => {
    expect(() => validerOppgjor([1, 2, 3])).toThrow()
  })

  it('kaster ved ikke-objekt input (streng)', () => {
    expect(() => validerOppgjor('noe tekst')).toThrow()
  })

  it('kaster ved duplikat visningsnavn (trimmet)', () => {
    // «Jonna» og « Jonna » er samme navn etter trim — to like navn ville ellers
    // gitt doble insert-rader ved skriving (#453).
    expect(() =>
      validerOppgjor({
        ...GYLDIG as object,
        andeler: [
          { visningsnavn: 'Jonna', belop: 100 },
          { visningsnavn: ' Jonna ', belop: 200 },
        ],
      }),
    ).toThrow('Duplikat')
  })

  it('kaster ved manglende generert', () => {
    const { generert: _, ...uten } = GYLDIG as Record<string, unknown>
    expect(() => validerOppgjor(uten)).toThrow('generert')
  })

  it('kaster ved generert som ikke er streng', () => {
    expect(() =>
      validerOppgjor({ ...GYLDIG as object, generert: 12345 }),
    ).toThrow('generert')
  })
})
