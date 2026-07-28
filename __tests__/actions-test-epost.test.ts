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

const { mockFrom, getProfil } = vi.hoisted(() => ({
  mockFrom: vi.fn<(tabell: string) => unknown>(),
  getProfil: vi.fn().mockResolvedValue({ rolle: 'admin' }),
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: mockFrom }) }))
vi.mock('@/lib/supabase/server', () => ({ createServerClient: vi.fn() }))
vi.mock('@/lib/auth-cache', () => ({ getProfil, getInnloggetBruker: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
  getProfil.mockResolvedValue({ rolle: 'admin' })
})

async function kall(epost = 'admin@example.com') {
  const { oppdaterTestEpost } = await import('@/app/(app)/innstillinger/actions')
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

  it('returnerer feil i stedet for stille no-op for ikke-admin', async () => {
    getProfil.mockResolvedValue({ rolle: 'medlem' })
    const res = await kall()
    expect(res.ok).toBe(false)
    expect(mockFrom).not.toHaveBeenCalled()
  })
})
