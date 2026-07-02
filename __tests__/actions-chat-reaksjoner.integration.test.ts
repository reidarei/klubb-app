/**
 * Integrasjonstester for reaksjons-actions i lib/actions/chat.ts.
 *
 * Tester leggTilReaksjon og fjernReaksjon — insert/delete mot
 * chat_reaksjoner med korrekt payload.
 *
 * NB: vi.mock()-fabrikker hoistes av Vitest — variabler som fabrikken
 * trenger MÅ deklareres via vi.hoisted(). Se actions-arrangementer.integration.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lagChain } from './helpers/supabase-mock'

// --- Hoistede mock-refs ---

const { mockFrom, mockSupabase } = vi.hoisted(() => {
  const mockFrom = vi.fn()
  const mockSupabase = { from: mockFrom }
  return { mockFrom, mockSupabase }
})

// --- Modul-mocker ---

vi.mock('@/lib/auth', () => ({
  ensureInnlogget: vi.fn().mockResolvedValue({
    supabase: mockSupabase,
    user: { id: 'bruker-789' },
  }),
}))

// chat.ts importerer createServerClient — stubb slik at vi ikke trenger
// Next.js cookie-kontekst under test.
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn().mockResolvedValue(mockSupabase),
}))

vi.mock('@/lib/varsler', () => ({
  sendVarsel: vi.fn().mockResolvedValue(undefined),
  sendChatMentionVarsler: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/config', () => ({
  BASE_URL: 'https://test.example.com',
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { leggTilReaksjon, fjernReaksjon } from '@/lib/actions/chat'

// --- Tester ---

beforeEach(() => {
  vi.clearAllMocks()
})

describe('leggTilReaksjon', () => {
  it('gjør upsert med korrekt payload mot chat_reaksjoner', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ data: null, error: null })

    mockFrom.mockImplementation((tabell: string) => {
      expect(tabell).toBe('chat_reaksjoner')
      const chain = lagChain(null)
      chain.upsert = upsertSpy
      chain.then = (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: null, error: null }).then(resolve)
      return chain
    })

    await leggTilReaksjon('melding-001', '👍')

    // Payload og konflikt-nøkkel skal matche tabellens unique constraint
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        melding_id: 'melding-001',
        profil_id: 'bruker-789',
        emoji: '👍',
      }),
      expect.objectContaining({ onConflict: 'melding_id,profil_id,emoji' })
    )
  })

  it('kaster ved DB-feil', async () => {
    mockFrom.mockImplementation(() => {
      const chain = lagChain(null)
      chain.upsert = vi.fn().mockReturnValue(chain)
      chain.then = (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: null, error: { message: 'Upsert-feil reaksjon' } }).then(resolve)
      return chain
    })

    await expect(leggTilReaksjon('melding-001', '👍')).rejects.toThrow('Upsert-feil reaksjon')
  })
})

describe('fjernReaksjon', () => {
  it('sletter riktig rad via delete().eq(melding_id).eq(profil_id).eq(emoji)', async () => {
    const eqKall: Array<{ col: string; val: string }> = []

    mockFrom.mockImplementation((tabell: string) => {
      expect(tabell).toBe('chat_reaksjoner')
      const chain = lagChain(null)

      // Fang alle tre eq-kall for å verifisere at korrekte filter-ledd er satt
      chain.eq = vi.fn((col: string, val: string) => {
        eqKall.push({ col, val })
        return chain
      })

      chain.delete = vi.fn().mockReturnValue(chain)

      chain.then = (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: null, error: null }).then(resolve)
      return chain
    })

    await fjernReaksjon('melding-002', '❤️')

    // Presis lengde-sjekk: eksakt tre eq-kall. Uten dette kan koden regressere
    // til f.eks. delete().eq('melding_id', ...) alene — som ville slettet ALLE
    // brukerens reaksjoner på meldingen. Potensielt katastrofalt datatap.
    expect(eqKall).toHaveLength(3)
    expect(eqKall).toEqual(
      expect.arrayContaining([
        { col: 'melding_id', val: 'melding-002' },
        { col: 'profil_id', val: 'bruker-789' },
        { col: 'emoji', val: '❤️' },
      ])
    )
  })

  it('kaster ved DB-feil', async () => {
    mockFrom.mockImplementation(() => {
      const chain = lagChain(null)
      chain.delete = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.then = (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: null, error: { message: 'Delete-feil' } }).then(resolve)
      return chain
    })

    await expect(fjernReaksjon('melding-002', '❤️')).rejects.toThrow('Delete-feil')
  })
})
