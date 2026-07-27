import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lagFromMock } from './helpers/supabase-mock'

// Mock Supabase admin-klient — logg.ts importerer denne LAZY (`await
// import('@/lib/supabase/admin')`) inne i persisterFeilLogg(), men vi.mock
// fanger opp modulen uansett om importen er statisk eller dynamisk. (#496)
const mockFrom = vi.fn()
const mockSupabase = { from: mockFrom }

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockSupabase,
}))

import { logg } from '@/lib/logg'

beforeEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

function pgFeil(code: string, message: string) {
  return { code, message }
}

describe('logg.feil() – feil_logg-persistering (#496)', () => {
  it('kaster aldri selv om feil_logg-inserten feiler', async () => {
    mockFrom.mockImplementation(lagFromMock({}, { feil_logg: { code: '08006', message: 'connection refused' } }))

    await expect(
      logg.feil('test.event', new Error('noe gikk galt')),
    ).resolves.toBeUndefined()
  })

  it('kaster aldri selv om createAdminClient/insert kaster (f.eks. timeout)', async () => {
    mockFrom.mockImplementation(() => {
      throw new Error('AbortError: signal timed out')
    })

    await expect(
      logg.feil('test.event', new Error('noe gikk galt')),
    ).resolves.toBeUndefined()
  })

  it('persisterer error-tilfeller til feil_logg med kun {event, code, tabell, nivaa, profil_id}', async () => {
    const insertSpion = vi.fn()
    mockFrom.mockImplementation((tabell: string) => {
      const chain: Record<string, unknown> = {}
      const metoder = ['insert', 'abortSignal']
      for (const m of metoder) chain[m] = vi.fn().mockReturnValue(chain)
      // insert() kalles med selve raden — fang den for assertions.
      chain.insert = vi.fn((rad: unknown) => {
        insertSpion(tabell, rad)
        return chain
      })
      chain.then = (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: null, error: null }).then(resolve)
      return chain
    })

    await logg.feil('test.event', pgFeil('23505', 'duplicate key value violates unique constraint "profiles_epost_key"\nKey (epost)=(x@y.no) already exists'), {
      ctx: { profil_id: 'user-1', arrangement_id: 'arr-1', count: 3 },
    })

    expect(insertSpion).toHaveBeenCalledTimes(1)
    const [tabell, rad] = insertSpion.mock.calls[0] as [string, Record<string, unknown>]
    expect(tabell).toBe('feil_logg')
    expect(Object.keys(rad).sort()).toEqual(['event', 'kontekst', 'nivaa', 'profil_id'])
    expect(rad.event).toBe('test.event')
    expect(rad.nivaa).toBe('error')
    expect(rad.profil_id).toBe('user-1')
    // arrangement_id og count skal IKKE følge med i kontekst — kun code/tabell.
    expect(rad.kontekst).toEqual({ code: '23505', tabell: 'profiles_epost_key' })
  })

  it('persisterer aldri melding-feltet (kan bære radverdier)', async () => {
    const insertSpion = vi.fn()
    mockFrom.mockImplementation((tabell: string) => {
      const chain: Record<string, unknown> = {}
      chain.insert = vi.fn((rad: unknown) => {
        insertSpion(rad)
        return chain
      })
      chain.abortSignal = vi.fn().mockReturnValue(chain)
      chain.then = (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: null, error: null }).then(resolve)
      return chain
    })

    await logg.feil('test.event', pgFeil('23505', 'Key (epost)=(hemmelig@test.no) already exists'))

    const rad = insertSpion.mock.calls[0][0] as Record<string, unknown>
    expect(JSON.stringify(rad)).not.toContain('hemmelig@test.no')
    expect(rad.melding).toBeUndefined()
  })

  it('legger en AbortSignal på inserten (hard cap under pool-utmattelse)', async () => {
    // Reviewer mutasjonstestet: .abortSignal(...) kunne fjernes helt uten at
    // én av 559 tester ble rød, selv om den er et eksplisitt krav i #496.
    // Uten den kan en logge-skriving vente ubegrenset på en ledig tilkobling —
    // altså legge seg oppå akkurat det trykket som utløste feilen. (#498-review)
    const signaler: unknown[] = []
    mockFrom.mockImplementation(() => {
      const chain: Record<string, unknown> = {}
      chain.insert = vi.fn().mockReturnValue(chain)
      chain.abortSignal = vi.fn((signal: unknown) => {
        signaler.push(signal)
        return chain
      })
      chain.then = (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: null, error: null }).then(resolve)
      return chain
    })

    await logg.feil('test.event', new Error('noe gikk galt'))

    expect(signaler).toHaveLength(1)
    expect(signaler[0]).toBeInstanceOf(AbortSignal)
    // Skal være en timeout som ennå ikke har løpt ut, ikke et ferdig-abortert
    // signal (som ville avbrutt hver eneste insert umiddelbart).
    expect((signaler[0] as AbortSignal).aborted).toBe(false)
  })

  it('persisterer ikke warn-nivå til feil_logg', async () => {
    // RLS-avvisning (violates row-level security policy) klassifiseres warn
    // og skal returnere før persisterFeilLogg() i det hele tatt kalles.
    await logg.feil('test.event', pgFeil('42501', 'new row violates row-level security policy for table "chat"'))

    expect(mockFrom).not.toHaveBeenCalled()
  })
})

