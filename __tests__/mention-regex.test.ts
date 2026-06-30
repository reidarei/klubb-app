import { describe, it, expect } from 'vitest'
import { mentionExtractRegex } from '@/lib/mention'

// Låser adferden til extract-regexen — bug 28. april 2026 var at
// `@alle andre` matchet som én mention `'alle andre'` istedenfor
// `'alle'`, så ingen varsler gikk ut.

function parse(tekst: string): string[] {
  return [...tekst.matchAll(mentionExtractRegex())].map(m => m[1].trim().toLowerCase())
}

describe('mention-regex', () => {
  it('matcher @alle alene', () => {
    expect(parse('Hva med @alle?')).toEqual(['alle'])
  })

  it('matcher @alle med påfølgende ord — stopper ved space', () => {
    // Dette er den faktiske bugen som ble fikset
    expect(parse('Hva med @alle andre?')).toEqual(['alle'])
  })

  it('matcher enkeltnavn', () => {
    expect(parse('@Ola kommer du?')).toEqual(['ola'])
  })

  it('flerords-navn — fanges som første ord', () => {
    // «@Ola Nordmann» → matcher `'ola'`. Inkludes-sjekk i match-
    // logikken finner profil med navn «Ola Petter Nordmann».
    expect(parse('@Ola Nordmann kommer du?')).toEqual(['ola'])
  })

  it('flere mentions i samme melding', () => {
    expect(parse('@Ola og @Per, hva sier dere?')).toEqual(['ola', 'per'])
  })

  it('ingen mention', () => {
    expect(parse('Bare en vanlig melding.')).toEqual([])
  })

  it('støtter æøå og bindestrek', () => {
    expect(parse('@Bjørn-Erik er klar')).toEqual(['bjørn-erik'])
  })
})
