/**
 * Pinner avsendernavnet i varselet for nytt innlegg (lib/actions/meldinger.ts).
 *
 * Bugen: oppslaget var skrevet `const avsender = await supabase…single()` —
 * uten destrukturering, så `error` ble aldri lest. PostgREST rapporterer 0
 * rader fra `.single()` som error PGRST116 med `data = null`, og en feilende
 * spørring gir det samme. Begge falt derfor stille tilbake på «Noen skrev» i
 * push og e-post. Formen slapp også unna ESLint-regelen
 * `hk/supabase-feil-maa-hentes`, som bare ser destrukturerte deklarasjoner.
 *
 * Tre ting pinnes:
 *  1. Navnet brukes når profilraden finnes (visningsnavn foran navn).
 *  2. Fallbacken «Noen» slår kun inn når raden reelt mangler — og da uten
 *     å logge en feil (0 rader er ikke en feil; det krever `.maybeSingle()`).
 *  3. En ekte spørringsfeil logges, men velter ikke innlegget som allerede
 *     er lagret.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lagChain } from './helpers/supabase-mock'

const { mockFrom, mockSupabase, sendVarsel, loggFeil } = vi.hoisted(() => {
  const mockFrom = vi.fn<(tabell: string) => unknown>()
  return {
    mockFrom,
    mockSupabase: { from: mockFrom },
    sendVarsel: vi.fn().mockResolvedValue(undefined),
    loggFeil: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock('@/lib/auth', () => ({
  ensureInnlogget: vi.fn().mockResolvedValue({ supabase: mockSupabase, user: { id: 'bruker-1' } }),
}))
vi.mock('@/lib/varsler', () => ({ sendVarsel }))
vi.mock('@/lib/logg', () => ({ logg: { feil: loggFeil, warn: vi.fn() } }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((): never => {
    throw new Error('NEXT_REDIRECT')
  }),
}))

// Setter opp from()-mocken: meldinger-inserten lykkes alltid, profiles styres
// per test (rad, ingen rad, eller feil).
function riggProfiler(profilData: unknown, profilFeil: unknown = null) {
  mockFrom.mockImplementation((tabell: string) => {
    if (tabell === 'meldinger') return lagChain({ id: 'melding-1' })
    if (tabell === 'profiles') return lagChain(profilData, profilFeil)
    return lagChain([])
  })
}

// Modulnivå-import, ikke `await import()` inne i testkroppen: vi.mock hoistes
// over imports, så mockene er på plass uansett — men en dynamisk import i
// testen betaler transform-kostnaden for hele avhengighetstreet under testens
// 5s-timeout, og tipper over ca. hver femte fulle kjøring. Samme fiks som
// 9447de1 gjorde for pages-svelget-error-b.test.tsx; denne fila hadde samme
// mønster igjen og ble observert rød 1 av 5 kjøringer.
const { opprettMelding } = await import('@/lib/actions/meldinger')

// opprettMelding avsluttes med redirect('/'), som kaster i Next. Vi svelger
// akkurat den — alt vi vil verifisere har allerede skjedd.
async function opprett(innhold = 'Gutta, det blir tur') {
  await expect(opprettMelding({ innhold })).rejects.toThrow('NEXT_REDIRECT')
}

function varselTittel() {
  expect(sendVarsel).toHaveBeenCalledTimes(1)
  return (sendVarsel.mock.calls[0][0] as { tittel: string }).tittel
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('opprettMelding — avsendernavn i varselet', () => {
  it('bruker visningsnavn når profilraden finnes', async () => {
    riggProfiler({ navn: 'Ola Nordmann', visningsnavn: 'Ola' })
    await opprett()
    expect(varselTittel()).toBe('Ola skrev')
    expect(loggFeil).not.toHaveBeenCalled()
  })

  it('faller tilbake på navn når visningsnavn mangler', async () => {
    riggProfiler({ navn: 'Ola Nordmann', visningsnavn: null })
    await opprett()
    expect(varselTittel()).toBe('Ola Nordmann skrev')
  })

  it('bruker «Noen» kun når profilraden reelt mangler — og logger ikke', async () => {
    // 0 rader er en normal (om enn sjelden) tilstand, ikke en feil. Med
    // .single() ville mocken gitt PGRST116 her; skriver noen om til .single()
    // med feil-vakt, slår loggFeil ut og denne testen faller.
    riggProfiler(null)
    await opprett()
    expect(varselTittel()).toBe('Noen skrev')
    expect(loggFeil).not.toHaveBeenCalled()
  })

  it('logger når selve oppslaget feiler, men sender fortsatt varselet', async () => {
    riggProfiler(null, { code: '57P01', message: 'DB nede' })
    await opprett()
    // Innlegget er allerede lagret — et navneoppslag som feiler skal ikke
    // velte varselet, men det skal ikke være stille heller.
    expect(varselTittel()).toBe('Noen skrev')
    expect(loggFeil).toHaveBeenCalledTimes(1)
    expect(loggFeil.mock.calls[0][0]).toBe('melding.avsendernavn.feilet')
    expect(loggFeil.mock.calls[0][1]).toMatchObject({ message: 'DB nede' })
  })
})
