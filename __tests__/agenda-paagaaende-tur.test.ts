import { describe, it, expect, vi, afterEach } from 'vitest'
import { byggAgenda, type ArrangementRaad } from '@/lib/agenda-sortering'

// Pinner #766: tur med sluttid står på agendaen til sluttid passerer.
// byggAgenda leser «nå» fra systemklokka, ikke fra naa — derfor fake timers.

afterEach(() => vi.useRealTimers())

function lagArrangement(
  id: string,
  type: 'tur' | 'moete',
  startTidspunkt: string,
  sluttTidspunkt: string | null,
): ArrangementRaad {
  return {
    id,
    type,
    tittel: `Arr ${id}`,
    start_tidspunkt: startTidspunkt,
    slutt_tidspunkt: sluttTidspunkt,
    oppmoetested: null,
    bilde_url: null,
    paameldinger: [],
  }
}

describe('byggAgenda — pågående tur blir stående til slutt_tidspunkt (#766)', () => {
  it('flerdagstur dag 2 (start i går, slutt i morgen): ikke i tidligere, ligger i kommende', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-09-24T10:00:00.000Z')) // 12:00 Oslo, 24. sept
    const naa = new Date(2026, 8, 24) // Oslo-kalenderdag 24. sept, lokal midnatt

    const tur = lagArrangement(
      'flerdagstur',
      'tur',
      '2026-09-23T08:00:00.000Z', // startet i går
      '2026-09-25T16:00:00.000Z', // slutter i morgen
    )

    const agenda = byggAgenda({
      arrangementer: [tur],
      ansvar: [],
      profilerMedBursdag: [],
      meg: 'meg',
      naa,
      aar: 2026,
    })

    expect(agenda.tidligere.some(i => i.data.id === 'flerdagstur')).toBe(false)
    const kortIKommende = agenda.kommende.find(i => i.data.id === 'flerdagstur')
    expect(kortIKommende?.kind).toBe('arrangement')
  })

  it('samme tur etter slutt_tidspunkt: i tidligere', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-09-23T10:00:00.000Z')) // dagen etter turen er over
    const naa = new Date(2026, 8, 23)

    const tur = lagArrangement(
      'flerdagstur-ferdig',
      'tur',
      '2026-09-20T08:00:00.000Z',
      '2026-09-22T16:00:00.000Z', // slutt passert
    )

    const agenda = byggAgenda({
      arrangementer: [tur],
      ansvar: [],
      profilerMedBursdag: [],
      meg: 'meg',
      naa,
      aar: 2026,
    })

    expect(agenda.tidligere.some(i => i.data.id === 'flerdagstur-ferdig')).toBe(true)
    expect(agenda.kommende.some(i => i.data.id === 'flerdagstur-ferdig')).toBe(false)
  })

  it('tur som starter i dag med sluttid om tre dager: fortsatt i idag som highlight', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-09-24T10:00:00.000Z'))
    const naa = new Date(2026, 8, 24)

    const tur = lagArrangement(
      'starter-idag',
      'tur',
      '2026-09-24T06:00:00.000Z', // 08:00 Oslo, samme dag som naa
      '2026-09-27T16:00:00.000Z',
    )

    const agenda = byggAgenda({
      arrangementer: [tur],
      ansvar: [],
      profilerMedBursdag: [],
      meg: 'meg',
      naa,
      aar: 2026,
    })

    const kortIIdag = agenda.idag.find(i => i.data.id === 'starter-idag')
    expect(kortIIdag?.kind).toBe('highlight')
    expect(agenda.kommende.some(i => i.data.id === 'starter-idag')).toBe(false)
    expect(agenda.tidligere.some(i => i.data.id === 'starter-idag')).toBe(false)
  })

  it('møte i går (slutt null): uendret i tidligere', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-09-24T10:00:00.000Z'))
    const naa = new Date(2026, 8, 24)

    const moete = lagArrangement('moete-igaar', 'moete', '2026-09-23T08:00:00.000Z', null)

    const agenda = byggAgenda({
      arrangementer: [moete],
      ansvar: [],
      profilerMedBursdag: [],
      meg: 'meg',
      naa,
      aar: 2026,
    })

    expect(agenda.tidligere.some(i => i.data.id === 'moete-igaar')).toBe(true)
    expect(agenda.kommende.some(i => i.data.id === 'moete-igaar')).toBe(false)
  })

  it('tur i går med slutt null: uendret i tidligere', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-09-24T10:00:00.000Z'))
    const naa = new Date(2026, 8, 24)

    const tur = lagArrangement('tur-uten-sluttid-igaar', 'tur', '2026-09-23T08:00:00.000Z', null)

    const agenda = byggAgenda({
      arrangementer: [tur],
      ansvar: [],
      profilerMedBursdag: [],
      meg: 'meg',
      naa,
      aar: 2026,
    })

    expect(agenda.tidligere.some(i => i.data.id === 'tur-uten-sluttid-igaar')).toBe(true)
    expect(agenda.kommende.some(i => i.data.id === 'tur-uten-sluttid-igaar')).toBe(false)
  })
})
