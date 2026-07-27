import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lagChain } from './helpers/supabase-mock'

vi.mock('@/lib/varsler', () => ({
  sendKaaringspollVinnerVarsel: vi.fn().mockResolvedValue(undefined),
  sendKaaringspollTiebreakVarsel: vi.fn().mockResolvedValue(undefined),
  sendKaaringspollIngenStemmerVarsel: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/dato', () => ({
  naa: () => '2026-07-27T08:00:00.000Z',
}))

import { utledKaaringStatus, stempleVinnerVarslet } from '@/lib/varsler-kaaringspoll'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('utledKaaringStatus', () => {
  it('returnerer avgjort når tiebreak_status er avgjort', () => {
    expect(utledKaaringStatus('avgjort')).toBe('avgjort')
  })

  it('returnerer venter_paa_tiebreak når tiebreak_status er venter_paa_tiebreak', () => {
    expect(utledKaaringStatus('venter_paa_tiebreak')).toBe('venter_paa_tiebreak')
  })

  it('returnerer ingen_stemmer når tiebreak_status er null', () => {
    expect(utledKaaringStatus(null)).toBe('ingen_stemmer')
  })
})

describe('stempleVinnerVarslet', () => {
  it('kaller update med vinner_varslet_paa og is(vinner_varslet_paa, null)-CAS', async () => {
    // Assert på selve kjeden, ikke bare at from('poll') ble kalt: CAS-en er
    // det som hindrer at en av de fire skriverne til vinner_varslet_paa
    // overskriver et eldre stempel. Fjernes .is(...) fra kilden, skal DENNE
    // testen bli rød. (#504-review MAJOR-2)
    const chain = lagChain(null)
    const mockFrom = vi.fn(() => chain)
    const admin = { from: mockFrom } as unknown as Parameters<typeof stempleVinnerVarslet>[0]

    await stempleVinnerVarslet(admin, 'poll1')

    expect(mockFrom).toHaveBeenCalledWith('poll')
    expect(chain.update).toHaveBeenCalledWith({ vinner_varslet_paa: '2026-07-27T08:00:00.000Z' })
    expect(chain.eq).toHaveBeenCalledWith('id', 'poll1')
    // Selve compare-and-swap-en: bare stemple hvis ingen har stemplet før oss.
    expect(chain.is).toHaveBeenCalledWith('vinner_varslet_paa', null)
  })

  it('kaster hvis update-spørringen feiler', async () => {
    const admin = {
      from: vi.fn(() => lagChain(null, new Error('DB nede'))),
    } as unknown as Parameters<typeof stempleVinnerVarslet>[0]

    await expect(stempleVinnerVarslet(admin, 'poll1')).rejects.toThrow(/Kunne ikke stemple/)
  })
})
