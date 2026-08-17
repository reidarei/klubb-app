import { describe, it, expect } from 'vitest'
import { byggEndringslogg, MINDRE_TEKST, type Endring } from '@/lib/endringslogg'
import { ENDRINGER } from '@/lib/endringslogg-data'
import versjon from '@/lib/versjon.json'

describe('byggEndringslogg — fixtures', () => {
  it('tom input gir tom liste, uansett gjeldende versjon', () => {
    expect(byggEndringslogg([], 'V3.5.34')).toEqual([])
  })

  it('hopper over uparsbare oppføringer', () => {
    const endringer: Endring[] = [
      { versjon: 'ikke-en-versjon', dato: '2026-01-01', tekst: 'skal ikke med' },
      { versjon: 'V3.5.10', dato: '2026-08-01', tekst: 'Gyldig oppføring' },
    ]
    const rader = byggEndringslogg(endringer, 'V3.5.10')
    expect(rader.map(r => r.tekst)).toEqual(['Gyldig oppføring'])
  })

  it('ett tall vises uten spenn-etikett', () => {
    const endringer: Endring[] = [{ versjon: 'V3.5.10', dato: '2026-08-01', tekst: 'X' }]
    const rader = byggEndringslogg(endringer, 'V3.5.10')
    expect(rader).toHaveLength(1)
    expect(rader[0].visning).toBe('V3.5.10')
    expect(rader[0].mindre).toBe(false)
    expect(rader[0].dato).toBe('2026-08-01')
  })

  it('fyller gap MELLOM to oppføringer i samme serie med én spenn-rad', () => {
    const endringer: Endring[] = [
      { versjon: 'V3.5.20', dato: '2026-08-10', tekst: 'Nyeste' },
      { versjon: 'V3.5.15', dato: '2026-08-01', tekst: 'Eldre' },
    ]
    const rader = byggEndringslogg(endringer, 'V3.5.20')
    expect(rader.map(r => ({ visning: r.visning, mindre: r.mindre, tekst: r.tekst }))).toEqual([
      { visning: 'V3.5.20', mindre: false, tekst: 'Nyeste' },
      // gap 16..19 mellom de to skrevne oppføringene
      { visning: 'V3.5.16–19', mindre: true, tekst: MINDRE_TEKST },
      { visning: 'V3.5.15', mindre: false, tekst: 'Eldre' },
    ])
  })

  it('fyller gap PÅ TOPPEN når gjeldende versjon er nyere enn siste oppføring', () => {
    const endringer: Endring[] = [{ versjon: 'V3.5.30', dato: '2026-08-01', tekst: 'Skrevet' }]
    const rader = byggEndringslogg(endringer, 'V3.5.34')
    expect(rader).toHaveLength(2)
    expect(rader[0]).toMatchObject({ visning: 'V3.5.31–34', mindre: true, tekst: MINDRE_TEKST })
    expect(rader[0].dato).toBeUndefined()
    expect(rader[1]).toMatchObject({ visning: 'V3.5.30', mindre: false, tekst: 'Skrevet' })
  })

  it('nabo-versjoner (patch-differanse nøyaktig 1) gir ingen fyllrad', () => {
    const endringer: Endring[] = [
      { versjon: 'V3.5.21', dato: '2026-08-10', tekst: 'Nyeste' },
      { versjon: 'V3.5.20', dato: '2026-08-09', tekst: 'Eldre' },
    ]
    const rader = byggEndringslogg(endringer, 'V3.5.21')
    // Off-by-one-vakt: fyll skal kreve `> 1`, ikke `>= 1` — ellers hadde det
    // dukket opp en tom «mindre»-rad (V3.5.21–20) mellom to nabo-versjoner.
    expect(rader.map(r => r.visning)).toEqual(['V3.5.21', 'V3.5.20'])
  })

  it('topp-fyll på nøyaktig én versjon vises som enkelt tall, ikke spenn', () => {
    const endringer: Endring[] = [{ versjon: 'V3.5.30', dato: '2026-08-01', tekst: 'Skrevet' }]
    const rader = byggEndringslogg(endringer, 'V3.5.31')
    expect(rader.map(r => r.visning)).toEqual(['V3.5.31', 'V3.5.30'])
    expect(rader[0]).toMatchObject({ mindre: true, tekst: MINDRE_TEKST })
  })

  it('flere gap + topp-fyll i samme serie flettes i riktig rekkefølge', () => {
    const endringer: Endring[] = [
      { versjon: 'V3.5.30', dato: '2026-08-10', tekst: 'A' },
      { versjon: 'V3.5.25', dato: '2026-08-05', tekst: 'B' },
      { versjon: 'V3.5.24', dato: '2026-08-04', tekst: 'C' },
      { versjon: 'V3.5.10', dato: '2026-08-01', tekst: 'D' },
    ]
    const rader = byggEndringslogg(endringer, 'V3.5.35')
    expect(rader.map(r => ({ visning: r.visning, mindre: r.mindre }))).toEqual([
      { visning: 'V3.5.31–35', mindre: true }, // topp-fyll
      { visning: 'V3.5.30', mindre: false },
      { visning: 'V3.5.26–29', mindre: true },
      { visning: 'V3.5.25', mindre: false },
      { visning: 'V3.5.24', mindre: false }, // naboer: ingen fyllrad mellom 25 og 24
      { visning: 'V3.5.11–23', mindre: true },
      { visning: 'V3.5.10', mindre: false }, // ingenting genereres under eldste
    ])
  })

  it('serie-bump: gjeldende versjon i ny serie får «mindre»-rad fra 1, ikke fra forrige series patch-tall', () => {
    const endringer: Endring[] = [{ versjon: 'V3.5.30', dato: '2026-08-01', tekst: 'Siste i 3.5' }]
    const rader = byggEndringslogg(endringer, 'V3.6.1')
    expect(rader).toHaveLength(2)
    expect(rader[0]).toMatchObject({ visning: 'V3.6.1', mindre: true, tekst: MINDRE_TEKST })
    expect(rader[1]).toMatchObject({ visning: 'V3.5.30', mindre: false, tekst: 'Siste i 3.5' })
  })

  it('ingen topp-rad når gjeldende versjon er lik nyeste oppføring', () => {
    const endringer: Endring[] = [{ versjon: 'V3.5.34', dato: '2026-08-01', tekst: 'X' }]
    const rader = byggEndringslogg(endringer, 'V3.5.34')
    expect(rader).toHaveLength(1)
  })

  it('gap på tvers av serier fylles bevisst ikke', () => {
    const endringer: Endring[] = [
      { versjon: 'V3.6.5', dato: '2026-09-01', tekst: 'Ny serie' },
      { versjon: 'V3.5.30', dato: '2026-08-01', tekst: 'Gammel serie' },
    ]
    const rader = byggEndringslogg(endringer, 'V3.6.5')
    expect(rader.map(r => r.visning)).toEqual(['V3.6.5', 'V3.5.30'])
  })
})

