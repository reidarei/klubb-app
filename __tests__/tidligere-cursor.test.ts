import { describe, it, expect } from 'vitest'
import {
  dekodeCursor,
  enkodeCursor,
  nestePosisjon,
  harMerFraKilde,
  byggNesteCursor,
  type TidligereCursor,
  type KildeTilstand,
  type Posisjon,
} from '@/lib/tidligere-cursor'

const TOM: TidligereCursor = { a: null, m: null, p: null }

const GYLDIG_ISO = '2024-06-01T12:00:00Z'
const GYLDIG_ISO_MS = '2024-06-01T12:00:00.123Z'
const GYLDIG_ISO_TZ = '2024-06-01T12:00:00+02:00'
const GYLDIG_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef0123456789'
const ANNEN_UUID = '11111111-2222-3333-4444-555555555555'

describe('enkodeCursor + dekodeCursor', () => {
  it('roundtrip for full cursor', () => {
    const c: TidligereCursor = {
      a: [GYLDIG_ISO, GYLDIG_UUID],
      m: [GYLDIG_ISO_MS, ANNEN_UUID],
      p: [GYLDIG_ISO_TZ, GYLDIG_UUID],
    }
    expect(dekodeCursor(enkodeCursor(c))).toEqual(c)
  })

  it('roundtrip for cursor med null-felt', () => {
    const c: TidligereCursor = { a: [GYLDIG_ISO, GYLDIG_UUID], m: null, p: null }
    expect(dekodeCursor(enkodeCursor(c))).toEqual(c)
  })

  it('roundtrip for helt tom cursor', () => {
    expect(dekodeCursor(enkodeCursor(TOM))).toEqual(TOM)
  })
})

describe('dekodeCursor — defaults ved feilinput', () => {
  it('undefined → tom', () => {
    expect(dekodeCursor(undefined)).toEqual(TOM)
  })

  it('tom streng → tom', () => {
    expect(dekodeCursor('')).toEqual(TOM)
  })

  it('ugyldig base64 → tom', () => {
    // «!!!» er ikke gyldig base64url
    expect(dekodeCursor('!!!not-base64!!!')).toEqual(TOM)
  })

  it('gyldig base64 men ugyldig JSON → tom', () => {
    const ikkeJson = Buffer.from('dette er ikke json', 'utf8').toString('base64url')
    expect(dekodeCursor(ikkeJson)).toEqual(TOM)
  })

  it('JSON uten forventede felt → tom', () => {
    const tomtObj = Buffer.from('{}', 'utf8').toString('base64url')
    expect(dekodeCursor(tomtObj)).toEqual(TOM)
  })

  it('feil typer på feltene → tom', () => {
    const feilTyper = Buffer.from(
      JSON.stringify({ a: 'streng', m: 123, p: { foo: 'bar' } }),
      'utf8',
    ).toString('base64url')
    expect(dekodeCursor(feilTyper)).toEqual(TOM)
  })

  it('par av feil lengde → den feltet blir null', () => {
    const feilLengde = Buffer.from(
      JSON.stringify({ a: [GYLDIG_ISO], m: null, p: null }),
      'utf8',
    ).toString('base64url')
    expect(dekodeCursor(feilLengde)).toEqual(TOM)
  })

  it('par med tall i stedet for streng → null', () => {
    const tallIPar = Buffer.from(
      JSON.stringify({ a: [123, GYLDIG_UUID], m: null, p: null }),
      'utf8',
    ).toString('base64url')
    expect(dekodeCursor(tallIPar)).toEqual(TOM)
  })

  it('ISO med komma → null (filter-injection-forsøk avvist)', () => {
    // Bruker prøver å injisere ekstra PostgREST-filter via komma
    const injection = Buffer.from(
      JSON.stringify({
        a: [`${GYLDIG_ISO},id.eq.evil`, GYLDIG_UUID],
        m: null,
        p: null,
      }),
      'utf8',
    ).toString('base64url')
    expect(dekodeCursor(injection)).toEqual(TOM)
  })

  it('ISO med parentes → null', () => {
    const med_parens = Buffer.from(
      JSON.stringify({ a: [`${GYLDIG_ISO})or(true`, GYLDIG_UUID], m: null, p: null }),
      'utf8',
    ).toString('base64url')
    expect(dekodeCursor(med_parens)).toEqual(TOM)
  })

  it('ikke-UUID i id-felt → null', () => {
    const ikkeUuid = Buffer.from(
      JSON.stringify({ a: [GYLDIG_ISO, 'bare-noe-tull'], m: null, p: null }),
      'utf8',
    ).toString('base64url')
    expect(dekodeCursor(ikkeUuid)).toEqual(TOM)
  })

  it('UUID med komma → null', () => {
    const injectionUuid = Buffer.from(
      JSON.stringify({
        a: [GYLDIG_ISO, `${GYLDIG_UUID},id.eq.evil`],
        m: null,
        p: null,
      }),
      'utf8',
    ).toString('base64url')
    expect(dekodeCursor(injectionUuid)).toEqual(TOM)
  })

  it('delvis gyldig — gyldige felt beholdes, ugyldige blir null', () => {
    const blandet = Buffer.from(
      JSON.stringify({
        a: [GYLDIG_ISO, GYLDIG_UUID],
        m: ['ikke-iso', GYLDIG_UUID],
        p: [GYLDIG_ISO_MS, 'ikke-uuid'],
      }),
      'utf8',
    ).toString('base64url')
    expect(dekodeCursor(blandet)).toEqual({
      a: [GYLDIG_ISO, GYLDIG_UUID],
      m: null,
      p: null,
    })
  })
})

