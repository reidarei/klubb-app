/**
 * erKjentFlagg() — vakten oppdaterAppInnstilling() skriver bak (#771).
 *
 * Object.hasOwn, ikke `in`: samme prototype-hull erVarselBryter() i
 * lib/varsel-typer.ts vokter mot (se __tests__/varsel-typer.test.ts).
 */

import { describe, it, expect } from 'vitest'
import { KJENTE_FLAGG, erKjentFlagg } from '@/lib/app-innstillinger'

describe('erKjentFlagg', () => {
  it('godtar alle registrerte flagg', () => {
    for (const noekkel of Object.keys(KJENTE_FLAGG)) {
      expect(erKjentFlagg(noekkel)).toBe(true)
    }
  })

  it('avviser en ukjent nøkkel', () => {
    expect(erKjentFlagg('finnes_ikke')).toBe(false)
  })

  it('avviser Object.prototype-arv', () => {
    for (const arvet of ['toString', 'constructor', 'valueOf', 'hasOwnProperty', '__proto__']) {
      expect(erKjentFlagg(arvet)).toBe(false)
    }
  })

  it('har ikke-tom beskrivelse for hvert flagg', () => {
    for (const { beskrivelse } of Object.values(KJENTE_FLAGG)) {
      expect(beskrivelse.length).toBeGreaterThan(0)
    }
  })
})
