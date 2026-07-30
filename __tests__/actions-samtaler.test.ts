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

const { mockFrom, mockSupabase, mockRedirect, mockGetUser } = vi.hoisted(() => {
  const mockFrom = vi.fn<(tabell: string) => unknown>()
  const mockGetUser = vi.fn<() => unknown>()
  const mockSupabase = { from: mockFrom, auth: { getUser: mockGetUser } }
  // Ekte redirect() kaster NEXT_REDIRECT for å stoppe server action-en der.
  const mockRedirect = vi.fn((..._a: unknown[]): never => { throw new Error('NEXT_REDIRECT') })
  return { mockFrom, mockSupabase, mockRedirect, mockGetUser }
})

const { mockLoggFeil } = vi.hoisted(() => ({ mockLoggFeil: vi.fn().mockResolvedValue(undefined) }))

vi.mock('@/lib/auth', () => ({
  ensureInnlogget: vi.fn().mockResolvedValue({ supabase: mockSupabase, user: { id: 'aaa' } }),
}))
vi.mock('@/lib/supabase/server', () => ({ createServerClient: vi.fn().mockResolvedValue(mockSupabase) }))
// revalidatePath KASTER med samme feilform Next 15 faktisk kaster med når en
// server action kaller den under render (se markerSamtaleLest-T1 under). Det
// simulerer render-konteksten fra /samtaler/[id]s ekte kallsted — kontrakten
// er at markerSamtaleLest() er trygg å kalle der selv om revalidatePath ryker.
// aapneSamtale kaller aldri revalidatePath, så mocken forstyrrer ikke testene
// over.
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(() => {
    throw new Error('used "revalidatePath /profil" during render which is unsupported')
  }),
}))
vi.mock('next/navigation', () => ({ redirect: (...a: unknown[]) => mockRedirect(...a) }))
vi.mock('@/lib/logg', () => ({ logg: { feil: mockLoggFeil, warn: vi.fn() } }))

import { aapneSamtale, markerSamtaleLest } from '@/lib/actions/samtaler'
import { revalidatePath } from 'next/cache'

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

// Regresjonsvakt for #539: revalidatePath('/profil') ble kalt under render av
// /samtaler/[id] og Next 15 kaster på det (se next/cache-mocken over). Fjernet
// fra markerSamtaleLest — disse testene beviser at den ikke kommer tilbake.
describe('markerSamtaleLest', () => {
  it('T1 — er trygg å kalle under render: revalidatePath kalles aldri, og actionen resolver uansett', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'aaa' } } })
    mockFrom.mockImplementation(() => lagChain({}))

    await expect(markerSamtaleLest('s-1')).resolves.toBeUndefined()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('T2 — oppdaterer kun andres uleste meldinger i riktig samtale (ikke vakuøs)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'aaa' } } })
    const chain = lagChain({})
    mockFrom.mockImplementation(() => chain)

    await markerSamtaleLest('s-1')

    expect(mockFrom).toHaveBeenCalledWith('samtale_chat')
    expect(chain.update).toHaveBeenCalledWith({ lest: true })
    expect(chain.eq).toHaveBeenCalledWith('samtale_id', 's-1')
    expect(chain.neq).toHaveBeenCalledWith('profil_id', 'aaa')
    expect(chain.eq).toHaveBeenCalledWith('lest', false)
  })

  it('T3 — en feilet oppdatering svelges ikke stille: logges, men actionen resolver fortsatt', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'aaa' } } })
    mockFrom.mockImplementation(() =>
      lagChain(null, { code: '42501', message: 'permission denied for table samtale_chat' }),
    )

    await expect(markerSamtaleLest('s-1')).resolves.toBeUndefined()
    expect(mockLoggFeil).toHaveBeenCalledWith(
      'samtaler.marker_lest.oppdatering.feilet',
      expect.objectContaining({ code: '42501' }),
      expect.objectContaining({ ctx: { code: '42501' } }),
    )
  })

  it('T4 — uinnlogget er fortsatt en silent no-op (#305): ingen update, ingen logging', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    await expect(markerSamtaleLest('s-1')).resolves.toBeUndefined()
    expect(mockFrom).not.toHaveBeenCalled()
    expect(mockLoggFeil).not.toHaveBeenCalled()
  })
})