describe('lib/endringslogg-data.ts — invarianter (må gjelde selv med tom ENDRINGER)', () => {
  const VERSJON_REGEX = /^V(\d+)\.(\d+)\.(\d+)$/

  it('alle versjonsstrenger parser', () => {
    for (const e of ENDRINGER) {
      expect(e.versjon, `«${e.versjon}» skal matche V{major}.{minor}.{patch}`).toMatch(
        VERSJON_REGEX,
      )
    }
  })

  it('er strengt synkende (nyeste først, ingen duplikater)', () => {
    const nokler = ENDRINGER.map(e => {
      const [, major, minor, patch] = VERSJON_REGEX.exec(e.versjon) ?? []
      return Number(major) * 1_000_000 + Number(minor) * 1_000 + Number(patch)
    })
    for (let i = 1; i < nokler.length; i++) {
      expect(nokler[i], `${ENDRINGER[i].versjon} skal være strengt eldre enn ${ENDRINGER[i - 1].versjon}`).toBeLessThan(
        nokler[i - 1],
      )
    }
  })

  it('dato matcher YYYY-MM-DD', () => {
    for (const e of ENDRINGER) {
      expect(e.dato, `dato for ${e.versjon}`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('ingen oppføring har høyere patch enn lib/versjon.json i samme serie', () => {
    const gjeldende = VERSJON_REGEX.exec(versjon.versjon)
    if (!gjeldende) return
    const [, gMajor, gMinor, gPatch] = gjeldende
    for (const e of ENDRINGER) {
      const m = VERSJON_REGEX.exec(e.versjon)
      if (!m) continue
      const [, major, minor, patch] = m
      if (major === gMajor && minor === gMinor) {
        expect(
          Number(patch),
          `${e.versjon} er nyere enn gjeldende versjon ${versjon.versjon}`,
        ).toBeLessThanOrEqual(Number(gPatch))
      }
    }
  })

  it('tekst er ikke tom og ikke lik MINDRE_TEKST', () => {
    for (const e of ENDRINGER) {
      expect(e.tekst.trim().length, `tekst for ${e.versjon}`).toBeGreaterThan(0)
      expect(e.tekst, `${e.versjon} skal ha en skrevet tekst, ikke standardteksten`).not.toBe(
        MINDRE_TEKST,
      )
    }
  })
})
