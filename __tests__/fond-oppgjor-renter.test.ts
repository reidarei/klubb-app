import { describe, it, expect } from 'vitest'
import { validerOppgjor } from '@/lib/fond-oppgjor'

// renter_hittil står utenfor saldo og andeler (påløpt, ikke bokført), så
// fixturen har bevisst en saldo som IKKE inkluderer renta.
function oppgjor(renter?: Record<string, unknown>, ekstra: Record<string, unknown> = {}) {
  return {
    versjon: 1,
    generert: '2026-10-13T07:38:47Z',
    snapshot_dato: '2026-10-09',
    kontrollert_dato: '2026-10-13',
    saldo: 25801.32,
    andeler: [{ visningsnavn: 'Ada', belop: 25801.32 }],
    ...(renter ? { renter_hittil: renter } : {}),
    ...ekstra,
  }
}

const GYLDIG = { brutto: 618.31, netto_anslag: 482.28, skattesats: 0.22, observert_dato: '2026-10-11' }

describe('validerOppgjor — renter_hittil', () => {
  it('godtar oppgjøret slik fond-API-et publiserer det', () => {
    expect(validerOppgjor(oppgjor(GYLDIG)).renter_hittil).toEqual(GYLDIG)
  })

  it('godtar at feltet mangler, og lar det være fraværende (ikke 0)', () => {
    const o = validerOppgjor(oppgjor())
    expect(o.renter_hittil).toBeUndefined()
  })

  it('godtar en annen skattesats enn 22 % (historisk 0,474)', () => {
    // 1000 × (1 − 0,474) = 526
    expect(() =>
      validerOppgjor(oppgjor({ ...GYLDIG, brutto: 1000, netto_anslag: 526, skattesats: 0.474 })),
    ).not.toThrow()
  })

  it('godtar avlesning eldre enn snapshot_dato i samme år', () => {
    expect(() => validerOppgjor(oppgjor({ ...GYLDIG, observert_dato: '2026-03-01' }))).not.toThrow()
  })

  it('kaster når netto ikke stemmer med satsen', () => {
    expect(() => validerOppgjor(oppgjor({ ...GYLDIG, netto_anslag: 500 }))).toThrow(/skattesatsen/)
  })

  it('kaster på skattesats utenfor [0, 1)', () => {
    expect(() => validerOppgjor(oppgjor({ ...GYLDIG, skattesats: 1 }))).toThrow(/skattesats/)
    expect(() => validerOppgjor(oppgjor({ ...GYLDIG, skattesats: -0.1 }))).toThrow(/skattesats/)
  })

  it('kaster på en halv pakke', () => {
    const { netto_anslag: _n, ...uten } = GYLDIG
    expect(() => validerOppgjor(oppgjor(uten))).toThrow()
  })

  it('kaster når avlesningen er fra et annet år enn snapshotet', () => {
    expect(() => validerOppgjor(oppgjor({ ...GYLDIG, observert_dato: '2025-12-30' }))).toThrow(/snapshot-året/)
  })

  it('kaster når avlesningen er nyere enn kontrollert_dato', () => {
    expect(() => validerOppgjor(oppgjor({ ...GYLDIG, observert_dato: '2026-10-14' }))).toThrow(/kontrollert_dato/)
  })

  it('kaster på ugyldig dato som Date ellers ville «foldet»', () => {
    expect(() => validerOppgjor(oppgjor({ ...GYLDIG, observert_dato: '2026-02-30' }))).toThrow(/gyldig dato/)
  })

  it('kaster når renter_hittil er null — fravær uttrykkes ved å utelate feltet', () => {
    expect(() => validerOppgjor(oppgjor(undefined, { renter_hittil: null }))).toThrow()
  })
})

describe('validerOppgjor — kontrollert_dato', () => {
  it('godtar at den mangler (eldre oppgjør)', () => {
    const { kontrollert_dato: _k, ...uten } = oppgjor()
    expect(validerOppgjor(uten).kontrollert_dato).toBeUndefined()
  })

  it('godtar samme dag som snapshot_dato og en dato langt fram (ingen øvre grense)', () => {
    expect(() => validerOppgjor(oppgjor(undefined, { kontrollert_dato: '2026-10-09' }))).not.toThrow()
    expect(() => validerOppgjor(oppgjor(undefined, { kontrollert_dato: '2027-01-01' }))).not.toThrow()
  })

  it('kaster når den er før snapshot_dato', () => {
    expect(() => validerOppgjor(oppgjor(undefined, { kontrollert_dato: '2026-10-08' }))).toThrow(/før/)
  })

  it('kaster på ugyldig format og dato', () => {
    expect(() => validerOppgjor(oppgjor(undefined, { kontrollert_dato: '13.10.2026' }))).toThrow(/YYYY-MM-DD/)
    expect(() => validerOppgjor(oppgjor(undefined, { kontrollert_dato: '2026-11-31' }))).toThrow(/gyldig dato/)
  })
})
