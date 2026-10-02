import { describe, it, expect } from 'vitest'
import { TREFFMAAL_UNNTAK, KJENTE_MANGLER } from '../e2e/helpers/treffmaal-unntak'
import { byggTreffmaalRapport, TreffmaalSamler, type Maaling } from '../e2e/reportere/treffmaal-rapport'

// Pinner kontrakten for #700 PR 2-vakten: et unntak uten alternativ vei er
// ikke et unntak, og rapporten skal regnes ut deterministisk fra en fast
// fixture — ikke bare «ser riktig ut» i en reell kjøring.

describe('TREFFMAAL_UNNTAK — hvert unntak har en reell alternativ vei', () => {
  it.each(TREFFMAAL_UNNTAK)('$selektor (#$issue)', unntak => {
    expect(unntak.grunn.trim().length).toBeGreaterThan(0)
    expect(unntak.alternativVei.trim().length).toBeGreaterThan(0)
    expect(unntak.issue).toBeGreaterThan(0)
    expect(unntak.selektor.trim().length).toBeGreaterThan(0)
  })

  it('minst ett unntak finnes (vakten ville ellers vært et løfte uten en reell test)', () => {
    expect(TREFFMAAL_UNNTAK.length).toBeGreaterThan(0)
  })
})

describe('KJENTE_MANGLER — hver mangel er en reell tekst', () => {
  it('ingen tomme oppføringer', () => {
    expect(KJENTE_MANGLER.length).toBeGreaterThan(0)
    for (const mangel of KJENTE_MANGLER) {
      expect(mangel.trim().length).toBeGreaterThan(0)
    }
  })
})

function maaling(overrides: Partial<Maaling>): Maaling {
  return {
    kontekst: '/eksempel',
    sti: '/eksempel',
    kandidater: 5,
    kandidaterIGulvOmraade: 5,
    maalt: 5,
    unntatt: 0,
    skjult: 0,
    inlineLenker: 0,
    ikkeMaalt: 0,
    brudd: [],
    ...overrides,
  }
}

describe('byggTreffmaalRapport() — fast fixture', () => {
  it('overskrift teller ruter og dybde-kontekster korrekt, ingen brudd', () => {
    const maalinger: Maaling[] = [
      maaling({ kontekst: '/', sti: '/', maalt: 4 }),
      maaling({ kontekst: '/chat', sti: '/chat', maalt: 6 }),
      // Samme sti to ganger (bredde + dybde) — skal telle som 1 rute, 1 dybde-kontekst.
      maaling({ kontekst: '/chat — melding-picker åpen', sti: '/chat', maalt: 8 }),
    ]
    const md = byggTreffmaalRapport(maalinger)
    expect(md).toContain('## Trykkflater (#700): 18 elementer målt — 2 ruter i default-tilstand, i tillegg 1 dybde-kontekster (åpnet panel/lightbox/picker)')
    expect(md).toContain('### Brudd')
    expect(md).toContain('Ingen.')
  })

  it('brudd listes med kontekst, beskrivelse og mål', () => {
    const maalinger: Maaling[] = [
      maaling({
        kontekst: '/profil',
        sti: '/profil',
        brudd: [{ beskrivelse: 'button "Lagre"', bredde: 40, hoyde: 30, bomPunkter: 0 }],
      }),
    ]
    const md = byggTreffmaalRapport(maalinger)
    expect(md).toContain('**/profil** — button "Lagre": 40×30 px, 0 bom-punkt(er)')
  })

  it('tomt resultatsett gir en lesbar «ingen målinger»-rapport, ikke en krasjende funksjon', () => {
    const md = byggTreffmaalRapport([])
    expect(md).toContain('0 elementer målt — 0 ruter i default-tilstand, i tillegg 0 dybde-kontekster')
    expect(md).toContain('Ingen målinger samlet inn')
  })

  it('unntak i bruk avgjøres av om en matchende rute har unntatt > 0', () => {
    // Bruker en av de EKTE unntakene for å bevise at matchingen fungerer mot
    // den faktiske lista, ikke bare mot en lokal fixture-kopi av den.
    const chatUnntak = TREFFMAAL_UNNTAK.find(u => u.rute === '/chat')
    expect(chatUnntak).toBeDefined()

    const md = byggTreffmaalRapport([maaling({ kontekst: '/chat', sti: '/chat', unntatt: 1 })])
    expect(md).toContain(`\`${chatUnntak!.selektor}\``)
    expect(md).toContain('### Ubrukte unntak')
  })

  it('kjente mangler står alltid med, uavhengig av målingene', () => {
    const md = byggTreffmaalRapport([])
    for (const mangel of KJENTE_MANGLER) {
      expect(md).toContain(mangel)
    }
  })
})

describe('TreffmaalSamler — siste forsøk vinner ved duplikat test.id', () => {
  it('en ny leggTil() på samme test-id OVERSKRIVER, ikke slår sammen', () => {
    const samler = new TreffmaalSamler()
    samler.leggTil('test-1', [maaling({ kontekst: 'forsøk 1' })])
    samler.leggTil('test-1', [maaling({ kontekst: 'forsøk 2 (retry)' })])

    const alle = samler.alle()
    expect(alle).toHaveLength(1)
    expect(alle[0].kontekst).toBe('forsøk 2 (retry)')
  })

  it('ulike test-id-er akkumuleres uavhengig av hverandre', () => {
    const samler = new TreffmaalSamler()
    samler.leggTil('test-a', [maaling({ kontekst: 'a' })])
    samler.leggTil('test-b', [maaling({ kontekst: 'b' })])

    expect(samler.alle().map(m => m.kontekst).sort()).toEqual(['a', 'b'])
  })

  it('leggTil() med tom liste ignoreres (overskriver ikke et tidligere, ekte resultat)', () => {
    const samler = new TreffmaalSamler()
    samler.leggTil('test-1', [maaling({ kontekst: 'ekte resultat' })])
    samler.leggTil('test-1', [])

    expect(samler.alle()).toHaveLength(1)
    expect(samler.alle()[0].kontekst).toBe('ekte resultat')
  })
})
