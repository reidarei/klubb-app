import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { lagFromMock } from './helpers/supabase-mock'
import { sendVarsel } from '@/lib/varsler'

// Egen fil (i stedet for en test inni varsler.test.ts): rent organisatorisk,
// for å holde dev-guard-testen samlet. lib/varsler.ts sin blokkerUtsending()
// er lat (#765) — den regner BASE_URL/env-flaggene ut PER KALL i stedet for
// å fryse dem i en modulnivå-konstant ved import, så testen trenger kun
// vi.stubEnv() før kallet. Modulgrafen importeres derfor STATISK øverst med
// vilje: en dynamisk import inne i testkroppen (kombinert med
// vi.resetModules()) kostet ~1,6–2,4 s og var det som timet ut full
// vitest-suite i #765.
const mockFrom = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mockFrom }),
}))
vi.mock('@/lib/push', () => ({ sendPush: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/epost', () => ({
  sendEpost: vi.fn().mockResolvedValue(undefined),
  sendEpostBatch: vi.fn().mockResolvedValue(undefined),
  arrangementEpostHtml: vi.fn().mockReturnValue('<html></html>'),
}))
const mockLoggWarn = vi.fn()
vi.mock('@/lib/logg', () => ({
  logg: { warn: (...a: unknown[]) => mockLoggWarn(...a), feil: vi.fn().mockResolvedValue(undefined) },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockFrom.mockImplementation(lagFromMock({}))
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('sendVarsel – utfall: blokkert_lokal (#504)', () => {
  it('returnerer blokkert_lokal når BASE_URL peker til localhost (dev-guard)', async () => {
    // Overstyr slik at ER_UNIT_TEST-sjekken i blokkerUtsending() ikke lenger
    // nuller ut resultatet, og BASE_URL faller tilbake til DEV_URL
    // (localhost) i lib/config.ts.
    vi.stubEnv('VITEST', '')
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', '')
    vi.stubEnv('VERCEL_URL', '')
    vi.stubEnv('VERCEL_ENV', '')
    vi.stubEnv('ALLOW_LOCAL_NOTIFICATIONS', '')
    vi.stubEnv('NODE_ENV', 'test')

    const utfall = await sendVarsel({
      mottakere: ['user1'],
      tittel: 'Test',
      melding: 'Test',
      type: 'test',
    })

    expect(utfall).toEqual({ utfall: 'blokkert_lokal', levert: 0, kunApp: 0, dedupHoppet: 0 })
    expect(mockLoggWarn).toHaveBeenCalledWith('varsel.blokkert.lokal', expect.anything())
  })
})
