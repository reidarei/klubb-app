/**
 * Pinner at oppdaterTestEpost aldri kaster.
 *
 * Kallet skjer fra en startTransition() i TestEpostVelger, og en avvist
 * server action i en transition propagerer til nærmeste error boundary i
 * React 19 — altså ville hele /innstillinger blitt byttet ut med feilskjermen
 * fordi et nedtrekk feilet. Actionen returnerer derfor
 * { ok: false, feil } i stedet, slik fond.ts allerede gjør (#459).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lagChain } from './helpers/supabase-mock'

const { mockFrom, ensureAdmin, createAdminClient } = vi.hoisted(() => {
  const mockFrom = vi.fn<(tabell: string) => unknown>()
  return {
    mockFrom,
    ensureAdmin: vi.fn(),
    createAdminClient: vi.fn(() => ({ from: mockFrom })),
  }
})

// Autorisasjon og skriving går via ensureAdmin() sin RLS-klient (Policy: Auth, #851).
vi.mock('@/lib/auth', () => ({ ensureAdmin }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))
vi.mock('@/lib/supabase/server', () => ({ createServerClient: vi.fn() }))
vi.mock('@/lib/auth-cache', () => ({ getProfil: vi.fn(), getInnloggetBruker: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
  ensureAdmin.mockResolvedValue({ supabase: { from: mockFrom }, user: { id: 'admin-1' }, profil: { rolle: 'admin' } })
})

// Modulnivå-import, ikke `await import()` i testkroppen: vi.mock hoistes over
// imports, så mockene er på plass uansett — men dynamisk import her betaler
// transform-kostnaden for hele avhengighetstreet under testens 5s-timeout og
// gjør suiten tidvis rød uten at noe er galt. Jf. 9447de1.
const { oppdaterTestEpost } = await import('@/app/(app)/innstillinger/actions')

async function kall(epost = 'admin@example.com') {
  return oppdaterTestEpost(epost)
}

describe('oppdaterTestEpost', () => {
  it('lagrer og returnerer ok når mottakeren er en aktiv admin', async () => {
    mockFrom.mockImplementation((tabell: string) =>
      tabell === 'profiles' ? lagChain({ id: 'admin-1' }) : lagChain([]),
    )
    await expect(kall()).resolves.toEqual({ ok: true })
  })

  it('returnerer feil (kaster ikke) når mottaker-oppslaget feiler', async () => {
    mockFrom.mockImplementation((tabell: string) =>
      tabell === 'profiles' ? lagChain(null, { message: 'DB nede' }) : lagChain([]),
    )
    const res = await kall()
    expect(res.ok).toBe(false)
    expect(res).toMatchObject({ feil: expect.stringContaining('DB nede') })
  })

  it('returnerer feil (kaster ikke) når skrivingen feiler', async () => {
    mockFrom.mockImplementation((tabell: string) =>
      tabell === 'profiles'
        ? lagChain({ id: 'admin-1' })
        : lagChain(null, { message: 'skriving avvist' }),
    )
    const res = await kall()
    expect(res.ok).toBe(false)
    expect(res).toMatchObject({ feil: expect.stringContaining('skriving avvist') })
  })

  it('returnerer feil når ingen aktiv admin matcher eposten', async () => {
    mockFrom.mockImplementation(() => lagChain(null))
    const res = await kall('finnes-ikke@example.com')
    expect(res.ok).toBe(false)
  })

  it('returnerer feil (kaster ikke) når ensureAdmin avviser', async () => {
    ensureAdmin.mockRejectedValue(new Error('Ikke admin'))
    const res = await kall()
    expect(res).toEqual({ ok: false, feil: 'Du har ikke tilgang til å endre dette' })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('skiller et feilet profil-oppslag fra manglende tilgang', async () => {
    ensureAdmin.mockRejectedValue(new Error('Kunne ikke hente profil: DB nede'))
    const res = await kall()
    expect(res).toEqual({ ok: false, feil: 'Kunne ikke hente profil: DB nede' })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('bruker ikke service role-klienten', async () => {
    mockFrom.mockImplementation((tabell: string) =>
      tabell === 'profiles' ? lagChain({ id: 'admin-1' }) : lagChain([]),
    )
    await kall()
    expect(createAdminClient).not.toHaveBeenCalled()
  })
})
