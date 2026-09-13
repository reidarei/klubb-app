// Pinner open-redirect-vakten i lib/pending-nav.ts (#688). lokalSti() er den
// eneste porten et push-klikk-mål (levert via Cache Storage, dermed
// klientkontrollert) passerer før det brukes i en window.location.assign()
// eller router.push() — en glipp her er en åpen redirect.
//
// example.com brukes bevisst i stedet for et klubbnavn: fila deles med det
// offentlige nedstrøms-repoet (klubb-app), og lekkasjevakten i
// scripts/sync-klubb-app.mjs greper etter klubbidentitet.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { lokalSti } from '@/lib/pending-nav'

const OPPRINNELIG_LOCATION = window.location

function settOrigin(href: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: new URL(href),
  })
}

beforeEach(() => {
  settOrigin('https://example.com/agenda')
})

afterEach(() => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: OPPRINNELIG_LOCATION,
  })
})

describe('lokalSti (#688)', () => {
  it('relativ sti gir seg selv tilbake', () => {
    expect(lokalSti('/tidligere')).toBe('/tidligere')
  })

  it('absolutt same-origin URL reduseres til pathname+search+hash', () => {
    expect(lokalSti('https://example.com/samtaler/1?fra=push')).toBe('/samtaler/1?fra=push')
  })

  it('bevarer query OG hash', () => {
    expect(lokalSti('/arrangementer/9?fane=chat#kommentar-42')).toBe(
      '/arrangementer/9?fane=chat#kommentar-42',
    )
  })

  it('protokoll-relativ kryss-origin URL avvises', () => {
    expect(lokalSti('//evil.example/x')).toBeNull()
  })

  // Same-origin, men STIEN er protokoll-relativ: new URL() beholder
  // `//evil.example` som pathname, og både window.location.assign() og
  // router.push() resolver den formen til en EKSTERN origin. Origin-sjekken
  // alene slipper den gjennom (review av #688).
  it('same-origin URL med protokoll-relativ sti avvises', () => {
    expect(lokalSti('https://example.com//evil.example')).toBeNull()
    expect(lokalSti('https://example.com//evil.example/sti?a=1#b')).toBeNull()
  })

  it('absolutt kryss-origin URL avvises', () => {
    expect(lokalSti('https://evil.example/x')).toBeNull()
  })

  it('javascript: avvises', () => {
    expect(lokalSti('javascript:alert(1)')).toBeNull()
  })

  it('malformert URL avvises', () => {
    expect(lokalSti('http://[')).toBeNull()
  })
})
