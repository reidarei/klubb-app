/**
 * Tester for aapneSamtale i lib/actions/samtaler.ts.
 *
 * Kjernen: select-en som leter etter en eksisterende samtale er bevisst
 * fail-open (eslint-disable i fila). Påstanden om at unique-constrainten
 * `samtale_par_unik` «fanger den tapte grenen» holder bare hvis 23505 fra
 * inserten faktisk fører brukeren INN i samtalen. Uten det fikk han
 * «duplicate key value violates unique constraint» i ansiktet for å ha
 * trykket «åpne samtale» på en samtale som finnes. (#503-review)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lagChain } from './helpers/supabase-mock'

const { mockFrom, mockSupabase, mockRedirect } = vi.hoisted(() => {
  const mockFrom = vi.fn<(tabell: string) => unknown>()
  const mockSupabase = { from: mockFrom }
  // Ekte redirect() kaster NEXT_REDIRECT for å stoppe server action-en der.
  const mockRedirect = vi.fn((..._a: unknown[]): never => { throw new Error('NEXT_REDIRECT') })
  return { mockFrom, mockSupabase, mockRedirect }
})

vi.mock('@/lib/auth', () => ({
  ensureInnlogget: vi.fn().mockResolvedValue({ supabase: mockSupabase, user: { id: 'aaa' } }),
}))
vi.mock('@/lib/supabase/server', () => ({ createServerClient: vi.fn().mockResolvedValue(mockSupabase) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: (...a: unknown[]) => mockRedirect(...a) }))

import { aapneSamtale } from '@/lib/actions/samtaler'

beforeEach(() => {
  vi.clearAllMocks()
})

// Bygger en samtale-chain der select-oppslaget og insert-en kan styres hver
// for seg. `selectSvar` brukes på maybeSingle (finn eksisterende og
// re-select etter 23505), `insertFeil` på insert().select().single().
function settOppSamtale(opts: {
  selectSvar: Array<{ data: unknown; error: unknown }>
  insertFeil?: unknown
  insertData?: unknown
}) {
  let selectNr = 0
  mockFrom.mockImplementation(() => {
    const chain = lagChain(null)
    chain.maybeSingle = vi.fn().mockImplementation(() => {
      const svar = opts.selectSvar[selectNr] ?? { data: null, error: null }
      selectNr++
      return Promise.resolve(svar)
    })
    chain.single = vi.fn().mockResolvedValue({
      data: opts.insertFeil ? null : (opts.insertData ?? { id: 's-ny' }),
      error: opts.insertFeil ?? null,
    })
    return chain
  })
}

describe('aapneSamtale', () => {
  it('redirecter til eksisterende samtale når select-en finner den', async () => {
    settOppSamtale({ selectSvar: [{ data: { id: 's-1' }, error: null }] })
    await expect(aapneSamtale('bbb')).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/samtaler/s-1')
  })

  it('oppretter og redirecter når ingen samtale finnes fra før', async () => {
    settOppSamtale({ selectSvar: [{ data: null, error: null }], insertData: { id: 's-ny' } })
    await expect(aapneSamtale('bbb')).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/samtaler/s-ny')
  })

  // Dette er den tapte grenen fail-open-kommentaren lover at vi håndterer:
  // select-en feilet (eller to klikk kom samtidig), inserten traff 23505.
  it('select feilet men raden fantes: 23505 fører brukeren INN i samtalen, ikke til en constraint-feil', async () => {
    settOppSamtale({
      selectSvar: [
        { data: null, error: { message: 'DB nede' } }, // første oppslag feilet
        { data: { id: 's-eksisterende' }, error: null }, // re-select etter 23505
      ],
      insertFeil: { code: '23505', message: 'duplicate key value violates unique constraint "samtale_par_unik"' },
    })

    await expect(aapneSamtale('bbb')).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/samtaler/s-eksisterende')
  })

  it('23505 uten at raden finnes ved re-select: da er den opprinnelige feilen fortsatt sannheten', async () => {
    settOppSamtale({
      selectSvar: [
        { data: null, error: null },
        { data: null, error: null },
      ],
      insertFeil: { code: '23505', message: 'duplicate key value violates unique constraint "noe_annet"' },
    })

    await expect(aapneSamtale('bbb')).rejects.toThrow('noe_annet')
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('andre insert-feil enn 23505 kastes uendret', async () => {
    settOppSamtale({
      selectSvar: [{ data: null, error: null }],
      insertFeil: { code: '42501', message: 'permission denied' },
    })

    await expect(aapneSamtale('bbb')).rejects.toThrow('permission denied')
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('nekter samtale med deg selv', async () => {
    settOppSamtale({ selectSvar: [] })
    await expect(aapneSamtale('aaa')).rejects.toThrow('Kan ikke åpne samtale med deg selv')
  })
})
