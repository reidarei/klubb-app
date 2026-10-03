// Oppdiktede navn og beløp — denne fila speiles til det offentlige
// klubb-app-repoet, se CLAUDE.md § Policy: Synk til klubb-app.
import { describe, it, expect } from 'vitest'
import {
  formaterFondsrapport,
  parseFondsrapport,
  splittFondsrapport,
  lesFondsrapport,
  byggFondsrapport,
  refFor,
  forrigeFraFondsdata,
  kvartalFor,
  dupliserteProfilIder,
  forrigeKvartal,
  kvartalSlutt,
  heleKr,
  andelTekst,
  endringPst,
  kontantEndring,
  fargeToken,
  type Fondsrapport,
  type FondsrapportLinje,
} from '@/lib/fondsrapport'
import { INNLEGG_MAKS_LENGDE } from '@/lib/konstanter'

// 18 oppdiktede linjer — navn er padded til nøyaktig 20 tegn (realistisk
// verste-fall-lengde) slik at lengdetesten under er et reelt konservativt
// tall, ikke et tilfeldig kort eksempel. Beløp er strengt synkende slik at
// sorteringsrekkefølgen er entydig uten å måtte stole på navnesortering.
function lagLinjer(): FondsrapportLinje[] {
  const endringer: (number | 'ny')[] = [1370, 'ny', 0, -530]
  return Array.from({ length: 18 }, (_, i) => {
    const navn = `Kontonavn Nr. ${String(i + 1).padStart(2, '0')}`.padEnd(20, 'x')
    return {
      ref: (1000 + i).toString(16).padStart(8, '0'),
      navn,
      belop: 20000 - i * 731,
      endring: endringer[i % 4],
    }
  })
}

function lagRapport(): Fondsrapport {
  return {
    aar: 2026,
    kvartal: 3,
    perDato: '2026-09-26',
    kontanter: 24701,
    forrige: { aar: 2026, kvartal: 2, kontanter: 19551 },
    linjer: lagLinjer(),
  }
}

describe('formaterFondsrapport / parseFondsrapport — roundtrip', () => {
  it('parse(format(x)) er deepEqual x for 18 linjer (positiv, ny, ±0, negativ)', () => {
    const rapport = lagRapport()
    const tekst = formaterFondsrapport(rapport)
    expect(parseFondsrapport(tekst)).toEqual(rapport)
  })

  it('en blokk med 18 linjer og 20-tegns navn holder seg under INNLEGG_MAKS_LENGDE', () => {
    const tekst = formaterFondsrapport(lagRapport())
    // Pinnet eksakt tall — endres bevisst formatet (mer luft, endret
    // separator), skal denne testen si tydelig ifra i stedet for å drifte stille.
    expect(tekst.length).toBe(951)
    expect(tekst.length).toBeLessThan(INNLEGG_MAKS_LENGDE)
  })
})

describe('splittFondsrapport', () => {
  it('bevarer en hilsen på flere linjer', () => {
    const blokk = formaterFondsrapport(lagRapport())
    const innhold = `Gutta,\n\nHer er kvartalets tall.\nSe under.\n\n${blokk}`
    const { hilsen, blokk: funnetBlokk } = splittFondsrapport(innhold)
    expect(hilsen).toBe('Gutta,\n\nHer er kvartalets tall.\nSe under.')
    expect(funnetBlokk).toBe(blokk)
  })

  it('gir blokk: null når det ikke finnes noen header-linje', () => {
    const { hilsen, blokk } = splittFondsrapport('Bare en vanlig melding uten rapport.')
    expect(blokk).toBeNull()
    expect(hilsen).toBe('Bare en vanlig melding uten rapport.')
  })
})

