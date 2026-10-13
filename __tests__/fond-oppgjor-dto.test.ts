import { describe, it, expect } from 'vitest'
import { byggOppgjorPayload } from '@/lib/fond-oppgjor-payload'
import { validerOppgjor } from '@/lib/fond-oppgjor'
import type { OppgjorDiff } from '@/lib/actions/fond'

// Vakt mot fellen i #543: skrive-payloaden bygges fra diff-DTO-en, ikke fra
// JSON-en som ble hentet fra kilden. Et felt som ikke er med i gjennomgangen
// hentes, vises i diffen, og skrives ALDRI — helt uten feilmelding. Den eneste
// måten å oppdage det er en test som følger et felt hele veien gjennom.

const DIFF: OppgjorDiff = {
  snapshot_dato: '2026-07-26',
  generert: '2026-07-30T08:00:00Z',
  kontrollert_dato: '2026-07-28',
  uavklarteNavn: [],
  saldo: { app: 0, hentet: 12997.21 },
  renter_hittil: { brutto: 618.31, netto_anslag: 482.28, skattesats: 0.22, observert_dato: '2026-07-20' },
  rader: [
    {
      profil_id: 'p1',
      visningsnavn: 'Ada',
      appVerdi: null,
      hentetVerdi: 12950.0,
      antallRader: 0,
      detaljer: {
        oppspart_akkumulert: 9000.0,
        renteandel_i_fjor: 450.0,
        bevegelser: [
          { dato: '2026-01-15', belop: 500.0 },
          { dato: '2026-02-15', belop: 500.0 },
          { dato: '2026-02-15', belop: 4500.0 },
          { dato: '2026-03-03', belop: -2000.0 },
        ],
      },
    },
    {
      profil_id: 'p2',
      visningsnavn: 'Cato',
      appVerdi: 47.21,
      hentetVerdi: 47.21,
      antallRader: 1,
      detaljer: {
        oppspart_akkumulert: 45.6,
        renteandel_i_fjor: 1.61,
        bevegelser: [],
      },
    },
  ],
}

describe('byggOppgjorPayload', () => {
  it('bærer detaljfeltene videre fra DTO-en til payloaden', () => {
    const p = byggOppgjorPayload(DIFF)
    const ada = p.andeler[0]
    expect(ada.oppspart_akkumulert).toBe(9000)
    expect(ada.renteandel_i_fjor).toBe(450)
    expect(ada.bevegelser).toHaveLength(4)
  })

  it('bevarer tom bevegelsesliste som tom liste, ikke som fraværende felt', () => {
    // Forskjellen er reell: fraværende felt = «eldre API-svar, ingen detaljer»,
    // tom liste = «har fjorårstall, men ingen bevegelser i år». Blandes de,
    // mister Cato-raden muligheten til å utvides.
    const p = byggOppgjorPayload(DIFF)
    expect(p.andeler[1].bevegelser).toEqual([])
    expect('bevegelser' in p.andeler[1]).toBe(true)
  })

  it('utelater detaljfeltene helt når raden ikke har dem (eldre svar)', () => {
    const utenDetaljer: OppgjorDiff = {
      ...DIFF,
      uavklarteNavn: [],
      saldo: { app: 0, hentet: 12950 },
      rader: [{ ...DIFF.rader[0], detaljer: null }],
    }
    const p = byggOppgjorPayload(utenDetaljer)
    expect('oppspart_akkumulert' in p.andeler[0]).toBe(false)
    expect('bevegelser' in p.andeler[0]).toBe(false)
  })

  it('produserer en payload som passerer server-valideringen', () => {
    // Den egentlige kontrakten: det klienten sender skal re-valideres uten å
    // kastes. Består denne, er hele hent→skriv-runden hel.
    expect(() => validerOppgjor(byggOppgjorPayload(DIFF))).not.toThrow()
  })

  it('en payload med droppede detaljfelter ville brutt invarianten', () => {
    // Negativ kontroll: dette er nøyaktig bugen. Beholdes «belop» mens
    // oppdelingen faller bort, er resultatet et gyldig oppgjør UTEN detaljer —
    // altså ingen feilmelding noe sted, bare tapte data. Testen dokumenterer at
    // tapet er stille, og er grunnen til at de fire testene over finnes.
    const uten = {
      ...byggOppgjorPayload(DIFF),
      andeler: byggOppgjorPayload(DIFF).andeler.map(a => ({
        visningsnavn: a.visningsnavn,
        belop: a.belop,
      })),
    }
    expect(() => validerOppgjor(uten)).not.toThrow()
    expect('bevegelser' in uten.andeler[0]).toBe(false)
  })

  it('bærer renter_hittil videre fra DTO-en til payloaden', () => {
    const p = byggOppgjorPayload(DIFF)
    expect(p.renter_hittil).toEqual(DIFF.renter_hittil)
    expect(validerOppgjor(p).renter_hittil?.netto_anslag).toBe(482.28)
  })

  it('utelater renter_hittil når feltet manglet — null er ikke gyldig i kontrakten', () => {
    const p = byggOppgjorPayload({ ...DIFF, renter_hittil: null })
    expect('renter_hittil' in p).toBe(false)
    expect(() => validerOppgjor(p)).not.toThrow()
  })

  it('bærer kontrollert_dato videre, og utelater den når den manglet', () => {
    expect(validerOppgjor(byggOppgjorPayload(DIFF)).kontrollert_dato).toBe('2026-07-28')
    expect('kontrollert_dato' in byggOppgjorPayload({ ...DIFF, kontrollert_dato: null })).toBe(false)
  })
})
