import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { bildeSti, videoSti, albumSti, nyttR2Filnavn, bildeSrc } from '@/lib/bilde-utils'

describe('bildeSti – filnavn-sanitering', () => {
  it('kaster ved path-traversal (../)', () => {
    expect(() => bildeSti('arrangementer', '../x.jpg')).toThrow()
  })

  it('kaster ved mappekomponent (/)', () => {
    expect(() => bildeSti('arrangementer', 'a/b.jpg')).toThrow()
  })

  it('kaster ved Windows-separator (\\)', () => {
    expect(() => bildeSti('arrangementer', 'a\\b.jpg')).toThrow()
  })

  it('kaster ved skjult fil (starter med .)', () => {
    expect(() => bildeSti('arrangementer', '.env')).toThrow()
  })

  it('kaster ved tegn utenfor whitelist', () => {
    expect(() => bildeSti('arrangementer', 'fil med mellomrom.jpg')).toThrow()
    expect(() => bildeSti('arrangementer', 'fil;sletting.jpg')).toThrow()
  })

  it('godtar gyldig server-generert filnavn', () => {
    expect(bildeSti('arrangementer', '1720123456789-abc123.jpg')).toBe(
      'arrangementer/1720123456789-abc123.jpg',
    )
  })
})

describe('videoSti – filnavn-sanitering', () => {
  it('kaster ved path-traversal', () => {
    expect(() => videoSti('chat', '../evil.mp4')).toThrow()
  })

  it('godtar gyldig filnavn', () => {
    expect(videoSti('chat', '1720123456789-abc.mp4')).toBe(
      'video/chat/1720123456789-abc.mp4',
    )
  })
})

describe('albumSti – albumId og filnavn-sanitering', () => {
  const gyldigUuid = '12345678-1234-1234-1234-123456789abc'

  it('kaster ved ugyldig albumId (ikke UUID)', () => {
    expect(() => albumSti('ikke-uuid', 'bilde.jpg')).toThrow()
    expect(() => albumSti('', 'bilde.jpg')).toThrow()
    expect(() => albumSti('../hack', 'bilde.jpg')).toThrow()
  })

  it('kaster ved ugyldig filnavn', () => {
    expect(() => albumSti(gyldigUuid, '../x.jpg')).toThrow()
    expect(() => albumSti(gyldigUuid, 'a/b.jpg')).toThrow()
  })

  it('godtar gyldig UUID og filnavn', () => {
    expect(albumSti(gyldigUuid, '1720-abc.jpg')).toBe(
      `album/${gyldigUuid}/1720-abc.jpg`,
    )
  })

  it('godtar uppercase UUID (case-insensitiv)', () => {
    // gen_random_uuid() gir lowercase, men regexen skal være robust for
    // uppercase-varianter fra andre kilder — se #413.
    const upper = gyldigUuid.toUpperCase()
    expect(albumSti(upper, '1720-abc.jpg')).toBe(
      `album/${upper}/1720-abc.jpg`,
    )
  })

  it('godtar thumb_-prefiks-filnavn', () => {
    expect(albumSti(gyldigUuid, 'thumb_1720-abc.jpg')).toBe(
      `album/${gyldigUuid}/thumb_1720-abc.jpg`,
    )
  })
})

describe('bildeSrc – trakt for lagrede bilde-URL-er (#609)', () => {
  it('R2-URL returneres uendret', () => {
    const url = 'https://pub-abc123.r2.dev/arrangementer/1720123456789-abc123.jpg'
    expect(bildeSrc(url)).toBe(url)
  })

  it('Supabase Storage-URL returneres uendret', () => {
    const url = 'https://tdlfswmxezjdnxcbbiwn.supabase.co/storage/v1/object/public/profilbilder/x.jpg'
    expect(bildeSrc(url)).toBe(url)
  })

  it('blob:-URL returneres uendret — regresjonsvakt for optimistisk chat-forhåndsvisning', () => {
    // ChatMeldingRad mottar blob:-URL-er gjennom samme prop som lagrede
    // bilde_url-er mens et bilde er under opplasting (se Chat.tsx). Slipper
    // ikke bildeSrc() denne uendret gjennom, forsvinner forhåndsvisningen.
    const url = 'blob:http://localhost:3000/12345678-1234-1234-1234-123456789abc'
    expect(bildeSrc(url)).toBe(url)
  })

  it('lokal sti returneres uendret', () => {
    expect(bildeSrc('/bakgrunn.jpg')).toBe('/bakgrunn.jpg')
  })

  it('null gir null', () => {
    expect(bildeSrc(null)).toBeNull()
  })

  it('undefined gir null', () => {
    expect(bildeSrc(undefined)).toBeNull()
  })

  it('tom streng gir null', () => {
    expect(bildeSrc('')).toBeNull()
  })

  it('ytelseskontrakt: ren synkron funksjon, ikke async', () => {
    // Funksjonen skal ALDRI bli async eller gjøre I/O — se kommentar i
    // lib/bilde-utils.ts. En async-versjon ville brutt server component-
    // rendring på tvers av kodebasen uten en varslende type-endring.
    // AsyncFunction.constructor.name er 'AsyncFunction', så denne fanger det.
    expect(bildeSrc.constructor.name).toBe('Function')
  })

  it('ytelseskontrakt: bilde-utils importerer ingenting (heller ikke lib/r2.ts)', () => {
    // Andre halvdel av samme kontrakt: ingen I/O betyr ingen avhengigheter.
    // Modulen bundles også på klienten (komprimer/lagThumbnail), så et
    // server-only import som lib/r2.ts ville både brutt klient-bygget og
    // gjort bildeSrc() til noe annet enn en ren strengoperasjon. Vi leser
    // kilden fremfor å inspisere runtime, fordi et ubrukt import er usynlig
    // etter transpilering.
    const kilde = readFileSync(join(process.cwd(), 'lib', 'bilde-utils.ts'), 'utf8')
    const importLinjer = kilde.split('\n').filter(l => /^\s*import\s/.test(l))
    expect(importLinjer).toEqual([])
  })
})

describe('nyttR2Filnavn', () => {
  it('genererer filnavn med korrekt endelse og ikke-tomt hex-suffiks', () => {
    // Suffikset er 12 hex-tegn fra crypto.randomUUID() — alltid ikke-tomt.
    const navn = nyttR2Filnavn('jpg')
    expect(navn).toMatch(/^[0-9]+-[0-9a-f]{12}\.jpg$/)
  })

  it('to kall gir ulike filnavn', () => {
    expect(nyttR2Filnavn('jpg')).not.toBe(nyttR2Filnavn('jpg'))
  })
})