describe('lesFondsrapport', () => {
  it('gir null for en ødelagt linje (mangler ~ref)', () => {
    const linjer = lagRapport()
    const tekst = formaterFondsrapport(linjer)
    const odelagt = tekst.replace(/ ~[0-9a-f]{8}$/m, '')
    expect(lesFondsrapport(odelagt)).toBeNull()
  })

  it('gir null for en blokk som ikke står sist', () => {
    const tekst = formaterFondsrapport(lagRapport())
    const innhold = `${tekst}\nDette er en etterskrift som ikke hører til blokken.`
    expect(lesFondsrapport(innhold)).toBeNull()
  })

  it('leser en gyldig rapport med hilsen', () => {
    const rapport = lagRapport()
    const tekst = formaterFondsrapport(rapport)
    const lest = lesFondsrapport(`Hei gutta!\n\n${tekst}`)
    expect(lest).not.toBeNull()
    expect(lest!.hilsen).toBe('Hei gutta!')
    expect(lest!.rapport).toEqual(rapport)
  })

  it('gir null for tomt/manglende innhold', () => {
    expect(lesFondsrapport(null)).toBeNull()
    expect(lesFondsrapport('')).toBeNull()
  })
})

describe('byggFondsrapport', () => {
  it('markerer «ny» når profilen mangler i forrige rapport', () => {
    const rapport = byggFondsrapport({
      aar: 2026,
      kvartal: 3,
      perDato: '2026-09-26',
      saldo: 5000,
      andeler: [{ profilId: 'aaaaaaaa-0000-0000-0000-000000000000', navn: 'Kjell', belopOere: 500000 }],
      forrige: { aar: 2026, kvartal: 2, kontanter: 0, perProfilOere: {} },
    })
    expect(rapport.linjer[0].endring).toBe('ny')
  })

  it('markerer «ny» når profilen hadde 0 i forrige rapport', () => {
    const rapport = byggFondsrapport({
      aar: 2026,
      kvartal: 3,
      perDato: '2026-09-26',
      saldo: 5000,
      andeler: [{ profilId: 'aaaaaaaa-0000-0000-0000-000000000000', navn: 'Kjell', belopOere: 500000 }],
      forrige: {
        aar: 2026,
        kvartal: 2,
        kontanter: 0,
        perProfilOere: { 'aaaaaaaa-0000-0000-0000-000000000000': 0 },
      },
    })
    expect(rapport.linjer[0].endring).toBe('ny')
  })

  it('regner endring som differansen mellom avrundede heltallskroner', () => {
    const rapport = byggFondsrapport({
      aar: 2026,
      kvartal: 3,
      perDato: '2026-09-26',
      saldo: 5000,
      andeler: [{ profilId: 'aaaaaaaa-0000-0000-0000-000000000000', navn: 'Kjell', belopOere: 794800 }],
      forrige: {
        aar: 2026,
        kvartal: 2,
        kontanter: 6348,
        perProfilOere: { 'aaaaaaaa-0000-0000-0000-000000000000': 634800 },
      },
    })
    expect(rapport.linjer[0].belop).toBe(7948)
    expect(rapport.linjer[0].endring).toBe(1600)
  })

  it('sorterer på beløp synkende, deretter navn', () => {
    const rapport = byggFondsrapport({
      aar: 2026,
      kvartal: 3,
      perDato: '2026-09-26',
      saldo: 100,
      andeler: [
        { profilId: 'bbbbbbbb-0000-0000-0000-000000000001', navn: 'Bjørn', belopOere: 100000 },
        { profilId: 'cccccccc-0000-0000-0000-000000000002', navn: 'Arne', belopOere: 200000 },
        { profilId: 'dddddddd-0000-0000-0000-000000000003', navn: 'Åse', belopOere: 100000 },
      ],
      forrige: { aar: 2026, kvartal: 2, kontanter: 0, perProfilOere: {} },
    })
    expect(rapport.linjer.map(l => l.navn)).toEqual(['Arne', 'Bjørn', 'Åse'])
  })

  it('kaster ved ref-kollisjon (to profil_id-er med samme 8-tegns slutt)', () => {
    expect(() =>
      byggFondsrapport({
        aar: 2026,
        kvartal: 3,
        perDato: '2026-09-26',
        saldo: 100,
        andeler: [
          { profilId: '11111111-1111-1111-1111-1111aaaaaaaa', navn: 'Kjell', belopOere: 100000 },
          { profilId: '22222222-2222-2222-2222-2222aaaaaaaa', navn: 'Geir', belopOere: 100000 },
        ],
        forrige: { aar: 2026, kvartal: 2, kontanter: 0, perProfilOere: {} },
      }),
    ).toThrow(/ref-kollisjon/i)
  })

  // Seed-profilene på test-instansen deler de første 8 hex-tegnene; ref-en
  // må derfor tas fra slutten, ellers kolliderer de (funnet av verifisereren).
  it('skiller seed-lignende UUID-er og roundtripper — egen linje matcher', () => {
    const idA = '00000000-0000-4000-8000-000000000002'
    const idB = '00000000-0000-4000-8000-000000000003'
    const rapport = byggFondsrapport({
      aar: 2026,
      kvartal: 3,
      perDato: '2026-09-26',
      saldo: 5000,
      andeler: [
        { profilId: idA, navn: 'Kjell', belopOere: 300000 },
        { profilId: idB, navn: 'Geir', belopOere: 200000 },
      ],
      forrige: { aar: 2026, kvartal: 2, kontanter: 0, perProfilOere: {} },
    })
    expect(refFor(idA)).toBe('00000002')
    expect(rapport.linjer.map(l => l.ref)).toEqual(['00000002', '00000003'])
    expect(parseFondsrapport(formaterFondsrapport(rapport))).toEqual(rapport)
    // Samme sammenligning som FondsrapportBlokk bruker for å utheve egen linje
    expect(rapport.linjer.filter(l => refFor(idB) === l.ref).map(l => l.navn)).toEqual(['Geir'])
  })
})