// === nestePosisjon / harMerFraKilde / byggNesteCursor (#488) ===

// Default: en «tom» kilde uten cursor og uten data, brukes som utgangspunkt
// og overstyres per test med Partial-lignende spread.
const kilde = (overrides: Partial<KildeTilstand>): KildeTilstand => ({
  inn: null,
  antallISidevindu: 0,
  antallEmittert: 0,
  sisteEmittert: null,
  flereEnnSiden: false,
  ...overrides,
})

describe('nestePosisjon', () => {
  it('bruker sisteEmittert når den finnes', () => {
    const k = kilde({ inn: [GYLDIG_ISO, GYLDIG_UUID], sisteEmittert: [GYLDIG_ISO_MS, ANNEN_UUID] })
    expect(nestePosisjon(k)).toEqual([GYLDIG_ISO_MS, ANNEN_UUID])
  })

  it('faller tilbake til inn når ingenting ble emittert', () => {
    const k = kilde({ inn: [GYLDIG_ISO, GYLDIG_UUID], sisteEmittert: null })
    expect(nestePosisjon(k)).toEqual([GYLDIG_ISO, GYLDIG_UUID])
  })

  it('forblir null når verken inn eller sisteEmittert finnes', () => {
    const k = kilde({})
    expect(nestePosisjon(k)).toBeNull()
  })
})

describe('harMerFraKilde', () => {
  it('true når flereEnnSiden er true', () => {
    const k = kilde({ antallISidevindu: 30, antallEmittert: 30, flereEnnSiden: true })
    expect(harMerFraKilde(k)).toBe(true)
  })

  it('true når emittert er færre enn lest (kastet i merge-klippingen), selv uten flereEnnSiden', () => {
    const k = kilde({ inn: null, antallISidevindu: 5, antallEmittert: 0, flereEnnSiden: false })
    expect(harMerFraKilde(k)).toBe(true)
  })

  it('false når alt som ble lest også ble emittert og det ikke var flere enn siden', () => {
    const k = kilde({ antallISidevindu: 12, antallEmittert: 12, flereEnnSiden: false })
    expect(harMerFraKilde(k)).toBe(false)
  })

  it('false når kilden er helt avskrudd av filteret (ingenting lest)', () => {
    const k = kilde({ inn: null, antallISidevindu: 0, antallEmittert: 0, flereEnnSiden: false })
    expect(harMerFraKilde(k)).toBe(false)
  })
})

