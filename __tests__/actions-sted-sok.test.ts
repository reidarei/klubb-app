/**
 * Tester for lib/actions/sted-sok.ts: sokSted() (#757).
 *
 * Mønster: vi.hoisted() for mock-refs, deretter vi.mock()-fabrikker, deretter
 * import av SUT etter mockene (samme mønster som
 * actions-dato-forslag.integration.test.ts).
 *
 * Cachen i sted-sok.ts er en modul-lokal Map — den lever gjennom hele denne
 * testfilen. Hver test som bryr seg om cache-oppførsel bruker en UNIK
 * søketekst, slik at treff fra en tidligere test ikke lekker inn.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockEnsureInnlogget, mockSokSteder, mockLoggWarn, mockLoggFeil } = vi.hoisted(() => {
  const mockEnsureInnlogget = vi.fn().mockResolvedValue({ supabase: {}, user: { id: 'bruker-1' } })
  const mockSokSteder = vi.fn()
  const mockLoggWarn = vi.fn()
  const mockLoggFeil = vi.fn().mockResolvedValue(undefined)
  return { mockEnsureInnlogget, mockSokSteder, mockLoggWarn, mockLoggFeil }
})

vi.mock('@/lib/auth', () => ({
  ensureInnlogget: (...args: unknown[]) => mockEnsureInnlogget(...args),
}))

vi.mock('@/lib/geokoding', () => ({
  sokSteder: (...args: unknown[]) => mockSokSteder(...args),
}))

vi.mock('@/lib/logg', () => ({
  logg: {
    warn: (...args: unknown[]) => mockLoggWarn(...args),
    feil: (...args: unknown[]) => mockLoggFeil(...args),
  },
}))

// Strupingen (NOMINATIM_MIN_AVSTAND_MS) er testet for seg i
// actions-sted-sok-struping.test.ts — her er den skrudd av, ellers ville
// hvert utgående kall ventet ett ekte sekund.
vi.mock('@/lib/konstanter', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/konstanter')>()),
  NOMINATIM_MIN_AVSTAND_MS: 0,
}))

import { sokSted } from '@/lib/actions/sted-sok'

const ETT_TREFF = {
  utfall: 'treff' as const,
  treff: [{ id: '1', navn: 'Lorry', beskrivelse: 'Lorry, Oslo', lat: 59.9, lng: 10.7 }],
}

beforeEach(() => {
  mockEnsureInnlogget.mockClear()
  mockSokSteder.mockClear()
  mockLoggWarn.mockClear()
  mockLoggFeil.mockClear()
})

describe('sokSted() — validering', () => {
  it('krever innlogging', async () => {
    mockSokSteder.mockResolvedValueOnce({ utfall: 'ingen' })
    await sokSted('validering-innlogging', null)
    expect(mockEnsureInnlogget).toHaveBeenCalledTimes(1)
  })

  it('for kort søketekst gir "ugyldig" uten å kalle sokSteder', async () => {
    const svar = await sokSted('a', null)
    expect(svar.utfall).toBe('ugyldig')
    expect(mockSokSteder).not.toHaveBeenCalled()
  })

  it('kun mellomrom regnes som for kort (trimmes før lengdesjekk)', async () => {
    const svar = await sokSted('   ', null)
    expect(svar.utfall).toBe('ugyldig')
    expect(mockSokSteder).not.toHaveBeenCalled()
  })

  it('for lang søketekst (>120 tegn) gir "ugyldig" uten å kalle sokSteder', async () => {
    const svar = await sokSted('x'.repeat(121), null)
    expect(svar.utfall).toBe('ugyldig')
    expect(mockSokSteder).not.toHaveBeenCalled()
  })
})

describe('sokSted() — cache', () => {
  it('treff caches: andre kall med samme spørring treffer IKKE sokSteder på nytt', async () => {
    mockSokSteder.mockResolvedValueOnce(ETT_TREFF)
    const q = 'cache-treff-unik-1'
    const svar1 = await sokSted(q, null)
    const svar2 = await sokSted(q, null)
    expect(svar1).toEqual(ETT_TREFF)
    expect(svar2).toEqual(ETT_TREFF)
    expect(mockSokSteder).toHaveBeenCalledTimes(1)
  })

  it('"ingen" caches på samme måte som treff', async () => {
    mockSokSteder.mockResolvedValueOnce({ utfall: 'ingen' })
    const q = 'cache-ingen-unik-2'
    await sokSted(q, null)
    await sokSted(q, null)
    expect(mockSokSteder).toHaveBeenCalledTimes(1)
  })

  it('feil caches ALDRI — neste kall prøver sokSteder på nytt', async () => {
    mockSokSteder.mockResolvedValue({ utfall: 'feil' })
    const q = 'cache-feil-unik-3'
    await sokSted(q, null)
    await sokSted(q, null)
    expect(mockSokSteder).toHaveBeenCalledTimes(2)
  })

  it('tidsavbrudd caches ALDRI — neste kall prøver sokSteder på nytt', async () => {
    mockSokSteder.mockResolvedValue({ utfall: 'tidsavbrudd' })
    const q = 'cache-tidsavbrudd-unik-4'
    await sokSted(q, null)
    await sokSted(q, null)
    expect(mockSokSteder).toHaveBeenCalledTimes(2)
  })

  it('ulik nærhet gir ulik cache-nøkkel — begge kaller sokSteder', async () => {
    mockSokSteder.mockResolvedValue(ETT_TREFF)
    const q = 'cache-naerhet-unik-5'
    await sokSted(q, { lat: 59.9, lng: 10.7 })
    await sokSted(q, { lat: 10.0, lng: 20.0 })
    expect(mockSokSteder).toHaveBeenCalledTimes(2)
  })
})

describe('sokSted() — logging', () => {
  it('tidsavbrudd logges med kart.sok.tidsavbrudd (warn)', async () => {
    mockSokSteder.mockResolvedValueOnce({ utfall: 'tidsavbrudd' })
    await sokSted('logg-tidsavbrudd-unik-6', null)
    expect(mockLoggWarn).toHaveBeenCalledWith('kart.sok.tidsavbrudd')
  })

  it('feil logges med kart.sok.feilet (feil)', async () => {
    mockSokSteder.mockResolvedValueOnce({ utfall: 'feil' })
    await sokSted('logg-feil-unik-7', null)
    expect(mockLoggFeil).toHaveBeenCalledWith('kart.sok.feilet', expect.any(Error))
  })

  it('søketeksten inngår ALDRI i et loggkall', async () => {
    mockSokSteder.mockResolvedValueOnce({ utfall: 'feil' })
    const hemmelig = 'super-hemmelig-adresse-unik-8'
    await sokSted(hemmelig, null)
    const alleLoggKall = [...mockLoggWarn.mock.calls, ...mockLoggFeil.mock.calls]
    for (const kall of alleLoggKall) {
      for (const arg of kall) {
        expect(JSON.stringify(arg)).not.toContain(hemmelig)
      }
    }
  })

  // #757-review: logg.feil() er async; uten await kan Vercel fryse instansen
  // før feilraden er skrevet.
  it('feil-loggingen awaites før feilutfallet returneres', async () => {
    mockSokSteder.mockResolvedValueOnce({ utfall: 'feil' })
    let slipp: () => void = () => {}
    mockLoggFeil.mockImplementationOnce(() => new Promise<void>(r => { slipp = r }))

    let ferdig = false
    const svar = sokSted('logg-await-unik-9', null).then(s => {
      ferdig = true
      return s
    })
    await vi.waitFor(() => expect(mockLoggFeil).toHaveBeenCalledTimes(1))
    await new Promise(r => setTimeout(r, 0))
    expect(ferdig).toBe(false)

    slipp()
    expect((await svar).utfall).toBe('feil')
    expect(ferdig).toBe(true)
  })
})
