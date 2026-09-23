/**
 * Pinner Policy: Databasespørringer sin fail-closed-regel for lib/auth.ts og
 * lib/auth-cache.ts — begge er autorisasjons-stien, og skal ALDRI la en
 * feilet profil-spørring falle stille gjennom til "ingen rolle" (som ville
 * blitt tolket som "ikke admin", men uten at noen fikk vite at spørringen
 * faktisk feilet i stedet for å bekrefte det).
 *
 * Bruker de EKTE implementasjonene (ikke mocket bort som i actions-testene)
 * — poenget er å bevise at ensureAdmin()/ensureLoeserTiebreak()/getProfil()
 * faktisk kaster på en feilet spørring, ikke bare at kallerne håndterer det
 * riktig gitt at de gjør det.
 */
import { describe, it, expect, vi } from 'vitest'
import { lagChain } from './helpers/supabase-mock'

const feilendeSpoerring = { code: '500', message: 'connection reset', details: null, hint: null }

function mockSupabaseMedProfilFeil(bruker: { id: string } | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: bruker }, error: null }),
    },
    from: vi.fn(() => lagChain([], feilendeSpoerring)),
  }
}

describe('lib/auth.ts — fail closed på feilet profil-oppslag', () => {
  it('ensureAdmin() kaster (ikke faller gjennom til «ikke admin») når profil-spørringen feiler', async () => {
    vi.resetModules()
    vi.doMock('@/lib/supabase/server', () => ({
      createServerClient: vi.fn().mockResolvedValue(mockSupabaseMedProfilFeil({ id: 'bruker-1' })),
    }))
    const { ensureAdmin } = await import('@/lib/auth')

    await expect(ensureAdmin()).rejects.toThrow('Kunne ikke hente profil')
  })

  it('ensureLoeserTiebreak() kaster på samme måte', async () => {
    vi.resetModules()
    vi.doMock('@/lib/supabase/server', () => ({
      createServerClient: vi.fn().mockResolvedValue(mockSupabaseMedProfilFeil({ id: 'bruker-1' })),
    }))
    const { ensureLoeserTiebreak } = await import('@/lib/auth')

    await expect(ensureLoeserTiebreak()).rejects.toThrow('Kunne ikke hente profil')
  })

  it('ensureAdmin() gir fortsatt "Ikke admin" (ikke en spørringsfeil) når profilen bare mangler admin-rolle', async () => {
    vi.resetModules()
    vi.doMock('@/lib/supabase/server', () => ({
      createServerClient: vi.fn().mockResolvedValue({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'bruker-1' } }, error: null }) },
        from: vi.fn(() => lagChain({ rolle: 'medlem' })),
      }),
    }))
    const { ensureAdmin } = await import('@/lib/auth')

    await expect(ensureAdmin()).rejects.toThrow('Ikke admin')
  })
})

describe('lib/auth-cache.ts getProfil() — fail closed på feilet profil-oppslag', () => {
  it('kaster når profiles-spørringen feiler (brukes til rolle-sjekker i hele appen)', async () => {
    vi.resetModules()
    // Samme mock-objekt gjenbrukes for getInnloggetBruker() (auth.getSession)
    // og getProfil() (from(...).maybeSingle()) sitt createServerClient()-kall
    // — react.cache() memoiserer per request, ikke relevant i denne testen
    // siden vi kaller getProfil() direkte én gang.
    vi.doMock('@/lib/supabase/server', () => ({
      createServerClient: vi.fn().mockResolvedValue({
        auth: {
          getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'bruker-1' } } } }),
        },
        from: vi.fn(() => lagChain([], feilendeSpoerring)),
      }),
    }))
    const { getProfil } = await import('@/lib/auth-cache')

    await expect(getProfil()).rejects.toThrow('Kunne ikke hente profil')
  })
})
