import { describe, it, expect } from 'vitest'
import {
  googleMapsAppUrl,
  googleMapsNettUrl,
  googleMapsAppUrlAdresse,
  googleMapsNettUrlAdresse,
} from '@/lib/kart-navigasjon'

// Koordinatene er det eneste som betyr noe i disse URL-ene: forsvinner de,
// åpner lenka bare Google Maps uten mål, og knappen er verdiløs. Testen står
// derfor på at nøyaktig de tallene kommer med, i riktig rekkefølge.
describe('kart-navigasjon (#711)', () => {
  const LAT = 59.9139
  const LNG = 10.7522

  it('app-URL-en bruker Google Maps sitt eget skjema med daddr', () => {
    const url = googleMapsAppUrl(LAT, LNG)
    // Skjemaet er hele poenget: https ville åpnet en in-app-nettleser oppå
    // PWA-en i stedet for å hoppe rett til appen.
    expect(url.startsWith('comgooglemaps://')).toBe(true)
    expect(url).toContain(`daddr=${LAT},${LNG}`)
  })

  it('nett-URL-en er Googles universal dir-format', () => {
    const url = googleMapsNettUrl(LAT, LNG)
    expect(url).toContain('google.com/maps/dir/')
    expect(url).toContain('api=1')
    expect(url).toContain(`destination=${LAT},${LNG}`)
  })

  it('lat og lng kommer i riktig rekkefølge, ikke omvendt', () => {
    // En ombytting ville sendt gutta til feil verdensdel uten at noe feilet.
    const url = googleMapsNettUrl(59.9, 10.7)
    expect(url).toContain('destination=59.9,10.7')
    expect(url).not.toContain('destination=10.7,59.9')
  })

  it('negative koordinater beholder fortegnet', () => {
    // Vestlig lengdegrad og sørlig bredde finnes — Island-turen lå på −22°.
    expect(googleMapsNettUrl(-33.86, -151.2)).toContain('destination=-33.86,-151.2')
    expect(googleMapsAppUrl(-33.86, -151.2)).toContain('daddr=-33.86,-151.2')
  })
})

// #732: en timeplan-post kan navigeres via ADRESSE i stedet for koordinat —
// Google er bedre på gateadresser enn vår egen Nominatim-geokoding.
describe('kart-navigasjon — adresse-variant (#732)', () => {
  it('app-URL-en url-enkoder adressen', () => {
    const url = googleMapsAppUrlAdresse('Karl Johans gate 1')
    expect(url.startsWith('comgooglemaps://')).toBe(true)
    expect(url).toContain('daddr=Karl%20Johans%20gate%201')
  })

  it('nett-URL-en url-enkoder adressen', () => {
    const url = googleMapsNettUrlAdresse('Karl Johans gate 1')
    expect(url).toContain('google.com/maps/dir/')
    expect(url).toContain('destination=Karl%20Johans%20gate%201')
  })

  it('spesialtegn i adressen enkodes trygt', () => {
    const url = googleMapsNettUrlAdresse('Café & Bar, Oslo')
    expect(url).toContain(encodeURIComponent('Café & Bar, Oslo'))
  })
})
