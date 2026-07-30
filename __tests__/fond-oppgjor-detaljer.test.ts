import { describe, it, expect } from 'vitest'
import { validerOppgjor, harDetaljer } from '@/lib/fond-oppgjor'

// Base med hele detaljpakken. Speiler fixturen fra fond-API-et (#543):
// oppspart 9000 + renteandel 450 + bevegelser (500 + 500 + 4500 − 2000 = 3500)
// = 12950, altså invarianten holder.
function medDetaljer(overstyr: Record<string, unknown> = {}) {
  return {
    versjon: 1,
    generert: '2026-07-30T08:00:00Z',
    snapshot_dato: '2026-07-26',
    saldo: 12950.0,
    andeler: [
      {
        visningsnavn: 'Ada',
        belop: 12950.0,
        oppspart_akkumulert: 9000.0,
        renteandel_i_fjor: 450.0,
        bevegelser: [
          { dato: '2026-01-15', belop: 500.0 },
          { dato: '2026-02-15', belop: 500.0 },
          { dato: '2026-02-15', belop: 4500.0 },
          { dato: '2026-03-03', belop: -2000.0 },
        ],
        ...overstyr,
      },
    ],
  }
}

describe('validerOppgjor — detaljpakken', () => {
  it('godtar full pakke og bevarer bevegelsene', () => {
    const o = validerOppgjor(medDetaljer())
    const a = o.andeler[0]
    expect(a.oppspart_akkumulert).toBe(9000)
    expect(a.renteandel_i_fjor).toBe(450)
    // Fire bevegelser, ikke tre: to på samme dato skal IKKE slås sammen
    expect(a.bevegelser).toHaveLength(4)
    expect(a.bevegelser?.filter(b => b.dato === '2026-02-15')).toHaveLength(2)
  })

  it('godtar andel uten detaljer i det hele tatt (eldre API-svar, S4)', () => {
    const o = validerOppgjor({
      versjon: 1,
      generert: '2026-07-30T08:00:00Z',
      snapshot_dato: '2026-07-26',
      saldo: 12950.0,
      andeler: [{ visningsnavn: 'Ada', belop: 12950.0 }],
    })
    expect(harDetaljer(o.andeler[0])).toBe(false)
  })

  it('godtar tom bevegelsesliste når fjorårstallene stemmer alene', () => {
    // Cato-tilfellet fra fixturen: 45.60 + 1.61 = 47.21, ingen bevegelser.
    // I januar gjelder dette alle, så det må være en gyldig tilstand.
    const o = validerOppgjor({
      versjon: 1,
      generert: '2026-07-30T08:00:00Z',
      snapshot_dato: '2026-07-26',
      saldo: 47.21,
      andeler: [
        {
          visningsnavn: 'Cato',
          belop: 47.21,
          oppspart_akkumulert: 45.6,
          renteandel_i_fjor: 1.61,
          bevegelser: [],
        },
      ],
    })
    expect(o.andeler[0].bevegelser).toEqual([])
  })

  // ─── Pakke-regelen ────────────────────────────────────────────────────────
  // Ett eller to felter uten det tredje er ugyldig: da kan ikke oppdelingen
  // summere seg til totalen, og en oppdeling som ikke stemmer med tallet over
  // seg leser som en bug uansett hvor riktig koden er.

  it.each([
    ['bare oppspart_akkumulert', { renteandel_i_fjor: undefined, bevegelser: undefined }],
    ['bare renteandel_i_fjor', { oppspart_akkumulert: undefined, bevegelser: undefined }],
    ['bare bevegelser', { oppspart_akkumulert: undefined, renteandel_i_fjor: undefined }],
    ['to av tre', { bevegelser: undefined }],
  ])('kaster ved delvis pakke: %s', (_navn, overstyr) => {
    // Fjern nøklene helt — undefined i objektet er ikke det samme som fraværende
    const andel = { ...medDetaljer().andeler[0], ...overstyr } as Record<string, unknown>
    for (const [k, v] of Object.entries(overstyr)) if (v === undefined) delete andel[k]
    expect(() =>
      validerOppgjor({ ...medDetaljer(), andeler: [andel] }),
    ).toThrow('delvis detaljpakke')
  })

  // ─── Invarianten ──────────────────────────────────────────────────────────

  it('kaster når delene ikke summerer seg til totalen', () => {
    expect(() => validerOppgjor(medDetaljer({ oppspart_akkumulert: 9001.0 }))).toThrow(
      'summerer seg ikke',
    )
  })

  it('kaster ved ett øres avvik — ikke bare grove feil', () => {
    expect(() => validerOppgjor(medDetaljer({ oppspart_akkumulert: 9000.01 }))).toThrow(
      'summerer seg ikke',
    )
  })

  it('godtar øre-beløp som ville gitt falskt avvik i flyttall', () => {
    // 0.1 + 0.2 !== 0.3 i float. Regnes invarianten uten øre-avrunding,
    // feiler denne — som er hele grunnen til at iOere finnes.
    expect(() =>
      validerOppgjor({
        versjon: 1,
        generert: '2026-07-30T08:00:00Z',
        snapshot_dato: '2026-07-26',
        saldo: 0.3,
        andeler: [
          {
            visningsnavn: 'Eir',
            belop: 0.3,
            oppspart_akkumulert: 0.1,
            renteandel_i_fjor: 0.2,
            bevegelser: [],
          },
        ],
      }),
    ).not.toThrow()
  })

  // ─── Fortegn på bevegelser ────────────────────────────────────────────────

  it('godtar negativ bevegelse (uttak)', () => {
    const o = validerOppgjor(medDetaljer())
    expect(o.andeler[0].bevegelser?.some(b => b.belop < 0)).toBe(true)
  })

  it('kaster på nullbevegelse', () => {
    expect(() =>
      validerOppgjor(
        medDetaljer({
          belop: 9450.0,
          bevegelser: [{ dato: '2026-01-15', belop: 0 }],
        }),
      ),
    ).toThrow('kan ikke være 0')
  })

  it('kaster fortsatt på negativ totalandel — validerTall er ikke løsnet opp', () => {
    expect(() =>
      validerOppgjor(
        medDetaljer({
          belop: -100.0,
          oppspart_akkumulert: 0,
          renteandel_i_fjor: 0,
          bevegelser: [{ dato: '2026-01-15', belop: -100.0 }],
        }),
      ),
    ).toThrow('ikke-negativt')
  })

  it('kaster på negativt oppspart beløp', () => {
    expect(() =>
      validerOppgjor(medDetaljer({ oppspart_akkumulert: -1, belop: 3949.0 })),
    ).toThrow('ikke-negativt')
  })

  it('kaster på mer enn to desimaler i en bevegelse', () => {
    expect(() =>
      validerOppgjor(
        medDetaljer({
          belop: 9450.001,
          bevegelser: [{ dato: '2026-01-15', belop: 0.001 }],
        }),
      ),
    ).toThrow()
  })

  // ─── Dato ─────────────────────────────────────────────────────────────────

  it('kaster når en bevegelse ligger utenfor snapshot-året', () => {
    // Året er snapshotets, aldri dagens dato. En bevegelse fra i fjor er enten
    // en feil i kilden eller en misforståelse av kontrakten — begge skal stoppe
    // importen, ikke filtreres bort stille.
    expect(() =>
      validerOppgjor(
        medDetaljer({
          bevegelser: [
            { dato: '2025-12-31', belop: 500.0 },
            { dato: '2026-02-15', belop: 500.0 },
            { dato: '2026-02-15', belop: 4500.0 },
            { dato: '2026-03-03', belop: -2000.0 },
          ],
        }),
      ),
    ).toThrow('utenfor snapshot-året')
  })

  it('kaster på ugyldig dato som Date ellers ville «foldet»', () => {
    // new Date('2026-02-30') gir 2026-03-02, ikke Invalid Date
    expect(() =>
      validerOppgjor(
        medDetaljer({
          belop: 9950.0,
          bevegelser: [{ dato: '2026-02-30', belop: 500.0 }],
        }),
      ),
    ).toThrow('ugyldig dato')
  })
})
