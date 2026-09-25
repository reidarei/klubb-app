/**
 * Struping og coalescing i sokSted() (#757-review): samtidige søk med samme
 * nøkkel deler ett Nominatim-kall, og utgående kall holdes minst
 * NOMINATIM_MIN_AVSTAND_MS fra hverandre per instans.
 *
 * Modulen lastes på nytt per test (vi.resetModules), slik at cachen, in-flight-
 * kartet og strupe-klokka starter blanke. Fake timers styrer både setTimeout
 * og Date.now().
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NOMINATIM_MIN_AVSTAND_MS } from '@/lib/konstanter'

const { mockSokSteder } = vi.hoisted(() => ({ mockSokSteder: vi.fn() }))

vi.mock('@/lib/auth', () => ({
  ensureInnlogget: vi.fn().mockResolvedValue({ supabase: {}, user: { id: 'bruker-1' } }),
}))

vi.mock('@/lib/geokoding', () => ({
  sokSteder: (...args: unknown[]) => mockSokSteder(...args),
}))

vi.mock('@/lib/logg', () => ({
  logg: { warn: vi.fn(), feil: vi.fn().mockResolvedValue(undefined) },
}))

type SokSted = typeof import('@/lib/actions/sted-sok').sokSted
let sokSted: SokSted

const TREFF = {
  utfall: 'treff' as const,
  treff: [{ id: '1', navn: 'Lorry', beskrivelse: 'Lorry, Oslo', lat: 59.9, lng: 10.7 }],
}

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-25T10:00:00Z'))
  vi.resetModules()
  mockSokSteder.mockReset()
  ;({ sokSted } = await import('@/lib/actions/sted-sok'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('sokSted() — coalescing', () => {
  it('samtidige søk med samme nøkkel deler ETT utgående kall', async () => {
    let svar!: (v: unknown) => void
    mockSokSteder.mockImplementationOnce(() => new Promise(r => (svar = r)))

    const a = sokSted('lorry', null)
    const b = sokSted('Lorry ', null) // samme nøkkel etter trim + små bokstaver
    await vi.advanceTimersByTimeAsync(0)
    expect(mockSokSteder).toHaveBeenCalledTimes(1)

    svar(TREFF)
    await expect(a).resolves.toEqual(TREFF)
    await expect(b).resolves.toEqual(TREFF)
    expect(mockSokSteder).toHaveBeenCalledTimes(1)
  })

  it('en feil deles av de samtidige, men henger ikke igjen — neste søk prøver på nytt', async () => {
    mockSokSteder.mockResolvedValueOnce({ utfall: 'feil' })
    const a = sokSted('nede', null)
    const b = sokSted('nede', null)
    await vi.advanceTimersByTimeAsync(0)
    await expect(a).resolves.toEqual({ utfall: 'feil' })
    await expect(b).resolves.toEqual({ utfall: 'feil' })
    expect(mockSokSteder).toHaveBeenCalledTimes(1)

    mockSokSteder.mockResolvedValueOnce(TREFF)
    const c = sokSted('nede', null)
    await vi.advanceTimersByTimeAsync(NOMINATIM_MIN_AVSTAND_MS)
    await expect(c).resolves.toEqual(TREFF)
    expect(mockSokSteder).toHaveBeenCalledTimes(2)
  })
})

describe('sokSted() — minste avstand mellom utgående kall', () => {
  it('konstanten er ett sekund (Nominatims 1 req/s)', () => {
    expect(NOMINATIM_MIN_AVSTAND_MS).toBe(1000)
  })

  it('tre ulike søk i samme øyeblikk går ut med ett sekunds mellomrom — ventes, avvises ikke', async () => {
    mockSokSteder.mockResolvedValue(TREFF)
    const kall = [sokSted('sted-a', null), sokSted('sted-b', null), sokSted('sted-c', null)]

    await vi.advanceTimersByTimeAsync(0)
    expect(mockSokSteder).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(NOMINATIM_MIN_AVSTAND_MS - 1)
    expect(mockSokSteder).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(mockSokSteder).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(NOMINATIM_MIN_AVSTAND_MS)
    expect(mockSokSteder).toHaveBeenCalledTimes(3)

    // Ingen av dem ble avvist — alle fikk svaret.
    for (const svar of await Promise.all(kall)) expect(svar).toEqual(TREFF)
  })

  it('et søk lenge etter forrige venter ikke', async () => {
    mockSokSteder.mockResolvedValue(TREFF)
    const forste = sokSted('sted-d', null)
    await vi.advanceTimersByTimeAsync(0)
    await forste

    await vi.advanceTimersByTimeAsync(NOMINATIM_MIN_AVSTAND_MS + 500)
    const andre = sokSted('sted-e', null)
    await vi.advanceTimersByTimeAsync(0)
    expect(mockSokSteder).toHaveBeenCalledTimes(2)
    await andre
  })

  it('cache-treff bruker ikke av luken — kun utgående kall strupes', async () => {
    mockSokSteder.mockResolvedValue(TREFF)
    const forste = sokSted('sted-f', null)
    await vi.advanceTimersByTimeAsync(0)
    await forste

    // Samme søk rett etterpå: svaret kommer fra cachen uten å vente.
    const cachet = sokSted('sted-f', null)
    await vi.advanceTimersByTimeAsync(0)
    await expect(cachet).resolves.toEqual(TREFF)
    expect(mockSokSteder).toHaveBeenCalledTimes(1)
  })
})
