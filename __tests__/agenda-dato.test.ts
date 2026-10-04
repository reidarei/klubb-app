import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { agendaDato } from '@/lib/dato'

// Instantene er valgt slik at Oslo-dagen er entydig (midt på dagen UTC), og
// «i år» låses med falsk klokke — samme krav som Policy: Tidshåndtering stiller
// til tester som avhenger av dagens dato.
describe('agendaDato', () => {
  beforeAll(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 4, 10, 0)))
  })
  afterAll(() => vi.useRealTimers())

  it('ukedag med stor forbokstav og måned uten punktum', () => {
    expect(agendaDato('2026-12-11T17:00:00Z')).toBe('Fre 11. des')
  })
  it('mai har ikke punktum — ingen bokstav skal kappes', () => {
    expect(agendaDato('2026-05-15T10:00:00Z')).toBe('Fre 15. mai')
  })
  it('årstall når det ikke er i år', () => {
    expect(agendaDato('2027-02-14T06:30:00Z')).toBe('Søn 14. feb 2027')
  })
  it('bruker Oslo-dagen, ikke UTC-dagen', () => {
    // 23:30 UTC 31. okt = 00:30 1. nov i Oslo (vintertid)
    expect(agendaDato('2026-10-31T23:30:00Z')).toBe('Søn 1. nov')
  })
})
