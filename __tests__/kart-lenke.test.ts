import { describe, it, expect } from 'vitest'
import { byggStedLenke, parseStedParam } from '@/lib/kart-lenke'

// #719: lenken bærer koordinatet, ikke en rad-id — en markering utløper, men
// lenken i chatloggen skal fortsatt virke.
describe('kart-lenke (#719)', () => {
  it('bygger en lenke med fem desimaler', () => {
    const url = byggStedLenke('https://klubb.test', 59.913872345, 10.752251)
    expect(url).toBe('https://klubb.test/kart?lat=59.91387&lng=10.75225')
  })

  it('strips trailing slash fra origin', () => {
    const url = byggStedLenke('https://klubb.test/', 59.9, 10.7)
    expect(url.startsWith('https://klubb.test/kart?')).toBe(true)
    expect(url).not.toContain('.test//kart')
  })

  it('legger på tekst-parameter når oppgitt', () => {
    const url = byggStedLenke('https://klubb.test', 59.9, 10.7, 'Vi sitter her')
    expect(url).toContain('tekst=Vi+sitter+her')
  })

  it('utelater tekst-parameter når tekst er tom eller mangler', () => {
    expect(byggStedLenke('https://klubb.test', 59.9, 10.7)).not.toContain('tekst=')
    expect(byggStedLenke('https://klubb.test', 59.9, 10.7, '   ')).not.toContain('tekst=')
  })

  it('parser gyldige koordinater', () => {
    expect(parseStedParam({ lat: '59.91387', lng: '10.75225' })).toEqual({
      lat: 59.91387,
      lng: 10.75225,
      tekst: null,
    })
  })

  it('parser tekst-parameter når den finnes', () => {
    expect(parseStedParam({ lat: '59.9', lng: '10.7', tekst: 'Vi sitter her' })).toEqual({
      lat: 59.9,
      lng: 10.7,
      tekst: 'Vi sitter her',
    })
  })

  it('gir null for manglende parametre', () => {
    expect(parseStedParam({})).toBeNull()
    expect(parseStedParam({ lat: '59.9' })).toBeNull()
  })

  it('gir null for ugyldige tall (fail-closed, ikke krasj)', () => {
    expect(parseStedParam({ lat: 'abc', lng: '10.7' })).toBeNull()
    expect(parseStedParam({ lat: '59.9', lng: 'xyz' })).toBeNull()
  })

  it('gir null for koordinater utenfor gyldig område', () => {
    expect(parseStedParam({ lat: '95', lng: '10.7' })).toBeNull()
    expect(parseStedParam({ lat: '59.9', lng: '200' })).toBeNull()
  })
})
