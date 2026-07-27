import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { lagFromMock } from './helpers/supabase-mock'

// Egen fil (i stedet for en test inni varsler.test.ts): BLOKKER_UTSENDING
// regnes ut PÅ MODUL-NIVÅ i lib/varsler.ts ut fra BASE_URL og VITEST-env-en
// vitest selv setter. For å teste 'blokkert_lokal'-grenen må vi overstyre
// VITEST-flagget FØR modulen lastes, og deretter reimportere den friskt —
// det er tryggest å isolere i egen fil slik at resetModules()/stubEnv() ikke
// kan lekke inn i andre testers modul-cache.
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
  vi.resetModules()
})

describe('sendVarsel – utfall: blokkert_lokal (#504)', () => {
  it('returnerer blokkert_lokal når BASE_URL peker til localhost (dev-guard)', async () => {
    vi.resetModules()
    // Overstyr slik at ER_UNIT_TEST-sjekken i lib/varsler.ts ikke lenger
    // nuller ut BLOKKER_UTSENDING, og BASE_URL faller tilbake til
    // DEV_URL (localhost) i lib/config.ts.
    vi.stubEnv('VITEST', '')
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', '')
    vi.stubEnv('VERCEL_URL', '')
    vi.stubEnv('ALLOW_LOCAL_NOTIFICATIONS', '')
    vi.stubEnv('NODE_ENV', 'test')

    const { sendVarsel } = await import('@/lib/varsler')
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
