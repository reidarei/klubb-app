// TZ-matrise-regresjonstest for #675: dagStreng()-buggen i cronet var riktig
// KUN fordi produksjonsserveren (Vercel, Dublin) tilfeldigvis står i UTC.
// Denne testen kjører lib/dato.ts sine hjelpere under FLERE tidssoner og
// asserterer EKSAKTE verdier (ikke bare «likhet på tvers av soner») — jf.
// planens funn: fraværet av verdi-asserts var nøyaktig det som lot #674
// passere ubemerket gjennom __tests__/paaminnelser.test.ts, som hadde sin
// egen kopi av den samme buggy dagStreng() og derfor var enig med
// produksjonskoden i ENHVER tidssone.
//
// Ingen module-mock av @/lib/dato her — vi tester den EKTE implementasjonen.
import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest'
import {
  iDagOslo,
  osloDagPluss,
  iMorgenOslo,
  osloDagStartIso,
  osloUkestart,
  norskAar,
  norskDatoNokkel,
  datetimeLocalTilIso,
} from '@/lib/dato'

const OPPRINNELIG_TZ = process.env.TZ

// vitest sin forks-pool GJENBRUKER prosesser på tvers av testfiler — uten
// eksplisitt restaurering her kan denne fila lekke tidssone inn i neste fil
// som kjører i samme fork, og gi en flake som ser helt urelatert ut.
afterAll(() => {
  if (OPPRINNELIG_TZ === undefined) {
    delete process.env.TZ
  } else {
    process.env.TZ = OPPRINNELIG_TZ
  }
})

function medTidssone<T>(tz: string, fn: () => T): T {
  process.env.TZ = tz
  try {
    return fn()
  } finally {
    // Restaureres av afterAll uansett, men vi lar ikke en feilet fn() etterlate
    // TZ satt til testverdien for resten av samme testkjøring.
    if (OPPRINNELIG_TZ === undefined) delete process.env.TZ
    else process.env.TZ = OPPRINNELIG_TZ
  }
}

const SONER = ['UTC', 'Europe/Oslo', 'America/Los_Angeles', 'Pacific/Kiritimati']

describe('TZ-matrise: lib/dato.ts skal gi identiske verdier uansett prosess-TZ', () => {
  // Egenkontroll — hvis DENNE feiler, er selve premisset for matrisen dødt
  // (testrunneren tolker ikke TZ-runtime-bytte slik vi antar), og resten av
  // matrisen ville feilaktig sett grønn ut uten å faktisk teste noe. Skal
  // derfor FEILE testen, ikke skippes.
  it('egenkontroll: runtime-bytte av process.env.TZ slår faktisk gjennom på Date', () => {
    const utc = medTidssone('UTC', () => new Date(2026, 8, 10).toISOString())
    expect(utc).toBe('2026-09-10T00:00:00.000Z')
    const oslo = medTidssone('Europe/Oslo', () => new Date(2026, 8, 10).toISOString())
    expect(oslo).toBe('2026-09-09T22:00:00.000Z')
  })

  describe('sommertid — 11. september 2026, 01:30 norsk tid (UTC-dag og Oslo-dag divergerer)', () => {
    beforeAll(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-09-10T23:30:00Z'))
    })
    afterAll(() => {
      vi.useRealTimers()
    })

    for (const tz of SONER) {
      it(`gir riktig norsk dag/klokke i sone ${tz}`, () => {
        medTidssone(tz, () => {
          expect(iDagOslo()).toBe('2026-09-11')
          expect(osloDagPluss(0)).toBe('2026-09-11')
          expect(osloDagPluss(7)).toBe('2026-09-18')
          expect(osloDagPluss(-7)).toBe('2026-09-04')
          expect(iMorgenOslo()).toBe('2026-09-12')
          // UTC+2 om sommeren — norsk midnatt er 22:00 UTC dagen før.
          expect(osloDagStartIso(0)).toBe('2026-09-10T22:00:00.000Z')
          expect(osloUkestart()).toBe('2026-09-07')
          expect(norskAar()).toBe(2026)
          expect(norskDatoNokkel('2026-09-10T23:30:00Z')).toBe('2026-09-11')
          expect(datetimeLocalTilIso('2026-09-11T09:00')).toBe('2026-09-11T07:00:00.000Z')
        })
      })
    }
  })

  describe('vintertid og årsskifte — 31. desember 2026, 00:30 norsk tid (nyttårsaften snur før UTC)', () => {
    beforeAll(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-12-31T23:30:00Z'))
    })
    afterAll(() => {
      vi.useRealTimers()
    })

    for (const tz of SONER) {
      it(`ruller over til nyttår riktig i sone ${tz}`, () => {
        medTidssone(tz, () => {
          expect(iDagOslo()).toBe('2027-01-01')
          expect(norskAar()).toBe(2027)
          // UTC+1 om vinteren — norsk midnatt er 23:00 UTC dagen før.
          expect(osloDagStartIso(0)).toBe('2026-12-31T23:00:00.000Z')
        })
      })
    }
  })
})
