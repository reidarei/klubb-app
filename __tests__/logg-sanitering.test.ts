// Pinner saniteringen av klient-innsendt feilkontekst (lib/logg-sanitering.ts).
//
// Bakgrunn: fire rader i feil_logg i august 2026 sto med ressurs-URL-en
// «https://www.klubb.example.comhttps://www.klubb.example.com/992a…».
// Den så ut som en korrupt URL fra appen, men var loggens egen: `origin +
// pathname` på en blob:-URL limer den indre originen på to ganger. En logg som
// lyver om hva som feilet er verre enn ingen logg — derfor testes formen her.

import { describe, it, expect } from 'vitest'
import { saniterVerdi, scrubKontekst } from '@/lib/logg-sanitering'

describe('saniterVerdi – ressurs', () => {
  it('beholder origin for vanlige http(s)-assets — «hvilken host svarte ikke» er halve svaret', () => {
    expect(saniterVerdi('ressurs', 'https://bilder.eksempel.no/album/x.jpg')).toBe(
      'https://bilder.eksempel.no/album/x.jpg',
    )
  })

  it('stripper query — signerte URL-er kan bære token', () => {
    expect(saniterVerdi('ressurs', 'https://bilder.eksempel.no/x.jpg?token=hemmelig')).toBe(
      'https://bilder.eksempel.no/x.jpg',
    )
  })

  it('gir bare pathname for relative URL-er, aldri sentinel-originen', () => {
    const ut = saniterVerdi('ressurs', '/_next/static/chunks/main.js')
    expect(ut).toBe('/_next/static/chunks/main.js')
    expect(ut).not.toContain('x.invalid')
  })

  it('dobler ikke originen på blob:-URL-er', () => {
    // Selve regresjonen. For blob: arves origin fra den indre URL-en, OG hele
    // den indre URL-en ligger i pathname — origin + pathname ga da
    // «https://hosthttps://host/uuid».
    const ut = saniterVerdi(
      'ressurs',
      'blob:https://eksempel.no/992a6f7d-60c1-49de-96b4-12166ca169f2',
    )
    expect(ut).toBe('blob:https://eksempel.no/992a6f7d-60c1-49de-96b4-12166ca169f2')
    expect(ut).not.toContain('nohttps://')
  })

  it('beholder blob:-protokollen — uten den er raden ikke til å skille fra en ekte nettverksfeil', () => {
    // Diagnostisk hele poenget: en blob: som ikke lastet er en lokal
    // forhåndsvisning i opplastingsflyten, ikke en asset som ikke kom over nett.
    expect(String(saniterVerdi('ressurs', 'blob:https://eksempel.no/abc'))).toMatch(/^blob:/)
  })

  it('kaster bort data:-payloaden og beholder kun mediatypen', () => {
    // Payloaden ER filen — potensielt et bilde av et medlem, og gjerne megabytes.
    expect(
      saniterVerdi('ressurs', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'),
    ).toBe('data:image/png;base64')
  })

  it('trunkerer absurd lange ressurs-strenger', () => {
    const lang = 'https://eksempel.no/' + 'a'.repeat(500)
    expect(String(saniterVerdi('ressurs', lang)).length).toBeLessThanOrEqual(201)
  })
})

describe('saniterVerdi – url', () => {
  it('beholder kun pathname — query kan bære e-post, token, navn', () => {
    expect(saniterVerdi('url', 'https://eksempel.no/profil?epost=x@y.no')).toBe('/profil')
  })
})

describe('saniterVerdi – maal (#681)', () => {
  it('blir pathname, akkurat som url — query strippes', () => {
    expect(
      saniterVerdi('maal', 'https://eksempel.no/arrangementer/abc?token=hemmelig'),
    ).toBe('/arrangementer/abc')
  })
})

describe('saniterVerdi – korte enum-felter trunkeres (#681)', () => {
  // kilde/handling/synlighet er klient-kontrollerte: de SKAL være korte enums,
  // men en buggy eller ondsinnet klient kan sende KB med søppel. Fjernes en av
  // dem fra trunker-grenen i saniterVerdi(), blir denne testen rød.
  it.each(['kilde', 'handling', 'synlighet'])('kapper en 300-tegns %s', (felt) => {
    const resultat = saniterVerdi(felt, 'a'.repeat(300)) as string
    expect(resultat).toBe('a'.repeat(200) + '…')
  })
})

describe('scrubKontekst – push.klikk-kontekst (#681)', () => {
  it('slipper gjennom hele push.klikk-konteksten uendret, bortsett fra maal', () => {
    expect(
      scrubKontekst({
        maal: 'https://eksempel.no/arrangementer/abc?token=hemmelig',
        hadde_maal: true,
        antall_klienter: 2,
        synlig_klient: false,
        handling: 'openWindow',
      }),
    ).toEqual({
      maal: '/arrangementer/abc',
      hadde_maal: true,
      antall_klienter: 2,
      synlig_klient: false,
      handling: 'openWindow',
    })
  })

  it('slipper gjennom hele push.klikk.navigert-konteksten uendret', () => {
    expect(
      scrubKontekst({ kilde: 'broadcast', allerede_paa_maal: true, synlighet: 'visible' }),
    ).toEqual({ kilde: 'broadcast', allerede_paa_maal: true, synlighet: 'visible' })
  })
})

describe('scrubKontekst', () => {
  it('slipper gjennom whitelistede felter og stripper resten', () => {
    expect(
      scrubKontekst({ message: 'noe', appversjon: 'V3.5.44', navn_paa_medlem: 'Reidar' }),
    ).toEqual({ message: 'noe', appversjon: 'V3.5.44' })
  })

  it('lar ikke-strenger passere urørt', () => {
    expect(scrubKontekst({ online: true, count: 3 })).toEqual({ online: true, count: 3 })
  })

  it('returnerer tomt objekt for ikke-objekter', () => {
    expect(scrubKontekst(null)).toEqual({})
    expect(scrubKontekst('streng')).toEqual({})
  })
})