describe('byggNesteCursor', () => {
  it('#488-symptomet: én kilde uttømt (alt lest og emittert, ikke flereEnnSiden) → null, ikke «Last mer»', () => {
    const uttoemt = kilde({ antallISidevindu: 5, antallEmittert: 5, sisteEmittert: [GYLDIG_ISO, GYLDIG_UUID], flereEnnSiden: false })
    expect(byggNesteCursor({ a: uttoemt, m: uttoemt, p: uttoemt })).toBeNull()
  })

  it('flereEnnSiden true → cursor bygges med posisjon fra siste emitterte', () => {
    const harMer = kilde({
      antallISidevindu: 30,
      antallEmittert: 30,
      sisteEmittert: [GYLDIG_ISO, GYLDIG_UUID],
      flereEnnSiden: true,
    })
    const tom = kilde({})
    const cursor = byggNesteCursor({ a: harMer, m: tom, p: tom })
    expect(cursor).not.toBeNull()
    expect(dekodeCursor(cursor!).a).toEqual([GYLDIG_ISO, GYLDIG_UUID])
  })

  it('regresjon mot issuets forslag: emittert < lest med inn=null gir fortsatt mer, posisjon forblir null', () => {
    // Simulerer at 5 rader av denne typen ble lest, men alle ble kastet i
    // merge-klippingen (andre typer fylte opp siden). inn er null (leste fra
    // toppen). Riktig oppførsel: harMerFraKilde = true (det finnes uviste
    // rader), men posisjonen skal IKKE hoppe fremover — vi har ikke vist noe
    // av denne typen ennå, så neste side skal fortsatt starte fra toppen.
    const delvisSkjult = kilde({ inn: null, antallISidevindu: 5, antallEmittert: 0, flereEnnSiden: false })
    const tom = kilde({})
    expect(harMerFraKilde(delvisSkjult)).toBe(true)
    const cursor = byggNesteCursor({ a: delvisSkjult, m: tom, p: tom })
    expect(cursor).not.toBeNull()
    expect(dekodeCursor(cursor!).a).toBeNull()
  })

  it('regresjon mot duplikater: én kilde uttømt mens en annen har mer → den uttømte kildens posisjon beholdes (ikke null)', () => {
    const uttoemtMedHistorikk = kilde({
      inn: [GYLDIG_ISO, GYLDIG_UUID],
      antallISidevindu: 3,
      antallEmittert: 3,
      sisteEmittert: [GYLDIG_ISO_MS, ANNEN_UUID],
      flereEnnSiden: false,
    })
    const harFortsattMer = kilde({
      antallISidevindu: 30,
      antallEmittert: 30,
      sisteEmittert: [GYLDIG_ISO_TZ, GYLDIG_UUID],
      flereEnnSiden: true,
    })
    const cursor = byggNesteCursor({ a: uttoemtMedHistorikk, m: harFortsattMer, p: kilde({}) })
    expect(cursor).not.toBeNull()
    // Uttømt kilde beholder sin siste posisjon — nullstilles IKKE, for det
    // ville betydd «start fra toppen» og gitt duplikater ved neste side.
    expect(dekodeCursor(cursor!).a).toEqual([GYLDIG_ISO_MS, ANNEN_UUID])
    expect(dekodeCursor(cursor!).m).toEqual([GYLDIG_ISO_TZ, GYLDIG_UUID])
  })

  it('regresjon mot latent feil i tidligere else-gren: ingenting emittert, inn non-null, ikke flereEnnSiden → posisjon = inn, ikke null', () => {
    const k = kilde({ inn: [GYLDIG_ISO, GYLDIG_UUID], antallISidevindu: 0, antallEmittert: 0, flereEnnSiden: false })
    // Denne kilden er faktisk uttømt (harMerFraKilde = false), men en annen
    // kilde driver pagineringen videre — da må denne kildens posisjon IKKE
    // hoppe til null, for det ville restarte typen fra toppen neste gang en
    // av de andre kildene skulle tømmes videre.
    const harFortsattMer = kilde({ antallISidevindu: 30, antallEmittert: 30, sisteEmittert: [GYLDIG_ISO_MS, ANNEN_UUID], flereEnnSiden: true })
    const cursor = byggNesteCursor({ a: k, m: harFortsattMer, p: kilde({}) })
    expect(dekodeCursor(cursor!).a).toEqual([GYLDIG_ISO, GYLDIG_UUID])
  })

  it('alle tre kilder uttømt → null', () => {
    const tom = kilde({})
    expect(byggNesteCursor({ a: tom, m: tom, p: tom })).toBeNull()
  })

  it('roundtrip: posisjonene fra byggNesteCursor kommer tilbake uendret via dekodeCursor', () => {
    const a = kilde({ antallISidevindu: 30, antallEmittert: 30, sisteEmittert: [GYLDIG_ISO, GYLDIG_UUID], flereEnnSiden: true })
    const m = kilde({ antallISidevindu: 10, antallEmittert: 10, sisteEmittert: [GYLDIG_ISO_MS, ANNEN_UUID], flereEnnSiden: false })
    const p = kilde({ inn: [GYLDIG_ISO_TZ, GYLDIG_UUID], antallISidevindu: 0, antallEmittert: 0, flereEnnSiden: false })
    const cursor = byggNesteCursor({ a, m, p })
    expect(cursor).not.toBeNull()
    expect(dekodeCursor(cursor!)).toEqual({
      a: [GYLDIG_ISO, GYLDIG_UUID],
      m: [GYLDIG_ISO_MS, ANNEN_UUID],
      p: [GYLDIG_ISO_TZ, GYLDIG_UUID],
    })
  })
})

