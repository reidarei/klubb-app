import { describe, it, expect } from 'vitest'
import { byggAgenda, type ArrangementRaad, type ProfilMedBursdag } from '@/lib/agenda-sortering'

// Pinner plasseringsregelen fra #640: en bursdag i dag skal løftes helt til
// topps på agendaen (egen bursdagerIDag-liste, rendret over «Ikke svart
// ennå» i page.tsx) — ikke bare øverst i «I dag»-seksjonen. Se
// «Seksjons-regler»-kommentaren i lib/agenda-sortering.ts.

// beregnBursdager sammenligner med lokale Date-getters (samme mønster som
// norskDatoNaa() i lib/dato.ts) — bygg derfor naa som en lokal midnatts-dato
// (ikke en UTC-ISO-streng) slik at 2026-04-25 faktisk regnes som "i dag"
// uavhengig av maskinens tidssone.
const NAA_FAST = new Date(2026, 3, 25)

function lagProfilMedBursdag(id: string, dato: string): ProfilMedBursdag {
  return {
    id,
    visningsnavn: `Testmann ${id}`,
    fodselsdato: dato,
    bilde_url: null,
    rolle: null,
  }
}

function lagArrangement(id: string, startTidspunkt: string): ArrangementRaad {
  return {
    id,
    type: 'moete',
    tittel: `Møte ${id}`,
    start_tidspunkt: startTidspunkt,
    oppmoetested: null,
    bilde_url: null,
    paameldinger: [],
  }
}

describe('byggAgenda — bursdag i dag løftes til topps (#640)', () => {
  it('bursdag i dag havner i bursdagerIDag, ikke i idag', () => {
    // fodselsdato-året er vilkårlig (1990) — det er kun MM-dd som avgjør
    // om bursdagen faller i dag, se beregnBursdager.
    const profiler = [lagProfilMedBursdag('p1', '1990-04-25')]

    const agenda = byggAgenda({
      arrangementer: [],
      ansvar: [],
      profilerMedBursdag: profiler,
      meg: 'meg',
      naa: NAA_FAST,
      aar: 2026,
    })

    expect(agenda.bursdagerIDag).toHaveLength(1)
    expect(agenda.bursdagerIDag[0].kind).toBe('bursdag')
    // Ingen duplikatvisning — bursdagen skal ikke også ligge i «idag».
    expect(agenda.idag.filter(i => i.kind === 'bursdag')).toHaveLength(0)
  })

  it('øvrige items i «idag» beholder sin innbyrdes rekkefølge når bursdagen filtreres ut', () => {
    // To møter samme dag + en bursdag. Bursdagen ligger alltid ETTER
    // arrangementene i byggAgenda sin alleItems (`[...arrItems, ...bursdagItems,
    // …]`), og «idag» sorteres ikke — rekkefølgen der er inndata-rekkefølgen på
    // arrangementene. Testen pinner at bursdag-filteret ikke rokker ved den.
    const tidlig = lagArrangement('a-tidlig', '2026-04-25T08:00:00.000Z')
    const sent = lagArrangement('a-sent', '2026-04-25T20:00:00.000Z')
    const profiler = [lagProfilMedBursdag('p1', '1990-04-25')]

    const agenda = byggAgenda({
      arrangementer: [tidlig, sent],
      ansvar: [],
      profilerMedBursdag: profiler,
      meg: 'meg',
      naa: NAA_FAST,
      aar: 2026,
    })

    expect(agenda.bursdagerIDag).toHaveLength(1)
    const idagIder = agenda.idag.map(i => i.data.id)
    expect(idagIder).toEqual(['a-tidlig', 'a-sent'])
  })

  it('bursdag i morgen havner i kommende, ikke i bursdagerIDag', () => {
    // 26. april er dagen etter NAA_FAST (25. april) — ren fremtid, skal ikke
    // lekke inn i topp-blokken som er forbeholdt selve dagen.
    const profiler = [lagProfilMedBursdag('p1', '1990-04-26')]

    const agenda = byggAgenda({
      arrangementer: [],
      ansvar: [],
      profilerMedBursdag: profiler,
      meg: 'meg',
      naa: NAA_FAST,
      aar: 2026,
    })

    expect(agenda.bursdagerIDag).toHaveLength(0)
    expect(agenda.kommende.filter(i => i.kind === 'bursdag')).toHaveLength(1)
  })
})
