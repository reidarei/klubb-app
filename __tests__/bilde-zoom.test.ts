import { describe, it, expect } from 'vitest'
import {
  avstand,
  midtpunkt,
  nySkala,
  fokusJustering,
  klemPosisjon,
  sveipUtfall,
  snapp,
  MIN_SKALA,
  MAKS_SKALA,
  SVEIP_TERSKEL,
  SNAP_TOLERANSE,
} from '@/lib/bilde-zoom'

describe('sveipUtfall — zoom skal aldri stjele sveipet (#625)', () => {
  it('sveip venstre ved skala 1 bytter til neste', () => {
    expect(sveipUtfall(-80, 1)).toBe('neste')
  })

  it('sveip høyre ved skala 1 bytter til forrige', () => {
    expect(sveipUtfall(80, 1)).toBe('forrige')
  })

  it('sveip under terskelen gjør ingenting', () => {
    expect(sveipUtfall(-30, 1)).toBe('ingen')
  })

  it('nøyaktig på terskelen navigerer IKKE (sammenligningen er > , ikke >=)', () => {
    expect(sveipUtfall(SVEIP_TERSKEL, 1)).toBe('ingen')
    expect(sveipUtfall(SVEIP_TERSKEL + 1, 1)).toBe('forrige')
  })

  it('et zoomet bilde (skala > 1) navigerer aldri, uansett hvor stor draget er', () => {
    expect(sveipUtfall(-200, 2.5)).toBe('ingen')
  })
})

describe('nySkala — klemmes til [MIN_SKALA, MAKS_SKALA]', () => {
  it('klemmer til MIN_SKALA når pinchen krymper langt under startskalaen', () => {
    expect(nySkala(100, 10, 1)).toBe(MIN_SKALA)
  })

  it('klemmer til MAKS_SKALA når pinchen vokser langt over startskalaen', () => {
    expect(nySkala(100, 1000, 1)).toBe(MAKS_SKALA)
  })

  it('gir uklemt verdi innenfor grensene', () => {
    expect(nySkala(100, 200, 1)).toBe(2)
  })

  it('startDist <= 0 beholder startskalaen (klemt) i stedet for å dele på null', () => {
    // Kan oppstå hvis to pekere rapporterer nøyaktig samme koordinat ved
    // pinch-start. Uten vakten ville naaDist/startDist blitt Infinity/NaN.
    expect(nySkala(0, 120, 2)).toBe(2)
    expect(nySkala(-5, 120, 2)).toBe(2)
    expect(nySkala(0, 120, 0.4)).toBe(MIN_SKALA)
    expect(nySkala(0, 120, 99)).toBe(MAKS_SKALA)
  })
})

describe('klemPosisjon', () => {
  it('gir alltid {0, 0} ved skala 1 (bildet er aldri større enn viewet der)', () => {
    expect(klemPosisjon({ x: 40, y: 40 }, 1, 300, 300, 300, 300)).toEqual({ x: 0, y: 0 })
  })

  it('klemmer til nøyaktig (bildeBredde*skala - viewBredde)/2 ved skala 2', () => {
    const bildeB = 300
    const viewB = 300
    const skala = 2
    const maks = (bildeB * skala - viewB) / 2
    // Forsøker å dra langt forbi grensen i begge retninger
    expect(klemPosisjon({ x: 9999, y: 0 }, skala, bildeB, 300, viewB, 300)).toEqual({ x: maks, y: 0 })
    expect(klemPosisjon({ x: -9999, y: 0 }, skala, bildeB, 300, viewB, 300)).toEqual({ x: -maks, y: 0 })
  })

  it('gir 0 når bildet er smalere enn viewet, selv med forsøkt forskyvning', () => {
    // Et portrettbilde i et bredt view: bildeBredde < viewBredde -> maxX skal være 0
    expect(klemPosisjon({ x: 50, y: 0 }, 1, 100, 500, 400, 500)).toEqual({ x: 0, y: 0 })
  })
})

describe('fokusJustering — holder punktet under fingrene i ro', () => {
  it('skjermposisjonen til fokuspunktet er uendret før og etter en skalaendring', () => {
    const pos = 12
    const fokus = 87
    const gammelSkala = 1
    const ny = 2.5

    // Innholdspunktet (i uskalerte enheter, relativt sentrum) som lå under
    // fingeren ved gammelSkala/pos.
    const innholdOffset = (fokus - pos) / gammelSkala

    const nyPos = fokusJustering(pos, fokus, gammelSkala, ny)

    // Samme innholdspunkt, regnet ut på skjermen igjen med nyPos/ny — skal
    // fortsatt havne nøyaktig på fokus.
    const skjermPosEtter = nyPos + innholdOffset * ny
    expect(skjermPosEtter).toBeCloseTo(fokus, 10)
  })

  it('fokuspunktet holder seg i ro også når man zoomer ut igjen', () => {
    const pos = -30
    const fokus = -5
    const gammelSkala = 2.5
    const ny = 1

    const innholdOffset = (fokus - pos) / gammelSkala
    const nyPos = fokusJustering(pos, fokus, gammelSkala, ny)
    const skjermPosEtter = nyPos + innholdOffset * ny
    expect(skjermPosEtter).toBeCloseTo(fokus, 10)
  })
})

describe('snapp', () => {
  it('snapper til nøyaktig 1 når skalaen er svært nær 1', () => {
    expect(snapp(1.01)).toBe(1)
  })

  it('lar en tydelig zoomet skala stå uendret', () => {
    expect(snapp(1.5)).toBe(1.5)
  })

  it('grensen går nøyaktig ved SNAP_TOLERANSE (strengt mindre enn snapper)', () => {
    expect(snapp(MIN_SKALA + SNAP_TOLERANSE / 2)).toBe(MIN_SKALA)
    expect(snapp(MIN_SKALA - SNAP_TOLERANSE / 2)).toBe(MIN_SKALA)
    // Akkurat PÅ toleransen skal ikke snappe — ellers er sveip-sperren av
    // mens brukeren fortsatt er (så vidt) zoomet inn.
    expect(snapp(MIN_SKALA + SNAP_TOLERANSE)).toBe(MIN_SKALA + SNAP_TOLERANSE)
  })
})

describe('avstand og midtpunkt', () => {
  it('avstand er Math.hypot mellom to punkter', () => {
    expect(avstand({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })

  it('midtpunkt er gjennomsnittet av to punkter', () => {
    expect(midtpunkt({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 })
  })
})
