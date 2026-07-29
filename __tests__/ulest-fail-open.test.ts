/**
 * Pinner den bevisste fail-open-oppførselen i lib/ulest.ts (Policy:
 * Databasespørringer): en feilet spørring skal LOGGES, men aldri kaste —
 * ulest-prikken i TopHeader kalles ved hver sidevisning, og å ta ned hele
 * appen for en prikk ville vært en helt feil avveining.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lagChain } from './helpers/supabase-mock'

const { mockWarn } = vi.hoisted(() => ({ mockWarn: vi.fn() }))
vi.mock('@/lib/logg', () => ({ logg: { warn: mockWarn, feil: vi.fn() } }))

// Modulnivå-import, ikke `await import()` i hver testkropp: vi.mock hoistes
// over imports, så mocken er på plass uansett — men dynamisk import i testen
// betaler transform-kostnaden for avhengighetstreet under 5s-timeouten og
// gjør testen tidvis rød uten at noe er galt. Jf. 9447de1.
const { harUlestChat, harUlestVarsler } = await import('@/lib/ulest')

const feilendeSpoerring = { code: '500', message: 'connection reset', details: null, hint: null }

beforeEach(() => {
  mockWarn.mockClear()
})

describe('lib/ulest.ts — fail open MED logging', () => {
  it('harUlestChat returnerer false (ikke kaster) og logger warn når spørringen feiler', async () => {
    const supabase = { from: vi.fn(() => lagChain([], feilendeSpoerring)) }

    await expect(harUlestChat(supabase as never, 'bruker-1', null)).resolves.toBe(false)
    expect(mockWarn).toHaveBeenCalledWith('ulest.chat.oppslag.feilet', expect.objectContaining({ code: feilendeSpoerring.code }))
  })

  it('harUlestVarsler returnerer false (ikke kaster) og logger warn når spørringen feiler', async () => {
    const supabase = { from: vi.fn(() => lagChain([], feilendeSpoerring)) }

    await expect(harUlestVarsler(supabase as never, 'bruker-1')).resolves.toBe(false)
    expect(mockWarn).toHaveBeenCalledWith('ulest.varsler.oppslag.feilet', expect.objectContaining({ code: feilendeSpoerring.code }))
  })

  it('harUlestChat returnerer fortsatt korrekt true/false uten logging når spørringen lykkes', async () => {
    const supabaseMedTreff = { from: vi.fn(() => lagChain([{ id: 'm1' }])) }
    const supabaseUtenTreff = { from: vi.fn(() => lagChain([])) }

    await expect(harUlestChat(supabaseMedTreff as never, 'bruker-1', null)).resolves.toBe(true)
    await expect(harUlestChat(supabaseUtenTreff as never, 'bruker-1', null)).resolves.toBe(false)
    expect(mockWarn).not.toHaveBeenCalled()
  })
})
