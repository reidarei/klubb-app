// Rene funksjoner — ingen mocks. Pinner #633: medlemmet skal få en tekst
// skrevet TIL ham (endringslogg-oppføringen merket med issue-nummeret), aldri
// et utdrag av en GitHub-kommentar skrevet til Reidar.

import { describe, it, expect } from 'vitest'
import {
  finnEndringForInnspill,
  byggInnspillSvar,
  INNSPILL_HANDTERT_TITTEL,
  INNSPILL_HANDTERT_MELDING,
  INNSPILL_AVSLUTTET_TITTEL,
  INNSPILL_AVSLUTTET_MELDING,
  INNSPILL_PA_PLASS_TITTEL,
} from '@/lib/innspill-svar'
import type { Endring } from '@/lib/endringslogg'

describe('finnEndringForInnspill', () => {
  it('finner oppføring på issue-nummer', () => {
    const endringer: Endring[] = [
      { versjon: 'V3.5.60', dato: '2026-08-27', tekst: 'Noe nytt', innspill: [633] },
    ]
    expect(finnEndringForInnspill(endringer, 633)?.tekst).toBe('Noe nytt')
  })

  it('finner oppføring når innspill har flere numre', () => {
    const endringer: Endring[] = [
      { versjon: 'V3.5.60', dato: '2026-08-27', tekst: 'To ting på en gang', innspill: [629, 625] },
    ]
    expect(finnEndringForInnspill(endringer, 625)?.tekst).toBe('To ting på en gang')
    expect(finnEndringForInnspill(endringer, 629)?.tekst).toBe('To ting på en gang')
  })

  it('to oppføringer dekker samme issue → øverste (nyeste) vinner', () => {
    const endringer: Endring[] = [
      { versjon: 'V3.5.61', dato: '2026-08-28', tekst: 'Oppfølging', innspill: [625] },
      { versjon: 'V3.5.58', dato: '2026-08-26', tekst: 'Opprinnelig svar', innspill: [625] },
    ]
    expect(finnEndringForInnspill(endringer, 625)?.tekst).toBe('Oppfølging')
  })

  it('ukjent nummer → null', () => {
    const endringer: Endring[] = [
      { versjon: 'V3.5.60', dato: '2026-08-27', tekst: 'Noe nytt', innspill: [633] },
    ]
    expect(finnEndringForInnspill(endringer, 999)).toBeNull()
  })

  it('tom liste → null (klubb-app-tilfellet)', () => {
    expect(finnEndringForInnspill([], 633)).toBeNull()
  })

  it('oppføring uten innspill-felt matcher aldri', () => {
    const endringer: Endring[] = [
      { versjon: 'V3.5.60', dato: '2026-08-27', tekst: 'Ingen kobling' },
    ]
    expect(finnEndringForInnspill(endringer, 633)).toBeNull()
  })
})

describe('byggInnspillSvar', () => {
  it('hel tekst: en 900-tegns oppføring kommer ordrett og uavkortet ut', () => {
    const langTekst = 'A'.repeat(900)
    const endring: Endring = { versjon: 'V3.5.60', dato: '2026-08-27', tekst: langTekst, innspill: [633] }
    const { melding } = byggInnspillSvar(endring)
    expect(melding).toContain(langTekst)
    expect(melding.length).toBeGreaterThan(900)
  })

  it('meldingen inneholder versjonsstrengen', () => {
    const endring: Endring = { versjon: 'V3.5.60', dato: '2026-08-27', tekst: 'Zoom er på plass', innspill: [625] }
    const { melding, tittel } = byggInnspillSvar(endring)
    expect(melding).toContain('V3.5.60')
    expect(tittel).toBe(INNSPILL_PA_PLASS_TITTEL)
  })

  // Takken skal stå tidlig, men KORT og på samme linje som endringen — begge
  // må inn i 2-linjers-klippet. En lang takk på egen linje ville spist klippet
  // og skjult hva medlemmet faktisk fikk.
  it('takken står først, men på samme linje som endringen', () => {
    const endring: Endring = { versjon: 'V3.5.60', dato: '2026-08-27', tekst: 'Zoom er på plass', innspill: [625] }
    const { melding } = byggInnspillSvar(endring)
    const iTakk = melding.toLowerCase().indexOf('takk')
    const iEndring = melding.indexOf('Zoom er på plass')
    expect(iTakk).toBe(0)
    expect(iEndring).toBeGreaterThan(iTakk)
    // Ingen linjeskift mellom takk og endring — begge må inn i 2-linjers-klippet.
    expect(melding.slice(iTakk, iEndring)).not.toContain('\n')
  })

  it('meldingen beriker aldri med teknisk kontekst utover det oppføringsteksten selv sier', () => {
    const endring: Endring = {
      versjon: 'V3.5.59',
      dato: '2026-08-26',
      tekst: 'Medlemslista sorteres nå etter oppmøte.',
      innspill: [629],
    }
    const { melding } = byggInnspillSvar(endring)
    for (const forbudt of ['#', 'PR', 'klubb-app', 'merget', 'prod']) {
      expect(melding).not.toContain(forbudt)
    }
  })

  it('fallback ved null: fast tekst, ingen versjonsstreng', () => {
    const { tittel, melding } = byggInnspillSvar(null)
    expect(tittel).toBe(INNSPILL_HANDTERT_TITTEL)
    expect(melding).toBe(INNSPILL_HANDTERT_MELDING)
    expect(melding).not.toMatch(/V\d+\.\d+\.\d+/)
  })

  it('not_planned → egen tittel, ingen «gjennomført»-formulering', () => {
    const { tittel, melding } = byggInnspillSvar(null, 'not_planned')
    expect(tittel).toBe(INNSPILL_AVSLUTTET_TITTEL)
    expect(melding).toBe(INNSPILL_AVSLUTTET_MELDING)
    expect(melding.toLowerCase()).not.toContain('gjennomført')
    expect(melding.toLowerCase()).not.toContain('håndtert')
  })

  it('endring finnes selv om state_reason er not_planned → endringen vinner', () => {
    const endring: Endring = { versjon: 'V3.5.60', dato: '2026-08-27', tekst: 'Ble likevel gjort', innspill: [1] }
    const { tittel } = byggInnspillSvar(endring, 'not_planned')
    expect(tittel).toBe(INNSPILL_PA_PLASS_TITTEL)
  })
})