describe('forrigeFraFondsdata', () => {
  it('regner ut eksakte tall — bevegelser før/på/etter kvartalsslutt, med øre-avrunding', () => {
    const grunnlag = forrigeFraFondsdata({
      innskudd: [
        {
          profilId: 'kjell-id',
          dato: '2026-09-26',
          oppsparAkkumulert: 10000.0,
          renteandelIFjor: 250.33,
        },
        {
          profilId: 'geir-id',
          dato: '2026-09-26',
          oppsparAkkumulert: 5000.1,
          renteandelIFjor: 99.99,
        },
      ],
      bevegelser: [
        // Kjell: før, på og etter kvartalsslutt (30.06) — kun de to første skal telle med.
        { profilId: 'kjell-id', dato: '2026-03-15', belop: 500.0 },
        { profilId: 'kjell-id', dato: '2026-06-30', belop: 300.0 },
        { profilId: 'kjell-id', dato: '2026-07-15', belop: 1000.0 },
        // Geir: ett uttak før kvartalsslutt (skal telle), ett innskudd etter (skal ikke telle).
        { profilId: 'geir-id', dato: '2026-01-01', belop: -200.0 },
        { profilId: 'geir-id', dato: '2026-08-01', belop: 400.0 },
      ],
      kvartalSlutt: '2026-06-30',
    })

    // Kjell: 10000,00 + 250,33 + (500,00 + 300,00) = 11050,33 kr
    expect(grunnlag.perProfilOere['kjell-id']).toBe(1105033)
    // Geir: 5000,10 + 99,99 + (-200,00) = 4900,09 kr
    expect(grunnlag.perProfilOere['geir-id']).toBe(490009)
    // Total: (1105033 + 490009) øre = 15950,42 kr → avrundes til 15950
    expect(grunnlag.kontanter).toBe(15950)
    expect(grunnlag.aar).toBe(2026)
    expect(grunnlag.kvartal).toBe(2)
  })

  it('kaster hvis en innskuddsrads år avviker fra kvartalsslutten', () => {
    expect(() =>
      forrigeFraFondsdata({
        innskudd: [{ profilId: 'kjell-id', dato: '2027-01-10', oppsparAkkumulert: 100, renteandelIFjor: 0 }],
        bevegelser: [],
        kvartalSlutt: '2026-06-30',
      }),
    ).toThrow()
  })
})

