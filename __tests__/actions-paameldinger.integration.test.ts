/**
 * Integrasjonstester for lib/actions/paameldinger.ts.
 *
 * Fanger at oppdaterPaamelding gjør upsert med korrekt payload,
 * kaster ved DB-feil, og kaller revalidatePath.
 *
 * NB: vi.mock()-fabrikker hoistes av Vitest — variabler som fabrikken
 * trenger MÅ deklareres via vi.hoisted(). Se actions-arrangementer.integration.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lagChain } from './helpers/supabase-mock'

// --- Hoistede mock-refs ---

const { mockFrom, mockSupabase, mockRevalidatePath } = vi.hoisted(() => {
  const mockFrom = vi.fn()
  const mockSupabase = { from: mockFrom }
  const mockRevalidatePath = vi.fn()
  return { mockFrom, mockSupabase, mockRevalidatePath }
})

// --- Modul-mocker ---

vi.mock('@/lib/auth', () => ({
  ensureInnlogget: vi.fn().mockResolvedValue({
    supabase: mockSupabase,
    user: { id: 'bruker-456' },
  }),
}))

vi.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args) }))

import { oppdaterPaamelding } from '@/lib/actions/paameldinger'

// --- Tester ---

beforeEach(() => {
  vi.clearAllMocks()
})

describe('oppdaterPaamelding', () => {
  it('gjør upsert med korrekt payload', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ data: null, error: null })

    mockFrom.mockImplementation(() => {
      const chain = lagChain(null)
      chain.upsert = upsertSpy
      chain.then = (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: null, error: null }).then(resolve)
      return chain
    })

    await oppdaterPaamelding('arr-xyz', 'ja')

    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        arrangement_id: 'arr-xyz',
        profil_id: 'bruker-456',
        status: 'ja',
      })
    )
  })

  it('kaller revalidatePath for arrangement og agenda etter vellykket upsert', async () => {
    mockFrom.mockImplementation(() => {
      const chain = lagChain(null)
      chain.upsert = vi.fn().mockReturnValue(chain)
      chain.then = (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: null, error: null }).then(resolve)
      return chain
    })

    await oppdaterPaamelding('arr-xyz', 'nei')

    // Begge paths skal revalideres — se paameldinger.ts
    expect(mockRevalidatePath).toHaveBeenCalledWith('/arrangementer/arr-xyz')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/')
  })

  it('kaster ved DB-feil', async () => {
    mockFrom.mockImplementation(() => {
      const chain = lagChain(null)
      chain.upsert = vi.fn().mockReturnValue(chain)
      // Simuler at upsert slår tilbake med error via thenable
      chain.then = (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: null, error: { message: 'Upsert-feil' } }).then(resolve)
      return chain
    })

    await expect(oppdaterPaamelding('arr-xyz', 'kanskje')).rejects.toThrow('Upsert-feil')
  })
})
