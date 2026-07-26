import { describe, it, expect } from 'vitest'
import { parseFilter, arrangementstypeFor, skalHente, TIDLIGERE_FILTRE, TOM_TEKST } from '@/lib/tidligere-filter'
import { Constants } from '@/lib/supabase/database.types'

describe('parseFilter', () => {
  it('godtar gyldige verdier', () => {
    expect(parseFilter('moete')).toBe('moete')
    expect(parseFilter('tur')).toBe('tur')
    expect(parseFilter('melding')).toBe('melding')
    expect(parseFilter('poll')).toBe('poll')
    expect(parseFilter('alle')).toBe('alle')
  })

  it('undefined → alle', () => {
    expect(parseFilter(undefined)).toBe('alle')
  })

  it('tom streng → alle', () => {
    expect(parseFilter('')).toBe('alle')
  })

  it('ukjent verdi → alle', () => {
    expect(parseFilter('tull')).toBe('alle')
  })

  it('injection-lignende streng → alle (whitelist avviser alt utenfor settet)', () => {
    expect(parseFilter('moete,and(id.gt.0)')).toBe('alle')
  })
})

describe('arrangementstypeFor', () => {
  it('moete → moete', () => {
    expect(arrangementstypeFor('moete')).toBe('moete')
  })

  it('tur → tur', () => {
    expect(arrangementstypeFor('tur')).toBe('tur')
  })

  it('melding, poll, alle → null', () => {
    expect(arrangementstypeFor('melding')).toBeNull()
    expect(arrangementstypeFor('poll')).toBeNull()
    expect(arrangementstypeFor('alle')).toBeNull()
  })
})

describe('skalHente', () => {
  it('alle → true for alle tre kilder', () => {
    expect(skalHente('alle', 'arrangement')).toBe(true)
    expect(skalHente('alle', 'melding')).toBe(true)
    expect(skalHente('alle', 'poll')).toBe(true)
  })

  it('moete/tur → kun arrangement', () => {
    expect(skalHente('moete', 'arrangement')).toBe(true)
    expect(skalHente('moete', 'melding')).toBe(false)
    expect(skalHente('moete', 'poll')).toBe(false)
    expect(skalHente('tur', 'arrangement')).toBe(true)
    expect(skalHente('tur', 'melding')).toBe(false)
    expect(skalHente('tur', 'poll')).toBe(false)
  })

  it('melding → kun melding', () => {
    expect(skalHente('melding', 'melding')).toBe(true)
    expect(skalHente('melding', 'arrangement')).toBe(false)
    expect(skalHente('melding', 'poll')).toBe(false)
  })

  it('poll → kun poll', () => {
    expect(skalHente('poll', 'poll')).toBe(true)
    expect(skalHente('poll', 'arrangement')).toBe(false)
    expect(skalHente('poll', 'melding')).toBe(false)
  })
})

describe('TIDLIGERE_FILTRE dekker arrangementstype-enumet', () => {
  // Uten denne testen kan en ny arrangementstype (f.eks. 'annet') legges til i DB
  // uten at noen chip viser den — radene ville falt stille ut av både Møter og
  // Turer, og bare vært synlige under 'Alle'. Se #487.
  it('hver verdi i Enums.arrangementstype har en chip med samme verdi', () => {
    const chipVerdier = new Set<string>(TIDLIGERE_FILTRE.map(f => f.verdi))
    for (const type of Constants.public.Enums.arrangementstype) {
      expect(chipVerdier.has(type), `mangler chip for arrangementstype '${type}'`).toBe(true)
    }
  })

  it('arrangementstypeFor mapper hver enum-verdi tilbake til seg selv', () => {
    for (const type of Constants.public.Enums.arrangementstype) {
      expect(arrangementstypeFor(type)).toBe(type)
    }
  })

  it('hvert filter har en tom-tekst', () => {
    for (const f of TIDLIGERE_FILTRE) {
      expect(TOM_TEKST[f.verdi]).toBeTruthy()
    }
  })
})
