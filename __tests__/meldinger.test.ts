import { describe, it, expect } from 'vitest'
import { erMeldingLevende, byggAgenda, MELDING_LEVENDE_DAGER, type MeldingRaad } from '@/lib/agenda-sortering'

// Verifiserer reglen for når en melding er «levende» (vises øverst på
// agenda) versus skal falle til Tidligere-seksjonen:
//   levende = (nå - sist_aktivitet) ≤ MELDING_LEVENDE_DAGER (3.5) dager
// sist_aktivitet starter ved opprettelse og bumpes av nye kommentarer.
// Reaksjoner forlenger ikke levetiden (DB-trigger fjernet i 060).
// Manuell arkivering (arkivert_tidspunkt) håndteres av byggAgenda-splittingen,
// ikke av erMeldingLevende — den forblir en ren tidsfunksjon.

const DAG_MS = 24 * 60 * 60 * 1000

const NAA_FAST = new Date('2026-04-25T12:00:00Z')

function lagMelding(
  opprettetDagerSiden: number,
  aktivitetDagerSiden: number,
  arkivertTidspunkt: string | null = null,
): MeldingRaad {
  const naaMs = NAA_FAST.getTime()
  return {
    id: 'm1',
    innhold: 'test',
    bilder: [] as string[],
    fraFacebook: false,
    opprettet: new Date(naaMs - opprettetDagerSiden * DAG_MS).toISOString(),
    sist_aktivitet: new Date(naaMs - aktivitetDagerSiden * DAG_MS).toISOString(),
    forfatter: { id: 'p', navn: 'Ola', bilde_url: null, rolle: null },
    reaksjoner: [],
    antallKommentarer: 0,
    albumSpotlight: null,
    arkivert_tidspunkt: arkivertTidspunkt,
  }
}

describe('erMeldingLevende', () => {
  const naa = NAA_FAST

  it('er levende rett etter opprettelse', () => {
    expect(erMeldingLevende(lagMelding(0, 0), naa)).toBe(true)
  })

  it('er levende dag 3.5 uten kommentarer', () => {
    expect(erMeldingLevende(lagMelding(MELDING_LEVENDE_DAGER, MELDING_LEVENDE_DAGER), naa)).toBe(true)
  })

  it('er IKKE levende dag 8 uten kommentarer', () => {
    expect(erMeldingLevende(lagMelding(8, 8), naa)).toBe(false)
  })

  it('forlenges av kommentar — opprettet for 30 dager siden, kommentar i går → levende', () => {
    expect(erMeldingLevende(lagMelding(30, 1), naa)).toBe(true)
  })

  it('faller til tidligere når 3.5 dager har gått siden siste kommentar', () => {
    // Siste kommentar for 8 dager siden → ikke levende
    expect(erMeldingLevende(lagMelding(30, 8), naa)).toBe(false)
  })
})

describe('byggAgenda — arkivering', () => {
  // Verifiserer at et ellers levende innlegg havner i tidligere
  // når arkivert_tidspunkt er satt. (#312)
  it('arkivert men ellers levende innlegg havner i tidligere', () => {
    const arkivertNaa = NAA_FAST.toISOString()
    const melding = lagMelding(1, 0, arkivertNaa) // opprettet i går, aktiv nå, men arkivert

    const agenda = byggAgenda({
      arrangementer: [],
      ansvar: [],
      profilerMedBursdag: [],
      meldinger: [melding],
      meg: 'p',
      naa: NAA_FAST,
      aar: 2026,
    })

    // Levende-seksjonen skal være tom — arkivert_tidspunkt overstyrer levetid
    expect(agenda.meldinger).toHaveLength(0)
    // Tidligere-seksjonen skal inneholde meldingen
    expect(agenda.tidligere.filter(t => t.kind === 'melding')).toHaveLength(1)
  })

  it('arkivert innlegg sorteres på arkiveringstidspunkt i tidligere', () => {
    const arkivertTidspunkt = NAA_FAST.toISOString()
    const melding = lagMelding(5, 5, arkivertTidspunkt)

    const agenda = byggAgenda({
      arrangementer: [],
      ansvar: [],
      profilerMedBursdag: [],
      meldinger: [melding],
      meg: 'p',
      naa: NAA_FAST,
      aar: 2026,
    })

    const tidligereMelding = agenda.tidligere.find(t => t.kind === 'melding')
    // sortIso skal være arkiveringstidspunktet, ikke sist_aktivitet
    expect(tidligereMelding?.sortIso).toBe(arkivertTidspunkt)
  })
})
