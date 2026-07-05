import { describe, it, expect } from 'vitest'
import { bildeSti, videoSti, albumSti, nyttR2Filnavn } from '@/lib/bilde-utils'

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