// === Ende-til-ende: paginer et helt datasett gjennom flere sider (#488) ===
//
// Primitivene over dekkes hver for seg, men det var den SAMMENSATTE
// oppførselen som var ødelagt på main: tomme sluttsider, duplikater og
// kjøringer som aldri terminerte. Simulatoren under speiler
// page.tsx-løkka (les N+1 per kilde → klipp til N → merge → klipp til N →
// bygg cursor) og låser invariantene den brøt.
//
// Bevisst deterministisk: ingen tilfeldige seeds. Datasettene bygges av
// formler, så en rød test i CI er reproduserbar lokalt.

const SIDESTOERRELSE = 30

type Kind = 'a' | 'm' | 'p'
type Rad = { iso: string; id: string; kind: Kind }

// Distinkt hex-prefiks per type så id-er aldri kolliderer på tvers av kilder.
const HEX_PREFIKS: Record<Kind, string> = { a: '1', m: '2', p: '3' }
const lagId = (kind: Kind, n: number) =>
  `${HEX_PREFIKS[kind].repeat(8)}-0000-0000-0000-${String(n).padStart(12, '0')}`

// Bygger en kilde sortert synkende på (iso, id) — samme rekkefølge som
// .order('<tid>', desc).order('id', desc) gir fra Postgres.
// `minuttSteg`/`minuttOffset` styrer hvordan kildene fletter seg inn i
// hverandre; like verdier gir kolliderende tidsstempler (tiebreak på id).
function lagKilde(kind: Kind, antall: number, minuttSteg: number, minuttOffset = 0): Rad[] {
  const basis = Date.UTC(2024, 0, 1, 0, 0, 0)
  return Array.from({ length: antall }, (_, i) => ({
    kind,
    id: lagId(kind, i),
    iso: new Date(basis + (minuttOffset + i * minuttSteg) * 60_000).toISOString(),
  })).sort(sorterSynkende)
}

const sorterSynkende = (x: Rad, y: Rad) =>
  y.iso.localeCompare(x.iso) || y.id.localeCompare(x.id)

// Keyset-filteret fra page.tsx: strengt eldre enn cursor-posisjonen,
// med id som tiebreaker på likt tidsstempel.
const etterPosisjon = (rader: Rad[], pos: Posisjon | null) =>
  pos === null ? rader : rader.filter(r => r.iso < pos[0] || (r.iso === pos[0] && r.id < pos[1]))

function paginer(kilder: Record<Kind, Rad[]>, maksSider: number) {
  const sider: Rad[][] = []
  let cursor: TidligereCursor = { a: null, m: null, p: null }

  for (let n = 0; n < maksSider; n++) {
    const tilstander = {} as Record<Kind, KildeTilstand>
    const lest = {} as Record<Kind, Rad[]>

    for (const kind of ['a', 'm', 'p'] as const) {
      // Hent sidestørrelse+1 for å vite om det finnes mer bak siden
      const raad = etterPosisjon(kilder[kind], cursor[kind]).slice(0, SIDESTOERRELSE + 1)
      lest[kind] = raad.slice(0, SIDESTOERRELSE)
      tilstander[kind] = {
        inn: cursor[kind],
        antallISidevindu: lest[kind].length,
        antallEmittert: 0, // fylles etter merge
        sisteEmittert: null,
        flereEnnSiden: raad.length > SIDESTOERRELSE,
      }
    }

    const side = [...lest.a, ...lest.m, ...lest.p].sort(sorterSynkende).slice(0, SIDESTOERRELSE)
    sider.push(side)

    for (const kind of ['a', 'm', 'p'] as const) {
      const emittert = side.filter(r => r.kind === kind)
      tilstander[kind].antallEmittert = emittert.length
      const siste = emittert.at(-1)
      tilstander[kind].sisteEmittert = siste ? [siste.iso, siste.id] : null
    }

    const neste = byggNesteCursor(tilstander)
    if (neste === null) return { sider, terminert: true }
    cursor = dekodeCursor(neste)
  }

  return { sider, terminert: false }
}

