// Admin-styrt navn og emoji på de varslende kartsymbolene (/innstillinger/kart).
// Testes mot registeret, ikke literaler — samme grunn som i
// actions-kart-markering-varsel.test.ts.

import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/logg', () => ({ logg: { feil: vi.fn(), warn: vi.fn() } }))

import { MARKERING_SYMBOLER, SYMBOLER_STILLE, SYMBOLER_VARSLER } from '@/lib/markering-symboler'
import { anvendTilpasninger, emojiI, erEnEmoji } from '@/lib/kart-symbol-tilpasning'

describe('anvendTilpasninger', () => {
  it('uten tilpasninger er registeret uendret', () => {
    expect(anvendTilpasninger([])).toEqual([...MARKERING_SYMBOLER])
  })

  it.skipIf(SYMBOLER_VARSLER.length === 0)('overstyrer navn, emoji og varseltekst — ikke id eller type', () => {
    const [mål] = SYMBOLER_VARSLER
    const ut = anvendTilpasninger([{ symbol: mål.id, etikett: ' Hjort ', emoji: '🦌' }])
    const sym = ut.find(s => s.id === mål.id)!
    expect(sym.etikett).toBe('Hjort')
    expect(sym.emoji).toBe('🦌')
    expect(sym.varsel?.tittel).toBe('HJORT ALERT!')
    expect(sym.varsel?.kort).toBe('Hjort alert')
    expect(sym.varsel?.type).toBe(mål.varsel.type)
    expect(sym.varsel?.loggVarsel).toBe(mål.varsel.loggVarsel)
    expect(emojiI(ut, mål.id)).toBe('🦌')
    // Rekkefølgen er registerets.
    expect(ut.map(s => s.id)).toEqual(MARKERING_SYMBOLER.map(s => s.id))
  })

  it.skipIf(SYMBOLER_STILLE.length === 0)('ignorerer en rad for et stille symbol', () => {
    const [stille] = SYMBOLER_STILLE
    const ut = anvendTilpasninger([{ symbol: stille.id, etikett: 'Tull', emoji: '🤡' }])
    expect(ut.find(s => s.id === stille.id)).toEqual(stille)
  })
})

describe('erEnEmoji', () => {
  it.each(['💋', '😍', '🦌', '👍🏽', '🏳️‍🌈', '🇳🇴', '🍽️'])('godtar %s', e => {
    expect(erEnEmoji(e)).toBe(true)
  })
  it.each(['', 'a', 'ab', '💋💋', '1', ' ', 'Øl'])('avviser «%s»', e => {
    expect(erEnEmoji(e)).toBe(false)
  })
})