describe('logg.feil() – PGRST301 er død sesjon, ikke tilgangsfeil (#498-review)', () => {
  beforeEach(() => {
    mockFrom.mockImplementation(lagFromMock({}))
  })

  it('«JWT expired» med PGRST301 → warn, ingen feil_logg-rad, ingen alarm', async () => {
    const consoleSpion = vi.spyOn(console, 'log').mockImplementation(() => {})

    await logg.feil('test.event', pgFeil('PGRST301', 'JWT expired'))

    const linjer = consoleSpion.mock.calls.map(c => JSON.parse(c[0] as string))
    expect(linjer).toHaveLength(1)
    expect(linjer[0].nivaa).toBe('warn')
    // Ingen rad → teller ikke mot KLIENT_FEIL_ALARM_TERSKEL (som er 0).
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('PGRST301 er warn uansett meldingstekst — koden alene holder', async () => {
    const consoleSpion = vi.spyOn(console, 'log').mockImplementation(() => {})

    await logg.feil('test.event', pgFeil('PGRST301', 'noe helt annet'))

    const linjer = consoleSpion.mock.calls.map(c => JSON.parse(c[0] as string))
    expect(linjer.every(l => l.nivaa === 'warn')).toBe(true)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('JWT-meldinger uten kode → warn (GoTrue-varianter bærer ikke alltid kode)', async () => {
    const consoleSpion = vi.spyOn(console, 'log').mockImplementation(() => {})

    for (const melding of ['JWT expired', 'JWT invalid', 'JWSError JWSInvalidSignature']) {
      await logg.feil('test.event', new Error(melding))
    }

    const linjer = consoleSpion.mock.calls.map(c => JSON.parse(c[0] as string))
    expect(linjer).toHaveLength(3)
    expect(linjer.every(l => l.nivaa === 'warn')).toBe(true)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('42501 påvirkes ikke — tripwiren for GRANT-klippen 30.10.2026 står', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await logg.feil('test.event', pgFeil('42501', 'permission denied for table "profiles"'))

    expect(mockFrom).toHaveBeenCalledWith('feil_logg')
  })
})

describe('logg.feil() – 42501-klassifisering (#497)', () => {
  beforeEach(() => {
    mockFrom.mockImplementation(lagFromMock({}))
  })

  it('«permission denied for table» → alltid error, aldri overstyrbar', async () => {
    const consoleSpion = vi.spyOn(console, 'log').mockImplementation(() => {})

    await logg.feil('test.event', pgFeil('42501', 'permission denied for table "profiles"'))

    const linjer = consoleSpion.mock.calls.map(c => JSON.parse(c[0] as string))
    expect(linjer.some(l => l.nivaa === 'error')).toBe(true)
    expect(linjer.some(l => l.nivaa === 'warn')).toBe(false)
    // Skal falle gjennom til persistering (ikke tidlig-retur).
    expect(mockFrom).toHaveBeenCalledWith('feil_logg')
  })

  it('«violates row-level security policy» → warn, ikke persistert', async () => {
    const consoleSpion = vi.spyOn(console, 'log').mockImplementation(() => {})

    // Bruker 42501 her (ikke PGRST301) — PGRST301 er nå warn på koden alene,
    // så den ville ikke lenger testet RLS-grenen. (#498-review)
    await logg.feil('test.event', pgFeil('42501', 'new row violates row-level security policy for table "meldinger"'))

    const linjer = consoleSpion.mock.calls.map(c => JSON.parse(c[0] as string))
    expect(linjer).toHaveLength(1)
    expect(linjer[0].nivaa).toBe('warn')
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('annet 42501-innhold → error (defaulten snudd, se #497)', async () => {
    const consoleSpion = vi.spyOn(console, 'log').mockImplementation(() => {})

    await logg.feil('test.event', pgFeil('42501', 'noe uventet med samme SQLSTATE'))

    const linjer = consoleSpion.mock.calls.map(c => JSON.parse(c[0] as string))
    expect(linjer.some(l => l.nivaa === 'error')).toBe(true)
    expect(mockFrom).toHaveBeenCalledWith('feil_logg')
  })
})
