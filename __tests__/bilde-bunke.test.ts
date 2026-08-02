import { describe, it, expect } from 'vitest'
import { vinkel, antallArk } from '@/components/album/BildeBunke'

// Albumkortene rendres som en bunke fremkalte bilder med små skjevheter.
// Determinismen er hele poenget: med Math.random() ville bunken lagt seg
// annerledes ved hver sidelasting, og et album ville aldri sett likt ut to
// ganger. Testen pinner det.

const ID_A = '3f1c8a20-9e44-4a11-b0d2-77c6e9a10b55'
const ID_B = 'a91b6d07-2c58-4f93-8e61-04ab7fd2c319'

describe('vinkel — deterministisk skjevhet per album', () => {
  it('gir samme vinkel for samme id og salt, hver gang', () => {
    const foerste = vinkel(ID_A, 0, 2)
    for (let i = 0; i < 50; i++) {
      expect(vinkel(ID_A, 0, 2)).toBe(foerste)
    }
  })

  it('gir ulike vinkler for ulike album', () => {
    expect(vinkel(ID_A, 0, 2)).not.toBe(vinkel(ID_B, 0, 2))
  })

  it('gir ulike vinkler for topp og de to arkene i samme bunke', () => {
    // Uten saltet ville alle tre hentet samme hash og bunken sett flat ut —
    // tre ark stablet i nøyaktig samme vinkel leser ikke som en bunke.
    const v = [vinkel(ID_A, 0, 6), vinkel(ID_A, 1, 6), vinkel(ID_A, 2, 6)]
    expect(new Set(v).size).toBe(3)
  })

  it('holder seg innenfor ±maks', () => {
    // Sveiper et bredt utvalg id-er: en hash som glipper utenfor intervallet
    // ville gitt et kort som stikker ut av rutenettet og klippes.
    for (let i = 0; i < 500; i++) {
      for (const salt of [0, 1, 2]) {
        const v = vinkel(`album-${i}`, salt, 6)
        expect(v).toBeGreaterThanOrEqual(-6)
        expect(v).toBeLessThanOrEqual(6)
      }
    }
  })

  it('takler tom id uten å kaste', () => {
    // Ikke en tilstand vi forventer, men en NaN-vinkel her ville gitt
    // transform: rotate(NaNdeg) — som CSS forkaster stille, så bunken ville
    // bare sett flat ut uten noe spor i loggen.
    expect(Number.isFinite(vinkel('', 0, 2))).toBe(true)
  })
})

describe('antallArk — bunkens tykkelse skal ikke lyve', () => {
  it.each([
    [0, 0],
    [1, 0],
    [2, 1],
    [3, 2],
    [42, 2],
  ])('%i bilder gir %i ark bak', (antall, forventet) => {
    expect(antallArk(antall)).toBe(forventet)
  })

  it('gir aldri ark bak for et album med ett bilde', () => {
    // Ett bilde er ingen bunke. Et ark bak ville lovet noe som ikke er der.
    expect(antallArk(1)).toBe(0)
  })
})
