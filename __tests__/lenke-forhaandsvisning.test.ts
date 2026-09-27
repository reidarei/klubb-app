import { describe, it, expect } from 'vitest'
import {
  erBlokkertVert,
  erPrivatIp,
  kortUrl,
  normaliserLenke,
  parseForhaandsvisning,
  velgForhaandsvisningsLenke,
} from '@/lib/lenke-forhaandsvisning-core'
import { splittPaaUrler } from '@/lib/linkify-core'
import { KLUBB_DOMENE } from '@/lib/klubb-config'

const DN =
  'https://www.dn.no/marked/finansklagenemnda/dnb/london/dnb-kunde/2-1-2045738?utm_source=dn.no&utm_medium=push'

describe('parseForhaandsvisning', () => {
  it('leser og:-tagger og dekoder entiteter', () => {
    const html = `<head>
      <meta property="og:title" content="DNB-kunde p&aring; strippeklubb &#8211; v&#229;knet">
      <meta property="og:image" content="https://image.dngroup.com/x?crop=1&amp;width=1200">
      <meta property="og:site_name" content="DN.no">
      <title>Noe annet | DN</title></head>`
    expect(parseForhaandsvisning(html, DN)).toEqual({
      tittel: 'DNB-kunde på strippeklubb – våknet',
      bilde: 'https://image.dngroup.com/x?crop=1&width=1200',
      nettsted: 'DN.no',
    })
  })

  it('faller til <title> og vertsnavn, gjør relativt bilde absolutt og tvinger https', () => {
    const html = `<title> Hei  verden </title><meta content='/b.jpg' name='twitter:image'>`
    expect(parseForhaandsvisning(html, 'http://www.eksempel.no/side')).toEqual({
      tittel: 'Hei verden',
      bilde: 'https://www.eksempel.no/b.jpg',
      nettsted: 'eksempel.no',
    })
  })

  it('null når siden ikke har tittel', () => {
    expect(parseForhaandsvisning('<meta property="og:image" content="https://x.no/a.jpg">', DN)).toBeNull()
  })
})

describe('kortUrl / normaliserLenke', () => {
  it('stripper www, protokoll og sporingsparametre', () => {
    expect(normaliserLenke(DN)).not.toContain('utm_')
    expect(kortUrl(DN)).toBe('dn.no/marked/finansklagenemnda/…')
  })

  it('kort URL beholdes uendret', () => {
    expect(kortUrl('https://vg.no/')).toBe('vg.no')
  })
})

describe('velgForhaandsvisningsLenke', () => {
  it('avsluttende lenke kan skjules i teksten', () => {
    const deler = splittPaaUrler(`Vi har fått et nytt medlem: ${DN}`)
    expect(velgForhaandsvisningsLenke(deler)).toMatchObject({ indeks: 1, erSist: true })
  })

  it('lenke midt i setningen blir stående', () => {
    const deler = splittPaaUrler('Se https://vg.no før vi drar')
    expect(velgForhaandsvisningsLenke(deler)).toMatchObject({ erSist: false })
  })

  it('lenke til appen selv får ikke kort', () => {
    expect(velgForhaandsvisningsLenke(splittPaaUrler(`https://www.${KLUBB_DOMENE}/kart`))).toBeNull()
  })
})

describe('SSRF-vakt', () => {
  it.each(['127.0.0.1', '10.1.2.3', '192.168.10.10', '172.20.0.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:10.0.0.1'])(
    '%s er privat',
    ip => expect(erPrivatIp(ip)).toBe(true),
  )
  it.each(['8.8.8.8', '151.101.1.1', '2a02:c7c::1'])('%s er offentlig', ip => expect(erPrivatIp(ip)).toBe(false))

  it('blokkerer localhost, .local og enkeltnavn', () => {
    expect(erBlokkertVert('localhost')).toBe(true)
    expect(erBlokkertVert('nas.local')).toBe(true)
    expect(erBlokkertVert('intranett')).toBe(true)
    expect(erBlokkertVert('www.dn.no')).toBe(false)
  })
})
