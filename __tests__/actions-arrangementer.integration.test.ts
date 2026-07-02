/**
 * Integrasjonstester for lib/actions/arrangementer.ts.
 *
 * Bruker rene stubs (ingen ekte Postgres) — fanger forretningslogikk,
 * kall-rekkefølge og payload-form. RLS-tester utsettes til vi har CI (#365).
 *
 * Mønster: mock @/lib/supabase/server + @/lib/auth + @/lib/varsler + next/cache,
 * injiser data via mockFrom, og assert på hva som ble kalt.
 *
 * NB: vi.mock()-fabrikker hoistes av Vitest til toppen av filen (før import).
 * Variabler som fabrikken trenger MÅ deklareres via vi.hoisted() — ellers
 * treffer vi temporal dead zone og får "Cannot access before initialization".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lagChain } from './helpers/supabase-mock'

// --- Hoistede mock-refs (deles mellom vi.mock-fabrikker og tester) ---

const { mockFrom, mockSupabase, mockSendNyttArrangementVarsler, mockRevalidatePath, mockRedirect } =
  vi.hoisted(() => {
    const mockFrom = vi.fn()
    const mockSupabase = { from: mockFrom }
    const mockSendNyttArrangementVarsler = vi.fn().mockResolvedValue(undefined)
    const mockRevalidatePath = vi.fn()
    // redirect() kaster alltid — slik fungerer Next.js redirect i server actions,
    // og vi repliserer det i stub-en for å stoppe kjøringen på riktig sted.
    // (Ekte redirect() setter i tillegg .digest = 'NEXT_REDIRECT;...' på Error-en
    // for at Next.js runtime skal gjenkjenne den, men det trenger vi ikke her.)
    const mockRedirect = vi.fn(() => { throw new Error('NEXT_REDIRECT') })
    return { mockFrom, mockSupabase, mockSendNyttArrangementVarsler, mockRevalidatePath, mockRedirect }
  })

// --- Modul-mocker ---

// ensureInnlogget() returnerer { supabase, user }
vi.mock('@/lib/auth', () => ({
  ensureInnlogget: vi.fn().mockResolvedValue({
    supabase: mockSupabase,
    user: { id: 'bruker-123' },
  }),
  ensureAdmin: vi.fn().mockResolvedValue({
    supabase: mockSupabase,
    user: { id: 'bruker-123' },
    profil: { rolle: 'admin' },
  }),
}))

// createServerClient() brukes av koble/losne (henter ikke ensureInnlogget)
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn().mockResolvedValue(mockSupabase),
}))

vi.mock('@/lib/varsler', () => ({
  sendNyttArrangementVarsler: (...args: unknown[]) => mockSendNyttArrangementVarsler(...args),
  sendOppdatertVarsler: vi.fn().mockResolvedValue(undefined),
  sendPurringVarsler: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args) }))
vi.mock('next/navigation', () => ({ redirect: (...args: unknown[]) => mockRedirect(...args) }))

// r2 brukes av slettArrangement — stub ut slik at tester ikke trenger
// R2-secrets konfigurert
vi.mock('@/lib/r2', () => ({
  r2StiFraUrl: vi.fn().mockReturnValue(null),
  slettR2: vi.fn().mockResolvedValue(undefined),
}))

// auth-cache brukes av varslOmArrangement/purreUtenSvar
vi.mock('@/lib/auth-cache', () => ({
  getProfil: vi.fn().mockResolvedValue({ rolle: 'admin' }),
}))

import { opprettArrangement } from '@/lib/actions/arrangementer'

// --- Helpers ---

function arrangerNyttArrangementFraDb(overstyr: Record<string, unknown> = {}) {
  // Simulerer hva Supabase returnerer etter insert().select().single()
  return {
    id: 'arr-abc',
    tittel: 'Vårfest',
    start_tidspunkt: '2026-06-15T16:00:00Z',
    type: 'moete',
    ...overstyr,
  }
}

// Sett opp mockFrom slik at insert().select().single() returnerer arrangement-data
// og alle andre kall (upsert, update) returnerer ok.
function setupInsertOk(data = arrangerNyttArrangementFraDb()) {
  mockFrom.mockImplementation((tabell: string) => {
    const chain = lagChain(null)

    if (tabell === 'arrangementer') {
      // insert().select().single() må gi data-feltet
      chain.single = vi.fn().mockResolvedValue({ data, error: null })
    }
    // upsert for paameldinger og update for arrangoransvar: thenable med ok
    chain.then = (resolve: (v: unknown) => void) =>
      Promise.resolve({ data: null, error: null }).then(resolve)

    return chain
  })
}

// --- Tester ---

beforeEach(() => {
  vi.clearAllMocks()
})

describe('opprettArrangement', () => {
  it('inserter arrangement og kaller sendNyttArrangementVarsler', async () => {
    setupInsertOk()

    // redirect() kaster stub-feil etter vellykket flyt — det er forventet
    await expect(
      opprettArrangement({
        type: 'moete',
        tittel: 'Vårfest',
        start_tidspunkt: '2026-06-15T16:00:00Z',
      })
    ).rejects.toThrow('NEXT_REDIRECT')

    // Arrangement ble insertet via from('arrangementer')
    const arrangementrFrom = mockFrom.mock.calls.find(([t]: [string]) => t === 'arrangementer')
    expect(arrangementrFrom).toBeTruthy()

    // Varslingsfunksjonen ble kalt med korrekt payload
    expect(mockSendNyttArrangementVarsler).toHaveBeenCalledWith(
      expect.objectContaining({
        arrangementId: 'arr-abc',
        tittel: 'Vårfest',
      })
    )
  })

  it('kobler til arrangoransvar når mal_navn og aar er gitt', async () => {
    setupInsertOk()

    await expect(
      opprettArrangement({
        type: 'moete',
        tittel: 'Vårfest',
        start_tidspunkt: '2026-06-15T16:00:00Z',
        mal_navn: 'Sommerfest',
        aar: 2026,
      })
    ).rejects.toThrow('NEXT_REDIRECT')

    // arrangoransvar.update() skal ha blitt kalt (koble()-funksjonen)
    const ansvarKall = mockFrom.mock.calls.filter(([t]: [string]) => t === 'arrangoransvar')
    expect(ansvarKall.length).toBeGreaterThan(0)
  })

  it('kobler IKKE til arrangoransvar når mal_navn er "Annet"', async () => {
    setupInsertOk()

    await expect(
      opprettArrangement({
        type: 'moete',
        tittel: 'Vårfest',
        start_tidspunkt: '2026-06-15T16:00:00Z',
        mal_navn: 'Annet',
        aar: 2026,
      })
    ).rejects.toThrow('NEXT_REDIRECT')

    // koble() er gated på malNavn !== 'Annet' — ingen arrangoransvar-kall forventet
    const ansvarKall = mockFrom.mock.calls.filter(([t]: [string]) => t === 'arrangoransvar')
    expect(ansvarKall.length).toBe(0)
  })

  it('auto-RSVP upsert kalles med oppretteres id og status=ja', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ data: null, error: null })

    mockFrom.mockImplementation((tabell: string) => {
      if (tabell === 'arrangementer') {
        const chain = lagChain(null)
        chain.single = vi.fn().mockResolvedValue({
          data: arrangerNyttArrangementFraDb(),
          error: null,
        })
        return chain
      }
      if (tabell === 'paameldinger') {
        const chain = lagChain(null)
        chain.upsert = upsertSpy
        chain.then = (resolve: (v: unknown) => void) =>
          Promise.resolve({ data: null, error: null }).then(resolve)
        return chain
      }
      const chain = lagChain(null)
      chain.then = (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: null, error: null }).then(resolve)
      return chain
    })

    await expect(
      opprettArrangement({
        type: 'moete',
        tittel: 'Vårfest',
        start_tidspunkt: '2026-06-15T16:00:00Z',
      })
    ).rejects.toThrow('NEXT_REDIRECT')

    // upsert skal ha mottatt korrekt payload for oppretteren
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        arrangement_id: 'arr-abc',
        profil_id: 'bruker-123',
        status: 'ja',
      }),
      expect.objectContaining({ onConflict: 'arrangement_id,profil_id' })
    )
  })

  // Auto-RSVP er bevisst best-effort: opprettelsen skal ikke rulle tilbake
  // fordi RSVP-upsert glapp (typisk transient RLS/nettverksfeil). Denne testen
  // låser den kontrakten — et fremtidig forsøk på å strømlinjeforme flyten ved
  // å kaste videre vil brekke her, ikke i prod.
  it('auto-RSVP-feil hindrer IKKE at opprettelsen fullfører (swallow)', async () => {
    // Undertrykk console.error slik at testoutput holdes rent — vi verifiserer
    // via mock i stedet at feilen faktisk ble logget.
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // try/finally sikrer at spy restores selv om en assertion kaster — ellers
    // lekker mocken til påfølgende tester og maskerer console.error der.
    try {
      mockFrom.mockImplementation((tabell: string) => {
        if (tabell === 'arrangementer') {
          const chain = lagChain(null)
          chain.single = vi.fn().mockResolvedValue({
            data: arrangerNyttArrangementFraDb(),
            error: null,
          })
          return chain
        }
        if (tabell === 'paameldinger') {
          // Simuler at auto-RSVP-upsert svarer med feil
          const chain = lagChain(null)
          chain.upsert = vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'RSVP-upsert glapp' },
          })
          return chain
        }
        const chain = lagChain(null)
        chain.then = (resolve: (v: unknown) => void) =>
          Promise.resolve({ data: null, error: null }).then(resolve)
        return chain
      })

      // Flyten skal fortsatt nå redirect() — som betyr at hele koden etter
      // auto-RSVP (varsler, revalidatePath, redirect) fikk kjøre.
      await expect(
        opprettArrangement({
          type: 'moete',
          tittel: 'Vårfest',
          start_tidspunkt: '2026-06-15T16:00:00Z',
        })
      ).rejects.toThrow('NEXT_REDIRECT')

      // Varsler ble sendt til tross for RSVP-feil
      expect(mockSendNyttArrangementVarsler).toHaveBeenCalled()
      // Redirect ble kalt (siste steg i happy path)
      expect(mockRedirect).toHaveBeenCalled()
      // Feilen ble logget — ikke svelget stumt
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('auto-RSVP'),
        expect.objectContaining({ message: 'RSVP-upsert glapp' })
      )
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('kaster ved insert-feil på arrangementer-tabellen', async () => {
    // Tabell-diskriminert mock: kun arrangementer-insert feiler; andre tabeller
    // svarer ok. Dette låser kontrakten om at insert-feil kaster — en fremtidig
    // endring som svelger arrangementer-insert vil brekke her.
    mockFrom.mockImplementation((tabell: string) => {
      if (tabell === 'arrangementer') {
        const chain = lagChain(null)
        chain.single = vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'DB-feil' },
        })
        return chain
      }
      const chain = lagChain(null)
      chain.then = (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: null, error: null }).then(resolve)
      return chain
    })

    await expect(
      opprettArrangement({
        type: 'moete',
        tittel: 'Feil-test',
        start_tidspunkt: '2026-06-15T16:00:00Z',
      })
    ).rejects.toThrow('DB-feil')
  })
})
