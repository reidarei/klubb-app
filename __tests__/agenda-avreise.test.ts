import { describe, it, expect } from 'vitest'
import { tilKort, type ArrangementRaad, type PaameldingRaad } from '@/lib/agenda-sortering'
import { AVREISE_VINDU_DAGER } from '@/lib/konstanter'

// Pinner vilkårene for avreise-blokka nederst på tur-kortet (#669): hvem som
// vises, når blokka dukker opp, og at den holder seg unna møter og fortid.
//
// `naa` bygges som en lokal midnatts-dato, samme mønster som norskDatoNaa()
// og agenda-bursdag-forst.test.ts — byggAvreise sammenligner mot norskDag(),
// som returnerer nøyaktig den formen.
const NAA_FAST = new Date(2026, 8, 10) // 10. september 2026

// Turen starter kl. 06:40 norsk tid på oppgitt dato. Klokkeslettet er med
// fordi blokka skal styres av kalenderdager, ikke av timer: en tur samme
// morgen og en tur samme kveld skal begge si «I dag».
function turPaa(dato: string, paameldinger: PaameldingRaad[] = []): ArrangementRaad {
  return {
    id: `tur-${dato}`,
    type: 'tur',
    tittel: 'Praha',
    start_tidspunkt: `${dato}T04:40:00.000Z`, // 06:40 i Oslo (UTC+2 i september)
    oppmoetested: 'Gardermoen',
    bilde_url: null,
    paameldinger,
  }
}

function paamelding(navn: string, status: string): PaameldingRaad {
  return {
    profil_id: `id-${navn}`,
    status,
    profiles: { visningsnavn: navn, bilde_url: null, rolle: null },
  }
}

describe('avreise-blokka på tur-kortet (#669)', () => {
  describe('når blokka vises', () => {
    it('vises på dagen vinduet åpner', () => {
      const kort = tilKort(turPaa('2026-09-17'), 'meg', NAA_FAST) // 7 dager fram
      expect(kort.avreise?.dagerIgjen).toBe(AVREISE_VINDU_DAGER)
    })

    it('vises ikke dagen før vinduet åpner', () => {
      const kort = tilKort(turPaa('2026-09-18'), 'meg', NAA_FAST) // 8 dager fram
      expect(kort.avreise).toBeUndefined()
    })

    it('vises på selve avreisedagen', () => {
      // dagerIgjen = 0 er en reell tilstand her: et UBESVART arrangement i dag
      // havner i «Ikke svart» som vanlig kort, ikke som highlight.
      const kort = tilKort(turPaa('2026-09-10'), 'meg', NAA_FAST)
      expect(kort.avreise?.dagerIgjen).toBe(0)
    })

    it('vises ikke etter at turen har vært', () => {
      const kort = tilKort(turPaa('2026-09-09'), 'meg', NAA_FAST)
      expect(kort.avreise).toBeUndefined()
    })

    it('vises ikke på møter, uansett hvor nært det er', () => {
      const moete = { ...turPaa('2026-09-12'), type: 'moete' }
      expect(tilKort(moete, 'meg', NAA_FAST).avreise).toBeUndefined()
    })

    it('bygges ikke i det hele tatt uten `naa` — /tidligere slipper kostnaden', () => {
      const kort = tilKort(turPaa('2026-09-12', [paamelding('Ola', 'ja')]), 'meg')
      expect(kort.avreise).toBeUndefined()
      expect(kort.antallJa).toBe(1) // resten av kortet er upåvirket
    })
  })

  describe('hvem som vises', () => {
    it('tar med dem som har svart ja, og ingen andre', () => {
      const kort = tilKort(
        turPaa('2026-09-12', [
          paamelding('Ja-mann', 'ja'),
          paamelding('Kanskje-mann', 'kanskje'),
          paamelding('Nei-mann', 'nei'),
        ]),
        'meg',
        NAA_FAST,
      )
      expect(kort.avreise?.deltakere.map(d => d.navn)).toEqual(['Ja-mann'])
    })

    it('dropper rader uten visningsnavn — en «?»-avatar sier ikke hvem som blir med', () => {
      const navnloes: PaameldingRaad = {
        profil_id: 'id-tom',
        status: 'ja',
        profiles: { visningsnavn: null, bilde_url: null, rolle: null },
      }
      const kort = tilKort(
        turPaa('2026-09-12', [paamelding('Ola', 'ja'), navnloes]),
        'meg',
        NAA_FAST,
      )
      expect(kort.avreise?.deltakere).toHaveLength(1)
    })

    it('tar med alle ansiktene — hele klubben skal være synlig, ingen «+N»', () => {
      const mange = Array.from({ length: 18 }, (_, i) => paamelding(`Mann ${i}`, 'ja'))
      const kort = tilKort(turPaa('2026-09-12', mange), 'meg', NAA_FAST)
      expect(kort.avreise?.deltakere).toHaveLength(18)
      expect(kort.antallJa).toBe(18)
    })

    it('gir tom deltakerliste når ingen har sagt ja ennå', () => {
      const kort = tilKort(turPaa('2026-09-12', [paamelding('Nei-mann', 'nei')]), 'meg', NAA_FAST)
      expect(kort.avreise?.deltakere).toEqual([])
      expect(kort.antallJa).toBe(0)
    })

    it('bærer med bilde og rolle, så Avatar kan vise foto og gul glød', () => {
      const gs: PaameldingRaad = {
        profil_id: 'id-gs',
        status: 'ja',
        profiles: {
          visningsnavn: 'Generalen',
          bilde_url: 'https://bilder.eksempel.no/gs.jpg',
          rolle: 'generalsekretaer',
        },
      }
      const kort = tilKort(turPaa('2026-09-12', [gs]), 'meg', NAA_FAST)
      expect(kort.avreise?.deltakere[0]).toEqual({
        navn: 'Generalen',
        src: 'https://bilder.eksempel.no/gs.jpg',
        rolle: 'generalsekretaer',
      })
    })
  })

  it('teller kalenderdager, ikke døgn: kveldstur i morgen er «1», ikke «0»', () => {
    // 23:00 norsk tid i morgen er drøyt 30 timer fram — ett kalenderdøgn,
    // ikke null. Dette er grunnen til at vi bruker differenceInCalendarDays
    // mot norskDag() og ikke en millisekund-differanse.
    const senKveld: ArrangementRaad = {
      ...turPaa('2026-09-11'),
      start_tidspunkt: '2026-09-11T21:00:00.000Z', // 23:00 i Oslo
    }
    expect(tilKort(senKveld, 'meg', NAA_FAST).avreise?.dagerIgjen).toBe(1)
  })
})
