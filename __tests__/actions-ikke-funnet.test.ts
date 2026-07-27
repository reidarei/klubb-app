/**
 * Regresjonstester for «ikke funnet»-grenene i lib/actions/ — pulje A av
 * opprydningen i svelgede Supabase-feil.
 *
 * BAKGRUNNEN, kort: `.single()` setter Accept: application/vnd.pgrst.object+json,
 * og PostgREST rapporterer 0 rader fra den som error PGRST116 — ikke som
 * data=null. Legger man en `if (feil) throw`-vakt foran et `.single()`-kall,
 * spiser vakten «ikke funnet»-tilfellet, og `if (!x) throw 'Ikke funnet'`
 * under blir død kode. Brukeren får da PostgRESTs engelske interntekst
 * («JSON object requested, multiple (or no) rows returned») der vi mente å
 * gi en presis norsk melding.
 *
 * Riktig form er `.maybeSingle()` + behold `if (!x)`-grenen. Disse testene
 * låser den formen fast: bytter noen tilbake til `.single()`, blir de røde,
 * fordi __tests__/helpers/supabase-mock.ts er tro mot PGRST116-oppførselen.
 *
 * Skrevet som del av review-runden på #503 — dette er nøyaktig bug-klassen
 * pulje B og C kommer til å kopiere hvis den ikke står låst i en test.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lagChain } from './helpers/supabase-mock'

const { mockFrom, mockSupabase, mockRevalidatePath } = vi.hoisted(() => {
  const mockFrom = vi.fn<(tabell: string) => unknown>()
  const mockSupabase = { from: mockFrom, rpc: vi.fn().mockResolvedValue({ data: null, error: null }) }
  const mockRevalidatePath = vi.fn()
  return { mockFrom, mockSupabase, mockRevalidatePath }
})

vi.mock('@/lib/auth', () => ({
  ensureAdmin: vi.fn().mockResolvedValue({
    supabase: mockSupabase,
    user: { id: 'admin-1' },
    profil: { rolle: 'admin' },
  }),
  ensureInnlogget: vi.fn().mockResolvedValue({ supabase: mockSupabase, user: { id: 'admin-1' } }),
  ensureLoeserTiebreak: vi.fn().mockResolvedValue({
    supabase: mockSupabase,
    user: { id: 'gs-1' },
    profil: { rolle: 'generalsekretaer' },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => mockSupabase }))
vi.mock('@/lib/supabase/server', () => ({ createServerClient: vi.fn().mockResolvedValue(mockSupabase) }))
vi.mock('@/lib/auth-cache', () => ({ getProfil: vi.fn().mockResolvedValue({ rolle: 'admin' }) }))
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => mockRevalidatePath(...a) }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((..._a: unknown[]): never => { throw new Error('NEXT_REDIRECT') }),
}))
vi.mock('@/lib/varsler', () => ({
  sendVarsel: vi.fn().mockResolvedValue(undefined),
  sendNyttArrangementVarsler: vi.fn().mockResolvedValue(undefined),
  sendOppdatertVarsler: vi.fn().mockResolvedValue(undefined),
  sendPurringVarsler: vi.fn().mockResolvedValue(undefined),
  sendKaaringspollOpprettetVarsel: vi.fn().mockResolvedValue(undefined),
  sendKaaringspollVinnerVarsel: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/varsler-kaaringspoll', () => ({
  behandleKaaringspollAvsluttResultat: vi.fn().mockResolvedValue(undefined),
  stempleVinnerVarslet: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/logg', () => ({ logg: { warn: vi.fn(), feil: vi.fn() } }))
vi.mock('@/lib/r2', () => ({ r2StiFraUrl: vi.fn(), slettR2: vi.fn() }))

import { oppdaterVedtekt } from '@/lib/actions/vedtekter'
import { varslOmArrangement, purreUtenSvar } from '@/lib/actions/arrangementer'
import { velgTiebreakVinner } from '@/lib/actions/kaaringspoll'

beforeEach(() => {
  vi.clearAllMocks()
})

// Alle tabeller tomme (0 rader) med mindre noe annet er oppgitt.
function tomDb(data: Record<string, unknown> = {}) {
  mockFrom.mockImplementation((tabell: string) => lagChain(tabell in data ? data[tabell] : null))
}

describe('oppdaterVedtekt', () => {
  const input = { slug: 'vedtekter', nyttInnhold: 'nytt', vedtaksdato: '2026-01-01', endringsnotat: 'endra' }

  it('gir den norske «Vedtekt ikke funnet» når slug-en ikke finnes — ikke PostgREST-tekst', async () => {
    tomDb()
    await expect(oppdaterVedtekt(input)).rejects.toThrow('Vedtekt ikke funnet')
  })

  it('gir feilmeldingen fra DB når oppslaget faktisk feiler', async () => {
    mockFrom.mockImplementation((tabell: string) =>
      tabell === 'vedtekter' ? lagChain(null, { message: 'DB nede' }) : lagChain(null),
    )
    await expect(oppdaterVedtekt(input)).rejects.toThrow('Kunne ikke hente gjeldende vedtekt: DB nede')
  })
})

describe('varslOmArrangement / purreUtenSvar', () => {
  it('varslOmArrangement gir «Arrangement ikke funnet» for ukjent id', async () => {
    tomDb()
    await expect(varslOmArrangement('arr-finnes-ikke')).rejects.toThrow('Arrangement ikke funnet')
  })

  it('purreUtenSvar gir «Arrangement ikke funnet» for ukjent id', async () => {
    tomDb()
    await expect(purreUtenSvar('arr-finnes-ikke')).rejects.toThrow('Arrangement ikke funnet')
  })

  it('skiller ekte DB-feil fra «ikke funnet»', async () => {
    mockFrom.mockImplementation((tabell: string) =>
      tabell === 'arrangementer' ? lagChain(null, { message: 'DB nede' }) : lagChain(null),
    )
    await expect(varslOmArrangement('arr-1')).rejects.toThrow('Kunne ikke hente arrangementet: DB nede')
  })
})

describe('velgTiebreakVinner', () => {
  const pollRad = {
    id: 'poll-1',
    spoersmaal: 'Årets gutt?',
    kaaring_mal_id: 'mal-1',
    aar: 2026,
    tiebreak_status: 'venter_paa_tiebreak',
  }

  it('gir «Pollen finnes ikke» for ukjent pollId', async () => {
    tomDb()
    await expect(velgTiebreakVinner('poll-borte', 'valg-1')).rejects.toThrow('Pollen finnes ikke')
  })

  it('gir «Ugyldig valg» når valgId ikke hører til pollen', async () => {
    // Pollen finnes, men poll_valg-oppslaget (filtrert på poll_id) treffer 0 rader.
    // Dette er den normale angrepsvektoren — brukeren skal se «Ugyldig valg».
    tomDb({ poll: pollRad })
    await expect(velgTiebreakVinner('poll-1', 'valg-fra-annen-poll')).rejects.toThrow('Ugyldig valg')
  })

  it('skiller ekte DB-feil på valg-oppslaget fra «Ugyldig valg»', async () => {
    mockFrom.mockImplementation((tabell: string) => {
      if (tabell === 'poll') return lagChain(pollRad)
      if (tabell === 'poll_valg') return lagChain(null, { message: 'DB nede' })
      return lagChain(null)
    })
    await expect(velgTiebreakVinner('poll-1', 'valg-1')).rejects.toThrow('Kunne ikke hente valget: DB nede')
  })
})
