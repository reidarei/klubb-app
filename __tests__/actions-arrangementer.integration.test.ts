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

const {
  mockFrom,
  mockSupabase,
  mockSendNyttArrangementVarsler,
  mockRevalidatePath,
  mockRedirect,
  mockR2StiFraUrl,
  mockSlettR2,
} = vi.hoisted(() => {
  const mockFrom = vi.fn()
  const mockSupabase = { from: mockFrom }
  const mockSendNyttArrangementVarsler = vi.fn().mockResolvedValue(undefined)
  const mockRevalidatePath = vi.fn()
  // redirect() kaster alltid — slik fungerer Next.js redirect i server actions,
  // og vi repliserer det i stub-en for å stoppe kjøringen på riktig sted.
  // (Ekte redirect() setter i tillegg .digest = 'NEXT_REDIRECT;...' på Error-en
  // for at Next.js runtime skal gjenkjenne den, men det trenger vi ikke her.)
  const mockRedirect = vi.fn(() => { throw new Error('NEXT_REDIRECT') })
  // r2-spyene er her (ikke inline i vi.mock-fabrikken) slik at tester kan lese
  // mock.calls og overstyre returnverdier pr. test. Hoisted garanterer at de er
  // initialisert når vi.mock-fabrikken kjøres (som skjer før import-setningene).
  const mockR2StiFraUrl = vi.fn().mockReturnValue(null)
  const mockSlettR2 = vi.fn().mockResolvedValue(undefined)
  return {
    mockFrom,
    mockSupabase,
    mockSendNyttArrangementVarsler,
    mockRevalidatePath,
    mockRedirect,
    mockR2StiFraUrl,
    mockSlettR2,
  }
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

// createServerClient() brukes av slettArrangement og oppdaterArrangement
// (de kaller ikke ensureInnlogget)
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

// r2-mock bruker hoistede spyer slik at tester kan overstyre returnverdi
// pr. test (mockReturnValue) og inspisere kall i etterkant (mock.calls).
vi.mock('@/lib/r2', () => ({
  r2StiFraUrl: (...args: unknown[]) => mockR2StiFraUrl(...args),
  slettR2: (...args: unknown[]) => mockSlettR2(...args),
}))

// auth-cache brukes av varslOmArrangement/purreUtenSvar
vi.mock('@/lib/auth-cache', () => ({
  getProfil: vi.fn().mockResolvedValue({ rolle: 'admin' }),
}))

import {
  opprettArrangement,
  slettArrangement,
  oppdaterArrangement,
} from '@/lib/actions/arrangementer'

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

// Felles setup for slettArrangement-tester. Skiller mellom de to
// arrangementer-kallene (select for bilde_url, deretter delete) via en
// intern teller slik at vi kan returnere ulike chains og inspisere dem
// uavhengig. Returnerer chains for videre spy-inspeksjon.
function setupSlettOk(bildeUrl: string | null = null) {
  const arrSelectChain = lagChain(null)
  arrSelectChain.maybeSingle = vi.fn().mockResolvedValue({
    data: bildeUrl !== null ? { bilde_url: bildeUrl } : null,
    error: null,
  })

  const arrDeleteChain = lagChain(null) // delete().eq() awaites via then()
  const ansvarChain = lagChain(null)

  let arrangementerKallTeller = 0
  mockFrom.mockImplementation((tabell: string) => {
    if (tabell === 'arrangementer') {
      // Første kall = select bilde_url, andre kall = delete
      return ++arrangementerKallTeller === 1 ? arrSelectChain : arrDeleteChain
    }
    if (tabell === 'arrangoransvar') return ansvarChain
    return lagChain(null)
  })

  return { arrSelectChain, arrDeleteChain, ansvarChain }
}

// Felles setup for oppdaterArrangement-tester — returnerer dedikerte chains
// for arrangementer og arrangoransvar slik at tester kan inspisere spyer.
function setupOppdaterOk() {
  const arrChain = lagChain(null)
  const ansvarChain = lagChain(null)

  mockFrom.mockImplementation((tabell: string) => {
    if (tabell === 'arrangementer') return arrChain
    if (tabell === 'arrangoransvar') return ansvarChain
    return lagChain(null)
  })

  return { arrChain, ansvarChain }
}

// --- Tester ---

beforeEach(() => {
  vi.clearAllMocks()
  // Reset r2StiFraUrl til null etter at vi.clearAllMocks() har ryddet kall —
  // clearAllMocks fjerner ikke implementasjoner, så en test som kaller
  // mockReturnValue('...') ville ellers lekke til neste test.
  mockR2StiFraUrl.mockReturnValue(null)
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

describe('slettArrangement', () => {
  it('losne skjer FØR delete, og revalidatePath + redirect kalles', async () => {
    const { arrDeleteChain, ansvarChain } = setupSlettOk()

    await expect(slettArrangement('arr-abc')).rejects.toThrow('NEXT_REDIRECT')

    // invocationCallOrder er et Vitest-internt tall som øker globalt for hvert
    // mock-kall på tvers av alle spyer i testen. Lavere tall = kalt tidligere.
    // Vi bruker det for å bevise at losne() løsner FK-koblingen FØR delete()
    // fjerner raden — kontrakten er kritisk fordi en fremtidig ombygging som
    // snur rekkefølgen kan gi orphan-rader eller feilaktig on-delete-oppførsel.
    const updateOrdre = (ansvarChain.update as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]
    const deleteOrdre = (arrDeleteChain.delete as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]
    expect(updateOrdre).toBeLessThan(deleteOrdre)

    expect(mockRevalidatePath).toHaveBeenCalledWith('/')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/arrangoransvar')
    expect(mockRedirect).toHaveBeenCalledWith('/')
  })

  it('losne-mønster: arrangoransvar.update mottar {arrangement_id: null} og .eq filtrerer på arrangement_id', async () => {
    const { arrSelectChain, ansvarChain } = setupSlettOk()

    await expect(slettArrangement('arr-abc')).rejects.toThrow('NEXT_REDIRECT')

    // Bilde-oppslaget må hente bilde_url og filtrere på riktig id — låser
    // kontrakten om at slett ikke slår opp for mye (f.eks. select('*'))
    const selectSpy = arrSelectChain.select as ReturnType<typeof vi.fn>
    expect(selectSpy).toHaveBeenCalledWith('bilde_url')
    const arrEqSpy = arrSelectChain.eq as ReturnType<typeof vi.fn>
    expect(arrEqSpy).toHaveBeenCalledWith('id', 'arr-abc')

    // Verifiser at losne() nullstilte riktig kolonne med riktig filter
    const updateSpy = ansvarChain.update as ReturnType<typeof vi.fn>
    expect(updateSpy).toHaveBeenCalledWith({ arrangement_id: null })

    const eqSpy = ansvarChain.eq as ReturnType<typeof vi.fn>
    expect(eqSpy).toHaveBeenCalledWith('arrangement_id', 'arr-abc')

    // Ingen R2-sti oppgitt → fire-and-forget-branchen skal ikke fyres.
    // clearAllMocks + beforeEach garanterer utgangspunktet, men eksplisitt
    // assertion låser kontrakten mot en fremtidig ombygging som "prøver alltid".
    expect(mockSlettR2).not.toHaveBeenCalled()
  })

  it('kaller slettR2 med riktig sti når bilde_url peker til R2', async () => {
    // Simuler at r2StiFraUrl gjenkjenner URL-en som en gyldig R2-sti
    mockR2StiFraUrl.mockReturnValue('arrangementer/xyz.jpg')
    setupSlettOk('https://cdn.example.com/arrangementer/xyz.jpg')

    await expect(slettArrangement('arr-abc')).rejects.toThrow('NEXT_REDIRECT')

    expect(mockR2StiFraUrl).toHaveBeenCalledWith('https://cdn.example.com/arrangementer/xyz.jpg')
    expect(mockSlettR2).toHaveBeenCalledWith('arrangementer/xyz.jpg')
    // R2-opprydning er fire-and-forget (catch(() => {})) — redirect skal likevel ha fullført
    expect(mockRedirect).toHaveBeenCalledWith('/')
  })

  it('kaster Error ved delete-feil og kaller ikke redirect', async () => {
    const arrSelectChain = lagChain(null)
    arrSelectChain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })

    // Override then på delete-chain slik at await-en returnerer error
    const arrDeleteChain = lagChain(null)
    arrDeleteChain.then = (resolve: (v: unknown) => void) =>
      Promise.resolve({ data: null, error: { message: 'DB-feil' } }).then(resolve)

    const ansvarChain = lagChain(null)
    let arrangementerKallTeller = 0
    mockFrom.mockImplementation((tabell: string) => {
      if (tabell === 'arrangementer') {
        return ++arrangementerKallTeller === 1 ? arrSelectChain : arrDeleteChain
      }
      if (tabell === 'arrangoransvar') return ansvarChain
      return lagChain(null)
    })

    await expect(slettArrangement('arr-abc')).rejects.toThrow('DB-feil')
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})

describe('oppdaterArrangement', () => {
  it('update uten mal-endring: sender tittel + oppdatert, IKKE mal_navn eller aar, rører ikke arrangoransvar', async () => {
    const { arrChain, ansvarChain } = setupOppdaterOk()

    await oppdaterArrangement('arr-abc', { tittel: 'Ny tittel' })

    const updateSpy = arrChain.update as ReturnType<typeof vi.fn>
    const payload = updateSpy.mock.calls[0][0] as Record<string, unknown>
    expect(payload).toHaveProperty('tittel', 'Ny tittel')
    expect(payload).toHaveProperty('oppdatert') // naa() setter tidsstempel
    // Destruktureringen i oppdaterArrangement stripper mal_navn/aar fra arrFelter
    expect(payload).not.toHaveProperty('mal_navn')
    expect(payload).not.toHaveProperty('aar')

    // mal_navn er udefinert → ingen mal-synk → arrangoransvar skal ikke røres
    const ansvarUpdateSpy = ansvarChain.update as ReturnType<typeof vi.fn>
    expect(ansvarUpdateSpy).not.toHaveBeenCalled()

    // Cache-invalidering for alle tre stiene som viser arrangement-data.
    // Lås alle tre — glemmer man én, blir stale data servert til brukeren.
    expect(mockRevalidatePath).toHaveBeenCalledWith('/arrangementer/arr-abc')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/arrangoransvar')
  })

  it('update med mal-bytte: mal_navn/aar strippes fra arrangement-payload, losne + koble kalles', async () => {
    const { arrChain, ansvarChain } = setupOppdaterOk()

    await oppdaterArrangement('arr-abc', { tittel: 'X', mal_navn: 'Sommerfest', aar: 2026 })

    // mal_navn og aar skal ikke lekke inn i arrangementer-tabellen
    const arrUpdateSpy = arrChain.update as ReturnType<typeof vi.fn>
    const arrPayload = arrUpdateSpy.mock.calls[0][0] as Record<string, unknown>
    // tittel skal fortsatt være der — dokumenterer at destructuren KUN plukker
    // ut mal_navn/aar og lar resten passere gjennom ...arrFelter
    expect(arrPayload).toHaveProperty('tittel', 'X')
    expect(arrPayload).not.toHaveProperty('mal_navn')
    expect(arrPayload).not.toHaveProperty('aar')

    // losne() + koble() → to kall på arrangoransvar.update (én chain, to kall)
    const ansvarUpdateSpy = ansvarChain.update as ReturnType<typeof vi.fn>
    expect(ansvarUpdateSpy).toHaveBeenCalledTimes(2)
    // losne: nullstiller FK-koblingen for dette arrangementet
    expect(ansvarUpdateSpy).toHaveBeenNthCalledWith(1, { arrangement_id: null })
    // koble: setter FK til dette arrangementet
    expect(ansvarUpdateSpy).toHaveBeenNthCalledWith(2, { arrangement_id: 'arr-abc' })

    // eq-kall verifiserer at riktige rader ble målrettet i begge operasjoner
    const eqSpy = ansvarChain.eq as ReturnType<typeof vi.fn>
    expect(eqSpy).toHaveBeenCalledWith('arrangement_id', 'arr-abc') // losne
    expect(eqSpy).toHaveBeenCalledWith('aar', 2026)                  // koble
    expect(eqSpy).toHaveBeenCalledWith('arrangement_navn', 'Sommerfest') // koble
  })

  // Både "Annet" og null skal treffe koble()-early-return, men via ulike
  // branch-conditions (`malNavn === 'Annet'` vs `!malNavn`). Vi parametriserer
  // slik at en regresjon som brekker den ene — men ikke den andre — fanges.
  it.each([
    { label: '"Annet"', mal_navn: 'Annet' as string | null },
    { label: 'null', mal_navn: null as string | null },
  ])('update med mal_navn=$label: arrangoransvar.update kalles nøyaktig én gang (kun losne, ikke koble)', async ({ mal_navn }) => {
    const { ansvarChain } = setupOppdaterOk()

    await oppdaterArrangement('arr-abc', { tittel: 'X', mal_navn, aar: 2026 })

    const ansvarUpdateSpy = ansvarChain.update as ReturnType<typeof vi.fn>
    // koble() returnerer tidlig for "Annet" og null — kun losne() kjøres
    expect(ansvarUpdateSpy).toHaveBeenCalledTimes(1)
    expect(ansvarUpdateSpy).toHaveBeenCalledWith({ arrangement_id: null })
  })

  it('kaster Error ved update-feil og kaller ikke arrangoransvar', async () => {
    const ansvarChain = lagChain(null)
    const arrChain = lagChain(null)
    // Override then slik at update-awaiten returnerer error — mal-synk
    // skal ikke kjøre etter at feilen er kastet
    arrChain.then = (resolve: (v: unknown) => void) =>
      Promise.resolve({ data: null, error: { message: 'DB-feil' } }).then(resolve)

    mockFrom.mockImplementation((tabell: string) => {
      if (tabell === 'arrangementer') return arrChain
      if (tabell === 'arrangoransvar') return ansvarChain
      return lagChain(null)
    })

    await expect(oppdaterArrangement('arr-abc', { tittel: 'X' })).rejects.toThrow('DB-feil')

    const ansvarUpdateSpy = ansvarChain.update as ReturnType<typeof vi.fn>
    expect(ansvarUpdateSpy).not.toHaveBeenCalled()
  })
})
