import { describe, it, expect } from 'vitest'
import { splittPaaMentions } from '@/lib/mention'

// Låser at en tagg slutter der navnet slutter — ikke ved neste tegnsetting.
// Bug 27. sep. 2026: «@Ola Hansen og @Per Olav Berg er fortsatt
// på hotellet» ble tagget helt ut.

const NAVN = ['Ola Nordmann', 'Ola Hansen', 'Per Olav Berg', 'Ola']

function mentions(tekst: string): string[] {
  return splittPaaMentions(tekst, NAVN).filter(d => d.type === 'mention').map(d => d.verdi)
}

describe('splittPaaMentions', () => {
  it('stopper taggen etter fullt navn', () => {
    const tekst = 'Vi drar nå, @Ola Nordmann , @Ola Hansen og @Per Olav Berg er fortsatt på hotellet'
    expect(mentions(tekst)).toEqual(['@Ola Nordmann', '@Ola Hansen', '@Per Olav Berg'])
    expect(splittPaaMentions(tekst, NAVN).map(d => d.verdi).join('')).toBe(tekst)
  })

  it('er case-insensitiv', () => {
    expect(mentions('hei @ola hansen!')).toEqual(['@ola hansen'])
  })

  it('krever ordgrense etter navnet', () => {
    expect(mentions('@Olav kommer')).toEqual(['@Olav'])
  })

  it('@alle stopper ved mellomrom', () => {
    expect(mentions('Hva med @alle andre?')).toEqual(['@alle'])
  })

  it('ukjent navn tagger bare første ord', () => {
    expect(mentions('@Petter Northug er rask')).toEqual(['@Petter'])
  })

  it('e-postadresse er ikke en tagg', () => {
    expect(mentions('send til ola@vg.no')).toEqual([])
  })

  it('løs @ er vanlig tekst', () => {
    expect(splittPaaMentions('møtes @ 18', NAVN)).toEqual([{ type: 'tekst', verdi: 'møtes @ 18' }])
  })
})
