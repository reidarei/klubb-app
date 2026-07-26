import { describe, it, expect } from 'vitest'
import { feilTekst, proevIgjenHref, visTomTekst, bunnSlot, type TidligereKilde } from '@/lib/tidligere-feil'
import type { TidligereFilter } from '@/lib/tidligere-filter'

describe('feilTekst', () => {
  it('ingen feilende kilder → null', () => {
    expect(feilTekst([], 'alle')).toBeNull()
  })

  it('melding feiler → presis tekst uansett filter', () => {
    expect(feilTekst(['melding'], 'alle')).toBe('Fikk ikke tak i meldingene akkurat nå.')
    expect(feilTekst(['melding'], 'melding')).toBe('Fikk ikke tak i meldingene akkurat nå.')
  })

  it('poll feiler → presis tekst uansett filter', () => {
    expect(feilTekst(['poll'], 'alle')).toBe('Fikk ikke tak i pollene akkurat nå.')
    expect(feilTekst(['poll'], 'poll')).toBe('Fikk ikke tak i pollene akkurat nå.')
  })

  it('arrangement feiler med filter=moete → «møtene»', () => {
    expect(feilTekst(['arrangement'], 'moete')).toBe('Fikk ikke tak i møtene akkurat nå.')
  })

  it('arrangement feiler med filter=tur → «turene»', () => {
    expect(feilTekst(['arrangement'], 'tur')).toBe('Fikk ikke tak i turene akkurat nå.')
  })

  it('arrangement feiler med filter=alle → «møtene og turene» (dekker begge arrangementstyper)', () => {
    expect(feilTekst(['arrangement'], 'alle')).toBe('Fikk ikke tak i møtene og turene akkurat nå.')
  })

  it('to kilder feiler → generisk tekst', () => {
    expect(feilTekst(['arrangement', 'melding'], 'alle')).toBe('Fikk ikke tak i alt her.')
    expect(feilTekst(['melding', 'poll'], 'alle')).toBe('Fikk ikke tak i alt her.')
  })

  it('tre kilder feiler → generisk tekst', () => {
    expect(feilTekst(['arrangement', 'melding', 'poll'], 'alle')).toBe('Fikk ikke tak i alt her.')
  })

  it('regresjonsvern: ingen tekst lekker rå tabellnavn', () => {
    const filtre: TidligereFilter[] = ['alle', 'moete', 'tur', 'melding', 'poll']
    const kildekombinasjoner: TidligereKilde[][] = [
      ['arrangement'],
      ['melding'],
      ['poll'],
      ['arrangement', 'melding'],
      ['arrangement', 'poll'],
      ['melding', 'poll'],
      ['arrangement', 'melding', 'poll'],
    ]
    for (const filter of filtre) {
      for (const kilder of kildekombinasjoner) {
        const tekst = feilTekst(kilder, filter)
        // \b-grense: «meldingene»/«pollene» (bøyd form vi faktisk bruker) skal
        // IKKE trigge testen — det er kun det rå DB-tabellnavnet vi vokter mot.
        expect(tekst).not.toMatch(/\barrangementer\b/)
        expect(tekst).not.toMatch(/\bmeldinger\b/)
        expect(tekst).not.toMatch(/\bpoll\b/)
      }
    }
  })
})

describe('proevIgjenHref', () => {
  const TS = '2026-07-26T08:00:00.000Z'

  it('filter=alle uten cursor → kun r-parameter', () => {
    expect(proevIgjenHref('alle', undefined, TS)).toBe(`/tidligere?r=${encodeURIComponent(TS)}`)
  })

  it('bevarer type når filter ≠ alle', () => {
    const href = proevIgjenHref('melding', undefined, TS)
    expect(href).toContain('type=melding')
    expect(href).toContain(`r=${encodeURIComponent(TS)}`)
  })

  it('utelater type når filter = alle', () => {
    const href = proevIgjenHref('alle', 'en-cursor-streng', TS)
    expect(href).not.toContain('type=')
  })

  it('bevarer cursor når satt', () => {
    const href = proevIgjenHref('poll', 'en-cursor-streng', TS)
    expect(href).toContain('cursor=en-cursor-streng')
  })

  it('utelater cursor når ikke satt', () => {
    const href = proevIgjenHref('poll', undefined, TS)
    expect(href).not.toContain('cursor=')
  })

  it('inneholder alltid r', () => {
    expect(proevIgjenHref('alle', undefined, TS)).toContain('r=')
    expect(proevIgjenHref('moete', 'c', TS)).toContain('r=')
  })

  it('to ulike tidsstempler gir to ulike URL-er (cache-buster virker)', () => {
    const href1 = proevIgjenHref('alle', undefined, '2026-07-26T08:00:00.000Z')
    const href2 = proevIgjenHref('alle', undefined, '2026-07-26T08:00:05.000Z')
    expect(href1).not.toBe(href2)
  })

  it('bevarer BÅDE type og cursor samtidig — retry reproduserer samme sidevindu', () => {
    const href = proevIgjenHref('tur', 'abc123', TS)
    expect(href).toContain('type=tur')
    expect(href).toContain('cursor=abc123')
  })
})

describe('visTomTekst', () => {
  it('tom side uten feil → vis tom-teksten', () => {
    expect(visTomTekst(0, false)).toBe(true)
  })

  // Kjernen i #492: en tom side FORDI noe feilet skal aldri påstå «her stopper
  // løypa». Faller !harFeil-vilkåret ut ved en refaktorering, blir denne rød.
  it('tom side MED feil → ikke tom-tekst (feilbanneret er eneste signal)', () => {
    expect(visTomTekst(0, true)).toBe(false)
  })

  it('side med innhold → aldri tom-tekst, uansett feilstatus', () => {
    expect(visTomTekst(1, false)).toBe(false)
    expect(visTomTekst(1, true)).toBe(false)
    expect(visTomTekst(30, true)).toBe(false)
  })
})

describe('bunnSlot', () => {
  it('cursor uten feil → «Last mer»', () => {
    expect(bunnSlot('c1', null)).toBe('last-mer')
  })

  it('feil uten cursor → «Prøv igjen»', () => {
    expect(bunnSlot(null, '/tidligere?r=1')).toBe('proev-igjen')
  })

  it('verken cursor eller feil → ingenting', () => {
    expect(bunnSlot(null, null)).toBe('ingen')
  })

  // Kan ikke skje i praksis — byggNesteCursor nuller cursoren når en aktiv
  // kilde feilet. Testen låser at predikatet oppfører seg som JSX-en gjorde før
  // uttrekket (cursor først), slik at uttrekket er rent behaviour-preserving.
  it('begge satt → «Last mer», samme prioritet som JSX-en hadde', () => {
    expect(bunnSlot('c1', '/tidligere?r=1')).toBe('last-mer')
  })
})
