import { describe, it, expect } from 'vitest'
import { byggMaanedsGrid, harInnhold, harBursdag, byggTurMarkering, type TurPeriode } from '@/lib/mini-kalender'
import { norskDatoNokkel } from '@/lib/dato'

describe('byggMaanedsGrid', () => {
  it('juli 2026: 2 ledende null + 31 dager', () => {
    // 1. juli 2026 = onsdag (ISO day 3) → 2 ledende null-celler
    const grid = byggMaanedsGrid(2026, 6) // maaned0 = 6 = juli
    const nullCeller = grid.filter(c => c === null)
    const dagCeller = grid.filter(c => c !== null) as string[]

    expect(nullCeller).toHaveLength(2)
    expect(dagCeller).toHaveLength(31)
    expect(dagCeller[0]).toBe('2026-07-01')
    expect(dagCeller[dagCeller.length - 1]).toBe('2026-07-31')
  })

  it('februar 2028 (skuddår): 1 ledende null + 29 dager', () => {
    // 1. feb 2028 = tirsdag (ISO day 2) → 1 ledende null-celle
    // 2028 er skuddår (delelig med 4, ikke med 100)
    const grid = byggMaanedsGrid(2028, 1) // maaned0 = 1 = februar
    const nullCeller = grid.filter(c => c === null)
    const dagCeller = grid.filter(c => c !== null) as string[]

    expect(nullCeller).toHaveLength(1)
    expect(dagCeller).toHaveLength(29)
    expect(dagCeller[0]).toBe('2028-02-01')
    expect(dagCeller[dagCeller.length - 1]).toBe('2028-02-29')
  })

  it('juni 2026: 0 ledende null (1. juni = mandag)', () => {
    // 1. juni 2026 = mandag (ISO day 1) → 0 ledende null-celler
    const grid = byggMaanedsGrid(2026, 5) // maaned0 = 5 = juni
    const nullCeller = grid.filter(c => c === null)
    const dagCeller = grid.filter(c => c !== null) as string[]

    expect(nullCeller).toHaveLength(0)
    expect(dagCeller).toHaveLength(30)
    expect(dagCeller[0]).toBe('2026-06-01')
  })

  it('mars 2026: 6 ledende null (1. mars = søndag)', () => {
    // 1. mars 2026 = søndag (ISO day 7) → 6 ledende null-celler
    const grid = byggMaanedsGrid(2026, 2) // maaned0 = 2 = mars
    const nullCeller = grid.filter(c => c === null)
    const dagCeller = grid.filter(c => c !== null) as string[]

    expect(nullCeller).toHaveLength(6)
    expect(dagCeller).toHaveLength(31)
    expect(dagCeller[0]).toBe('2026-03-01')
    expect(dagCeller[dagCeller.length - 1]).toBe('2026-03-31')
  })
})

describe('harInnhold', () => {
  it('returnerer true når dato finnes i settet', () => {
    const sett = new Set(['2026-07-15', '2026-07-22'])
    expect(harInnhold('2026-07-15', sett)).toBe(true)
  })

  it('returnerer false når dato ikke finnes i settet', () => {
    const sett = new Set(['2026-07-15'])
    expect(harInnhold('2026-07-16', sett)).toBe(false)
  })

  it('returnerer false for tomt sett', () => {
    expect(harInnhold('2026-07-01', new Set())).toBe(false)
  })
})

describe('norskDatoNokkel — tidssone-kanttest', () => {
  it('UTC-tidspunkt som er 00:30 norsk sommertid gir neste dag', () => {
    // 2026-07-10T22:30:00Z = 11. juli 00:30 CEST (UTC+2)
    // Skal telle på 11. juli, ikke 10. juli
    expect(norskDatoNokkel('2026-07-10T22:30:00Z')).toBe('2026-07-11')
  })

  it('UTC-tidspunkt midt på dagen gir riktig norsk dag', () => {
    // 2026-07-15T12:00:00Z = 15. juli 14:00 CEST
    expect(norskDatoNokkel('2026-07-15T12:00:00Z')).toBe('2026-07-15')
  })

  it('vintertid: UTC 23:30 gir norsk dag +1', () => {
    // 2026-01-10T23:30:00Z = 11. januar 00:30 CET (UTC+1)
    expect(norskDatoNokkel('2026-01-10T23:30:00Z')).toBe('2026-01-11')
  })
})

describe('harBursdag (#429-oppfølging)', () => {
  it('matcher på måned-dag uavhengig av år', () => {
    const sett = new Set(['07-15', '12-24'])
    expect(harBursdag('2026-07-15', sett)).toBe(true)
    expect(harBursdag('2031-07-15', sett)).toBe(true) // annet år — fortsatt treff
    expect(harBursdag('2026-12-24', sett)).toBe(true)
    expect(harBursdag('2026-07-16', sett)).toBe(false)
  })

  it('tomt sett gir aldri treff', () => {
    expect(harBursdag('2026-07-15', new Set())).toBe(false)
  })
})

