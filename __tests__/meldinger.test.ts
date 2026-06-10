import { describe, it, expect } from 'vitest'
import { erMeldingLevende, MELDING_LEVENDE_DAGER, type MeldingRaad } from '@/lib/agenda-sortering'

// Verifiserer reglen for når en melding er «levende» (vises øverst på
// agenda) versus skal falle til Tidligere-seksjonen:
//   levende = (nå - sist_aktivitet) ≤ 7 dager
// sist_aktivitet starter ved opprettelse og bumpes av nye kommentarer.
// Reaksjoner forlenger ikke levetiden (DB-trigger fjernet i 060).

const DAG_MS = 24 * 60 * 60 * 1000

const NAA_FAST = new Date('2026-04-25T12:00:00Z')

function lagMelding(opprettetDagerSiden: number, aktivitetDagerSiden: number): MeldingRaad {
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
  }
}

describe('erMeldingLevende', () => {
  const naa = NAA_FAST

  it('er levende rett etter opprettelse', () => {
    expect(erMeldingLevende(lagMelding(0, 0), naa)).toBe(true)
  })

  it('er levende dag 7 uten kommentarer', () => {
    expect(erMeldingLevende(lagMelding(MELDING_LEVENDE_DAGER, MELDING_LEVENDE_DAGER), naa)).toBe(true)
  })

  it('er IKKE levende dag 8 uten kommentarer', () => {
    expect(erMeldingLevende(lagMelding(8, 8), naa)).toBe(false)
  })

  it('forlenges av kommentar — opprettet for 30 dager siden, kommentar i går → levende', () => {
    expect(erMeldingLevende(lagMelding(30, 1), naa)).toBe(true)
  })

  it('faller til tidligere når 7 dager har gått siden siste kommentar', () => {
    // Siste kommentar for 8 dager siden → ikke levende
    expect(erMeldingLevende(lagMelding(30, 8), naa)).toBe(false)
  })
})