describe('ende-til-ende-paginering', () => {
  const datasett: { navn: string; kilder: Record<Kind, Rad[]> }[] = [
    {
      // Jevn blanding hvor alle tre typene fletter seg inn i hverandre
      navn: 'blandet: 37 arrangementer, 45 meldinger, 12 polls',
      kilder: { a: lagKilde('a', 37, 3), m: lagKilde('m', 45, 2, 1), p: lagKilde('p', 12, 11, 2) },
    },
    {
      // Én kilde dominerer helt: de to m-radene er eldst og blir klippet bort
      // i merge side etter side. Det er nettopp her «emittert < i sidevindu»
      // må holde lenka synlig uten å flytte m-posisjonen.
      navn: 'dominerende kilde: 80 arrangementer, 2 gamle meldinger, 0 polls',
      kilder: { a: lagKilde('a', 80, 5, 1000), m: lagKilde('m', 2, 5), p: [] },
    },
    {
      // Alle tre kildene har identiske tidsstempler → all sortering avgjøres
      // av id-tiebreakeren. 90 rader = nøyaktig 3 fulle sider, så en
      // off-by-one gir umiddelbart en tom fjerde side.
      navn: 'kolliderende tidsstempler: 30/30/30, eksakt 3 fulle sider',
      kilder: { a: lagKilde('a', 30, 1), m: lagKilde('m', 30, 1), p: lagKilde('p', 30, 1) },
    },
    {
      // Ikke-overlappende tidsbånd: pollene er alle nyere enn arrangementene,
      // som igjen er nyere enn meldingene. Da tømmes én kilde helt mens de
      // andre fortsatt har mer — scenariet hvor en nullstilt posisjon ville
      // restarte kilden fra toppen og gi duplikater side etter side.
      navn: 'lagdelt: 8 ferske polls, så 50 arrangementer, så 20 gamle meldinger',
      kilder: { a: lagKilde('a', 50, 3, 100), m: lagKilde('m', 20, 1), p: lagKilde('p', 8, 1, 5000) },
    },
    {
      navn: 'kun én kilde, nøyaktig én full side',
      kilder: { a: lagKilde('a', 30, 1), m: [], p: [] },
    },
    {
      navn: 'helt tomt datasett',
      kilder: { a: [], m: [], p: [] },
    },
  ]

  for (const { navn, kilder } of datasett) {
    describe(navn, () => {
      const alle = [...kilder.a, ...kilder.m, ...kilder.p]
      // Rikelig takhøyde: med sidestørrelse 30 skal selv 112 rader være unnagjort
      // på ~4 sider. Treffer vi taket, er det den uendelige løkka fra main.
      const maksSider = 25
      const { sider, terminert } = paginer(kilder, maksSider)
      const emitterteIder = sider.flat().map(r => r.id)

      it('terminerer i stedet for å løkke i det uendelige', () => {
        expect(terminert).toBe(true)
        expect(sider.length).toBeLessThan(maksSider)
      })

      it('viser ingen rad mer enn én gang', () => {
        expect(new Set(emitterteIder).size).toBe(emitterteIder.length)
      })

      it('mister ingen rader — alt i kildene blir vist', () => {
        expect(new Set(emitterteIder)).toEqual(new Set(alle.map(r => r.id)))
      })

      it('siste side er ikke tom (#488-symptomet)', () => {
        // Unntak: et tomt datasett gir én tom side og ingen «Last mer»
        if (alle.length === 0) {
          expect(sider).toHaveLength(1)
          expect(sider[0]).toHaveLength(0)
          return
        }
        expect(sider.at(-1)!.length).toBeGreaterThan(0)
      })

      it('rekkefølgen er global synkende på tvers av sider', () => {
        const flat = sider.flat()
        const sortert = [...flat].sort(sorterSynkende)
        expect(flat.map(r => r.id)).toEqual(sortert.map(r => r.id))
      })
    })
  }
})