describe('byggTurMarkering', () => {
  // September 2026: 1. sep = tirsdag → 1 ledende null. Dag d havner på idx d.
  // Ukerad: idx%7===0 er mandag, idx%7===6 er søndag.
  const septemberGrid = byggMaanedsGrid(2026, 8) // maaned0 = 8 = september

  it('tur 14.-17. i én måned: avreise, to underveis, hjemkomst — alle koblet', () => {
    const perioder: TurPeriode[] = [{ start: '2026-09-14', slutt: '2026-09-17' }]
    const markering = byggTurMarkering(septemberGrid, perioder)

    const idx14 = septemberGrid.indexOf('2026-09-14')
    const idx15 = septemberGrid.indexOf('2026-09-15')
    const idx16 = septemberGrid.indexOf('2026-09-16')
    const idx17 = septemberGrid.indexOf('2026-09-17')

    expect(markering[idx14]).toEqual({ rolle: 'avreise', strekVenstre: null, strekHoeyre: 'bro' })
    expect(markering[idx15]).toEqual({ rolle: 'underveis', strekVenstre: 'bro', strekHoeyre: 'bro' })
    expect(markering[idx16]).toEqual({ rolle: 'underveis', strekVenstre: 'bro', strekHoeyre: 'bro' })
    expect(markering[idx17]).toEqual({ rolle: 'hjemkomst', strekVenstre: 'bro', strekHoeyre: null })

    // Dagen etter hjemkomst er ikke del av turen
    expect(markering[septemberGrid.indexOf('2026-09-18')]).toBeNull()
  })

  it('søndag→mandag: streken går helt ut til cellekanten på begge sider av radskiftet', () => {
    // 5.-8. sep 2026 = lørdag–tirsdag. Søndag (6.) er siste kolonne i sin
    // rad, mandag (7.) første i neste. Ingen bro over radgrensa, men 'kant'
    // så strekket leses som én tur og ikke to (#770-review).
    const perioder: TurPeriode[] = [{ start: '2026-09-05', slutt: '2026-09-08' }]
    const markering = byggTurMarkering(septemberGrid, perioder)

    const idxLor = septemberGrid.indexOf('2026-09-05')
    const idxSon = septemberGrid.indexOf('2026-09-06')
    const idxMan = septemberGrid.indexOf('2026-09-07')
    const idxTir = septemberGrid.indexOf('2026-09-08')

    expect(idxSon % 7).toBe(6) // søndag = siste kolonne
    expect(idxMan % 7).toBe(0) // mandag = første kolonne

    expect(markering[idxLor]).toEqual({ rolle: 'avreise', strekVenstre: null, strekHoeyre: 'bro' })
    expect(markering[idxSon]).toEqual({ rolle: 'underveis', strekVenstre: 'bro', strekHoeyre: 'kant' })
    expect(markering[idxMan]).toEqual({ rolle: 'underveis', strekVenstre: 'kant', strekHoeyre: 'bro' })
    expect(markering[idxTir]).toEqual({ rolle: 'hjemkomst', strekVenstre: 'bro', strekHoeyre: null })
  })

  it('tur uten sluttid: kun avreise, ingen strek', () => {
    const perioder: TurPeriode[] = [{ start: '2026-09-10', slutt: null }]
    const markering = byggTurMarkering(septemberGrid, perioder)
    const idx10 = septemberGrid.indexOf('2026-09-10')

    expect(markering[idx10]).toEqual({ rolle: 'avreise', strekVenstre: null, strekHoeyre: null })
    expect(markering[septemberGrid.indexOf('2026-09-09')]).toBeNull()
    expect(markering[septemberGrid.indexOf('2026-09-11')]).toBeNull()
  })

  it('endagstur (slutt === start): kun avreise, ingen strek', () => {
    const perioder: TurPeriode[] = [{ start: '2026-09-10', slutt: '2026-09-10' }]
    const markering = byggTurMarkering(septemberGrid, perioder)
    const idx10 = septemberGrid.indexOf('2026-09-10')

    expect(markering[idx10]).toEqual({ rolle: 'avreise', strekVenstre: null, strekHoeyre: null })
  })

  it('tur over månedsskifte (28. sep – 3. okt) ser riktig ut i begge grid', () => {
    const perioder: TurPeriode[] = [{ start: '2026-09-28', slutt: '2026-10-03' }]

    const septMarkering = byggTurMarkering(septemberGrid, perioder)
    const idx28 = septemberGrid.indexOf('2026-09-28')
    const idx29 = septemberGrid.indexOf('2026-09-29')
    const idx30 = septemberGrid.indexOf('2026-09-30')

    expect(septMarkering[idx28]).toEqual({ rolle: 'avreise', strekVenstre: null, strekHoeyre: 'bro' })
    expect(septMarkering[idx29]).toEqual({ rolle: 'underveis', strekVenstre: 'bro', strekHoeyre: 'bro' })
    // Siste dag i september-grid-et: turen fortsetter i oktober, så streken
    // går helt ut til cellekanten (ingen bro — naboen finnes ikke i gridet).
    expect(septMarkering[idx30]).toEqual({ rolle: 'underveis', strekVenstre: 'bro', strekHoeyre: 'kant' })

    // Oktober 2026: 1. okt = torsdag → 3 ledende null-celler.
    const oktoberGrid = byggMaanedsGrid(2026, 9)
    const oktMarkering = byggTurMarkering(oktoberGrid, perioder)
    const idxOkt1 = oktoberGrid.indexOf('2026-10-01')
    const idxOkt2 = oktoberGrid.indexOf('2026-10-02')
    const idxOkt3 = oktoberGrid.indexOf('2026-10-03')

    // 1. okt sin venstrenabo er en tom padding-celle, men turen startet i
    // september — streken skal derfor gå ut til venstre kant, ikke starte friskt.
    expect(oktMarkering[idxOkt1]).toEqual({ rolle: 'underveis', strekVenstre: 'kant', strekHoeyre: 'bro' })
    expect(oktMarkering[idxOkt2]).toEqual({ rolle: 'underveis', strekVenstre: 'bro', strekHoeyre: 'bro' })
    expect(oktMarkering[idxOkt3]).toEqual({ rolle: 'hjemkomst', strekVenstre: 'bro', strekHoeyre: null })
  })

  it('to tilstøtende, uavhengige turer smelter ikke sammen', () => {
    const perioder: TurPeriode[] = [
      { start: '2026-09-14', slutt: '2026-09-15' },
      { start: '2026-09-16', slutt: '2026-09-17' },
    ]
    const markering = byggTurMarkering(septemberGrid, perioder)

    const idx15 = septemberGrid.indexOf('2026-09-15') // hjemkomst, tur 1
    const idx16 = septemberGrid.indexOf('2026-09-16') // avreise, tur 2 — nabocelle

    expect(markering[idx15]).toEqual({ rolle: 'hjemkomst', strekVenstre: 'bro', strekHoeyre: null })
    expect(markering[idx16]).toEqual({ rolle: 'avreise', strekVenstre: null, strekHoeyre: 'bro' })
  })

  it('tilstøtende turer over radskifte: hjemkomst søndag og avreise mandag får ingen kant-strek', () => {
    // 6. sep = søndag, 7. sep = mandag. Begge turene slutter/starter her,
    // så ingen av sidene mot radgrensa skal ha strek.
    const perioder: TurPeriode[] = [
      { start: '2026-09-04', slutt: '2026-09-06' },
      { start: '2026-09-07', slutt: '2026-09-09' },
    ]
    const markering = byggTurMarkering(septemberGrid, perioder)
    expect(markering[septemberGrid.indexOf('2026-09-06')]).toEqual({ rolle: 'hjemkomst', strekVenstre: 'bro', strekHoeyre: null })
    expect(markering[septemberGrid.indexOf('2026-09-07')]).toEqual({ rolle: 'avreise', strekVenstre: null, strekHoeyre: 'bro' })
  })

  it('avreise på søndag: streken går ut til høyre kant, og mandagen tar den opp igjen', () => {
    const perioder: TurPeriode[] = [{ start: '2026-09-06', slutt: '2026-09-08' }]
    const markering = byggTurMarkering(septemberGrid, perioder)
    expect(markering[septemberGrid.indexOf('2026-09-06')]).toEqual({ rolle: 'avreise', strekVenstre: null, strekHoeyre: 'kant' })
    expect(markering[septemberGrid.indexOf('2026-09-07')]).toEqual({ rolle: 'underveis', strekVenstre: 'kant', strekHoeyre: 'bro' })
  })

  it('overlapp: dag som er hjemkomst for A og avreise for B får avreise, koblet til B', () => {
    const perioder: TurPeriode[] = [
      { start: '2026-09-08', slutt: '2026-09-10' }, // A
      { start: '2026-09-10', slutt: '2026-09-12' }, // B — deler 10. med A
    ]
    const markering = byggTurMarkering(septemberGrid, perioder)

    const idx9 = septemberGrid.indexOf('2026-09-09') // A, underveis
    const idx10 = septemberGrid.indexOf('2026-09-10') // delt dag
    const idx11 = septemberGrid.indexOf('2026-09-11') // B, underveis

    // Avreise vinner presedens over hjemkomst på den delte dagen.
    expect(markering[idx10]?.rolle).toBe('avreise')
    // Koblet til B (høyre), IKKE til A (venstre) — eier-indeksen avgjør,
    // ikke bare at nabocellen tilhører "en eller annen" tur.
    expect(markering[idx10]).toEqual({ rolle: 'avreise', strekVenstre: null, strekHoeyre: 'bro' })
    // A sin siste underveis-dag kobler dermed heller ikke videre til den delte dagen.
    expect(markering[idx9]?.strekHoeyre).toBeNull()
    expect(markering[idx11]).toEqual({ rolle: 'underveis', strekVenstre: 'bro', strekHoeyre: 'bro' })
  })

  it('ingen turer gir kun null-celler', () => {
    const markering = byggTurMarkering(septemberGrid, [])
    expect(markering.every(c => c === null)).toBe(true)
  })
})