describe('visningshjelpere', () => {
  it('heleKr grupperer med ASCII-mellomrom', () => {
    expect(heleKr(24701)).toBe('24 701 kr')
    expect(heleKr(500)).toBe('500 kr')
  })

  it('andelTekst gir «<1 %» når andelen runder til 0 % men er over 0', () => {
    expect(andelTekst(0.4)).toBe('<1 %')
    expect(andelTekst(0)).toBe('0 %')
    expect(andelTekst(50.6)).toBe('51 %')
  })

  it('endringPst gir null når forrige er 0', () => {
    expect(endringPst(100, 0)).toBeNull()
    expect(endringPst(120, 100)).toBe(20)
  })

  it('kontantEndring: 0 kr er nøytral — ingen pil-retning, ingen prosent', () => {
    expect(kontantEndring(24701, 24701, 2)).toEqual({ retning: 'uendret', belop: '±0 kr', sammenligning: 'siden Q2' })
    // Avrunder til 0 kr på kortet → også nøytral
    expect(kontantEndring(1000.3, 1000, 2).retning).toBe('uendret')
  })

  it('kontantEndring: opp og ned får fortegn i prosent (U+2212 for minus)', () => {
    expect(kontantEndring(1200, 1000, 2)).toEqual({ retning: 'opp', belop: '200 kr', sammenligning: '+20 % siden Q2' })
    expect(kontantEndring(900, 1000, 3)).toEqual({ retning: 'ned', belop: '100 kr', sammenligning: '−10 % siden Q3' })
    // Forrige 0 → udefinert prosent, kun beløp + «siden Qn»
    expect(kontantEndring(500, 0, 4)).toEqual({ retning: 'opp', belop: '500 kr', sammenligning: 'siden Q4' })
  })

  it('fargeToken deler siste token blant eiere utover FONDSRAPPORT_EGNE_FARGER', () => {
    expect(fargeToken(0)).toBe('var(--fond-farge-1)')
    expect(fargeToken(5)).toBe('var(--fond-farge-6)')
    expect(fargeToken(6)).toBe('var(--fond-farge-7)')
    expect(fargeToken(17)).toBe('var(--fond-farge-7)')
  })
})

describe('kvartalsmatte', () => {
  it('kvartalFor plasserer en dato i riktig kvartal', () => {
    expect(kvartalFor('2026-01-15')).toEqual({ aar: 2026, kvartal: 1 })
    expect(kvartalFor('2026-06-30')).toEqual({ aar: 2026, kvartal: 2 })
    expect(kvartalFor('2026-09-26')).toEqual({ aar: 2026, kvartal: 3 })
    expect(kvartalFor('2026-12-31')).toEqual({ aar: 2026, kvartal: 4 })
  })

  it('forrigeKvartal ruller over årsskiftet ved Q1', () => {
    expect(forrigeKvartal(2026, 1)).toEqual({ aar: 2025, kvartal: 4 })
    expect(forrigeKvartal(2026, 3)).toEqual({ aar: 2026, kvartal: 2 })
  })

  it('dupliserteProfilIder finner id-er som forekommer flere ganger, én gang hver', () => {
    expect(dupliserteProfilIder(['a', 'b', 'c'])).toEqual([])
    expect(dupliserteProfilIder(['a', 'b', 'a', 'a', 'c', 'b'])).toEqual(['a', 'b'])
    expect(dupliserteProfilIder([])).toEqual([])
  })

  it('kvartalSlutt gir siste kalenderdag i kvartalet', () => {
    expect(kvartalSlutt(2026, 1)).toBe('2026-03-31')
    expect(kvartalSlutt(2026, 2)).toBe('2026-06-30')
    expect(kvartalSlutt(2026, 4)).toBe('2026-12-31')
  })
})
