/**
 * Regresjonstester for sider ryddet i pulje B av svelget-feil-opprydningen
 * (app/(app)/, se CLAUDE.md § Policy: Databasespørringer).
 *
 * To ting pinnes:
 *  1. `.single()` → `.maybeSingle()`-bytte på detaljsider: en rad som faktisk
 *     ikke finnes skal fortsatt gi `notFound()` — ikke en kastet feil, og en
 *     ekte spørringsfeil skal IKKE maskeres som notFound() (det var nettopp
 *     bugen `.single()` introduserte, se __tests__/actions-ikke-funnet.test.ts).
 *  2. Lister som lovlig kan være tomme (samtaler) skal rendre en tom-tilstand
 *     uten å kaste når `error` er null — det er kun `error` som skal kaste.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lagChain } from './helpers/supabase-mock'

const { mockFrom, mockSupabase } = vi.hoisted(() => {
  const mockFrom = vi.fn<(tabell: string) => unknown>()
  const mockSupabase = { from: mockFrom, rpc: vi.fn().mockResolvedValue({ data: null, error: null }) }
  return { mockFrom, mockSupabase }
})

vi.mock('@/lib/supabase/server', () => ({ createServerClient: vi.fn().mockResolvedValue(mockSupabase) }))
vi.mock('@/lib/auth-cache', () => ({
  getProfil: vi.fn().mockResolvedValue({ rolle: 'medlem' }),
  getInnloggetBruker: vi.fn().mockResolvedValue({ id: 'bruker-1' }),
}))
vi.mock('next/navigation', () => ({
  notFound: vi.fn((): never => { throw new Error('NEXT_NOT_FOUND') }),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('klubbinfo/vedtekter/[slug] — vedtekt-oppslag', () => {
  it('gir notFound() når slug-en faktisk ikke finnes (0 rader, ingen feil)', async () => {
    mockFrom.mockImplementation(() => lagChain(null))
    const { default: VedtektSide } = await import('@/app/(app)/klubbinfo/vedtekter/[slug]/page')
    await expect(
      VedtektSide({ params: Promise.resolve({ slug: 'finnes-ikke' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('kaster (ikke notFound) når vedtekt-oppslaget faktisk feiler', async () => {
    mockFrom.mockImplementation((tabell: string) =>
      tabell === 'vedtekter' ? lagChain(null, { message: 'DB nede' }) : lagChain(null),
    )
    const { default: VedtektSide } = await import('@/app/(app)/klubbinfo/vedtekter/[slug]/page')
    await expect(
      VedtektSide({ params: Promise.resolve({ slug: 'vedtekter' }) }),
    ).rejects.toThrow('Kunne ikke hente vedtekt: DB nede')
  })

  it('kaster når versjonshistorikk-oppslaget feiler, selv om vedtekten ble funnet', async () => {
    mockFrom.mockImplementation((tabell: string) => {
      if (tabell === 'vedtekter') return lagChain({ id: 'v-1', slug: 'vedtekter', tittel: 'T', innhold: 'I', oppdatert: null })
      if (tabell === 'vedtekter_versjoner') return lagChain(null, { message: 'DB nede' })
      return lagChain(null)
    })
    const { default: VedtektSide } = await import('@/app/(app)/klubbinfo/vedtekter/[slug]/page')
    await expect(
      VedtektSide({ params: Promise.resolve({ slug: 'vedtekter' }) }),
    ).rejects.toThrow('Kunne ikke hente versjonshistorikk: DB nede')
  })
})

describe('varsler/[id] — enkeltvarsel', () => {
  it('gir notFound() når varselet ikke finnes for denne brukeren (0 rader, ingen feil)', async () => {
    mockFrom.mockImplementation(() => lagChain(null))
    const { default: VarselSide } = await import('@/app/(app)/varsler/[id]/page')
    await expect(
      VarselSide({ params: Promise.resolve({ id: 'varsel-borte' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('kaster (ikke notFound) når varsel-oppslaget faktisk feiler', async () => {
    mockFrom.mockImplementation(() => lagChain(null, { message: 'DB nede' }))
    const { default: VarselSide } = await import('@/app/(app)/varsler/[id]/page')
    await expect(
      VarselSide({ params: Promise.resolve({ id: 'varsel-1' }) }),
    ).rejects.toThrow('Kunne ikke hente varsel: DB nede')
  })
})

describe('samtaler — inbox-liste', () => {
  it('tom liste (0 rader, ingen feil) kaster ikke — viser tom-tilstand', async () => {
    mockFrom.mockImplementation(() => lagChain([]))
    const { default: SamtalerInbox } = await import('@/app/(app)/samtaler/page')
    await expect(SamtalerInbox()).resolves.toBeDefined()
  })

  it('kaster når samtaler-spørringen faktisk feiler', async () => {
    mockFrom.mockImplementation(() => lagChain(null, { message: 'DB nede' }))
    const { default: SamtalerInbox } = await import('@/app/(app)/samtaler/page')
    await expect(SamtalerInbox()).rejects.toThrow('Kunne ikke hente samtaler: DB nede')
  })
})
