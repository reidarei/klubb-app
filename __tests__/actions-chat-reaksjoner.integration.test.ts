/**
 * Integrasjonstester for reaksjons-actions i lib/actions/chat.ts.
 *
 * Tester leggTilReaksjon og fjernReaksjon mot chat_reaksjoner. Siden #472
 * bytter leggTilReaksjon fra upsert til delete+insert (én reaksjon per
 * bruker — ny emoji bytter, i stedet for å legge seg ved siden av).
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
  it('sletter brukerens eksisterende reaksjon (uten emoji-filter), deretter insert med ny emoji', async () => {
    const deleteEqKall: Array<{ col: string; val: string }> = []
    const insertSpy = vi.fn().mockResolvedValue({ data: null, error: null })
    // Rekkefølgen delete→insert er selve poenget: den gir DELETE- så INSERT-
    // realtime-events, som useChatReaksjoner er avhengig av. Fang sekvensen.
    const kallSekvens: string[] = []
    let deleteKalt = false

    mockFrom.mockImplementation((tabell: string) => {
      expect(tabell).toBe('chat_reaksjoner')
      const chain = lagChain(null)

      chain.delete = vi.fn(() => {
        deleteKalt = true
        kallSekvens.push('delete')
        return chain
      })
      // Delete skal IKKE filtrere på emoji — det er poenget med bytte-
      // logikken: brukerens eventuelle andre emoji på meldingen skal fjernes.
      chain.eq = vi.fn((col: string, val: string) => {
        deleteEqKall.push({ col, val })
        return chain
      })
      chain.insert = vi.fn((arg: unknown) => {
        kallSekvens.push('insert')
        return insertSpy(arg)
      })
      chain.then = (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: null, error: null }).then(resolve)
      return chain
    })

    await leggTilReaksjon('melding-001', '👍')

    expect(deleteKalt).toBe(true)
    // Delete MÅ skje før insert — ellers ryker realtime-event-sekvensen.
    expect(kallSekvens).toEqual(['delete', 'insert'])
    expect(deleteEqKall).toHaveLength(2)
    expect(deleteEqKall).toEqual(
      expect.arrayContaining([
        { col: 'melding_id', val: 'melding-001' },
        { col: 'profil_id', val: 'bruker-789' },
      ])
    )
    expect(deleteEqKall.some((k) => k.col === 'emoji')).toBe(false)

    expect(insertSpy).toHaveBeenCalledWith({
      melding_id: 'melding-001',
      profil_id: 'bruker-789',
      emoji: '👍',
    })
  })

  it('kaster ved DB-feil på delete', async () => {
    mockFrom.mockImplementation(() => {
      const chain = lagChain(null)
      chain.delete = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.then = (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: null, error: { message: 'Delete-feil reaksjon' } }).then(resolve)
      return chain
    })

    await expect(leggTilReaksjon('melding-001', '👍')).rejects.toThrow('Delete-feil reaksjon')
  })

  it('kaster ved DB-feil på insert', async () => {
    mockFrom.mockImplementation(() => {
      const chain = lagChain(null)
      chain.delete = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.insert = vi.fn().mockResolvedValue({ data: null, error: { message: 'Insert-feil reaksjon' } })
      chain.then = (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: null, error: null }).then(resolve)
      return chain
    })

    await expect(leggTilReaksjon('melding-001', '👍')).rejects.toThrow('Insert-feil reaksjon')
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
