import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  formaterDato,
  norskDatoNaa,
  norskDag,
  norskAar,
  isoTilDatetimeLocal,
  datetimeLocalTilIso,
  FORMAT_DATO_KLOKKE,
  TIDSSONE,
} from '@/lib/dato'

describe('dato – tidssone-policy', () => {
  it('TIDSSONE er Europe/Oslo', () => {
    expect(TIDSSONE).toBe('Europe/Oslo')
  })

  describe('formaterDato', () => {
    it('konverterer UTC-tid til norsk visning', () => {
      // 15. juni 2026 kl 14:00 UTC = kl 16:00 CEST (Oslo sommertid)
      const resultat = formaterDato('2026-06-15T14:00:00Z', FORMAT_DATO_KLOKKE)
      expect(resultat).toContain('16:00')
      expect(resultat).toContain('15.')
      expect(resultat).toContain('juni')
    })

    it('håndterer vintertid (CET = UTC+1)', () => {
      // 15. januar 2026 kl 14:00 UTC = kl 15:00 CET
      const resultat = formaterDato('2026-01-15T14:00:00Z', FORMAT_DATO_KLOKKE)
      expect(resultat).toContain('15:00')
    })

    it('håndterer sommertid (CEST = UTC+2)', () => {
      // 15. juli 2026 kl 10:00 UTC = kl 12:00 CEST
      const resultat = formaterDato('2026-07-15T10:00:00Z', FORMAT_DATO_KLOKKE)
      expect(resultat).toContain('12:00')
    })

    it('håndterer DST-overgang vår (siste søndag i mars)', () => {
      // 29. mars 2026 kl 00:30 UTC — fortsatt CET (UTC+1) → 01:30
      const før = formaterDato('2026-03-29T00:30:00Z', 'HH:mm')
      expect(før).toBe('01:30')

      // 29. mars 2026 kl 01:30 UTC — nå CEST (UTC+2) → 03:30 (klokka hopper fra 02 til 03)
      const etter = formaterDato('2026-03-29T01:30:00Z', 'HH:mm')
      expect(etter).toBe('03:30')
    })

    it('håndterer DST-overgang høst (siste søndag i oktober)', () => {
      // 25. oktober 2026 kl 00:30 UTC — CEST (UTC+2) → 02:30
      const før = formaterDato('2026-10-25T00:30:00Z', 'HH:mm')
      expect(før).toBe('02:30')

      // 25. oktober 2026 kl 01:30 UTC — CET (UTC+1) → 02:30
      const etter = formaterDato('2026-10-25T01:30:00Z', 'HH:mm')
      expect(etter).toBe('02:30')
    })
  })

  describe('norskDatoNaa', () => {
    it('returnerer en Date med år, måned, dag (uten klokkeslett)', () => {
      const naa = norskDatoNaa()
      expect(naa.getHours()).toBe(0)
      expect(naa.getMinutes()).toBe(0)
      expect(naa.getSeconds()).toBe(0)
    })

    it('returnerer norsk dato selv om UTC-dato er annerledes (nyttårsaften)', () => {
      // Simuler at det er 31. desember 23:30 UTC = 1. januar 00:30 norsk tid (CET)
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-12-31T23:30:00Z'))

      const naa = norskDatoNaa()
      // I Norge er det allerede 1. januar
      expect(naa.getFullYear()).toBe(2027)
      expect(naa.getMonth()).toBe(0) // januar
      expect(naa.getDate()).toBe(1)

      vi.useRealTimers()
    })
  })

  describe('norskDag', () => {
    it('parser ISO-dato til norsk dagdato', () => {
      // 1. juni 2026 kl 22:30 UTC = 2. juni 00:30 CEST
      const dag = norskDag('2026-06-01T22:30:00Z')
      expect(dag.getDate()).toBe(2)
      expect(dag.getMonth()).toBe(5) // juni
    })

    it('returnerer Date med klokkeslett 00:00:00', () => {
      const dag = norskDag('2026-06-15T14:00:00Z')
      expect(dag.getHours()).toBe(0)
      expect(dag.getMinutes()).toBe(0)
    })
  })

  describe('norskAar', () => {
    it('returnerer riktig år i norsk tidssone', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-12-31T23:30:00Z'))
      expect(norskAar()).toBe(2027)
      vi.useRealTimers()
    })
  })

  describe('isoTilDatetimeLocal', () => {
    it('returnerer tom streng for null', () => {
      expect(isoTilDatetimeLocal(null)).toBe('')
    })

    it('konverterer ISO til datetime-local i Oslo-tid', () => {
      const resultat = isoTilDatetimeLocal('2026-06-15T14:00:00Z')
      expect(resultat).toBe('2026-06-15T16:00') // CEST = UTC+2
    })
  })

  describe('datetimeLocalTilIso', () => {
    it('returnerer tom streng for tom input', () => {
      expect(datetimeLocalTilIso('')).toBe('')
    })

    it('returnerer en gyldig ISO-streng', () => {
      const resultat = datetimeLocalTilIso('2026-06-15T16:00')
      expect(resultat).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/)
      // Verifiser at den parser tilbake til en gyldig dato
      const dato = new Date(resultat)
      expect(dato.getTime()).not.toBeNaN()
    })

    it('bevarer dag og måned', () => {
      const resultat = datetimeLocalTilIso('2026-12-24T18:00')
      const dato = new Date(resultat)
      // Uavhengig av tidssone-offset skal det fortsatt være 24. desember i UTC eller UTC+1/+2
      expect(dato.getUTCMonth()).toBe(11) // desember
      expect([23, 24]).toContain(dato.getUTCDate()) // kan bli 23 eller 24 avhengig av offset
    })
  })
})
