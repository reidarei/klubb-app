import { describe, it, expect } from 'vitest'
import { dekodeCursor, enkodeCursor, type TidligereCursor } from '@/lib/tidligere-cursor'

const TOM: TidligereCursor = { a: null, m: null, p: null }

const GYLDIG_ISO = '2024-06-01T12:00:00Z'
const GYLDIG_ISO_MS = '2024-06-01T12:00:00.123Z'
const GYLDIG_ISO_TZ = '2024-06-01T12:00:00+02:00'
const GYLDIG_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef0123456789'
const ANNEN_UUID = '11111111-2222-3333-4444-555555555555'

describe('enkodeCursor + dekodeCursor', () => {
  it('roundtrip for full cursor', () => {
    const c: TidligereCursor = {
      a: [GYLDIG_ISO, GYLDIG_UUID],
      m: [GYLDIG_ISO_MS, ANNEN_UUID],
      p: [GYLDIG_ISO_TZ, GYLDIG_UUID],
    }
    expect(dekodeCursor(enkodeCursor(c))).toEqual(c)
  })

  it('roundtrip for cursor med null-felt', () => {
    const c: TidligereCursor = { a: [GYLDIG_ISO, GYLDIG_UUID], m: null, p: null }
    expect(dekodeCursor(enkodeCursor(c))).toEqual(c)
  })

  it('roundtrip for helt tom cursor', () => {
    expect(dekodeCursor(enkodeCursor(TOM))).toEqual(TOM)
  })
})

describe('dekodeCursor — defaults ved feilinput', () => {
  it('undefined → tom', () => {
    expect(dekodeCursor(undefined)).toEqual(TOM)
  })

  it('tom streng → tom', () => {
    expect(dekodeCursor('')).toEqual(TOM)
  })

  it('ugyldig base64 → tom', () => {
    // «!!!» er ikke gyldig base64url
    expect(dekodeCursor('!!!not-base64!!!')).toEqual(TOM)
  })

  it('gyldig base64 men ugyldig JSON → tom', () => {
    const ikkeJson = Buffer.from('dette er ikke json', 'utf8').toString('base64url')
    expect(dekodeCursor(ikkeJson)).toEqual(TOM)
  })

  it('JSON uten forventede felt → tom', () => {
    const tomtObj = Buffer.from('{}', 'utf8').toString('base64url')
    expect(dekodeCursor(tomtObj)).toEqual(TOM)
  })

  it('feil typer på feltene → tom', () => {
    const feilTyper = Buffer.from(
      JSON.stringify({ a: 'streng', m: 123, p: { foo: 'bar' } }),
      'utf8',
    ).toString('base64url')
    expect(dekodeCursor(feilTyper)).toEqual(TOM)
  })

  it('par av feil lengde → den feltet blir null', () => {
    const feilLengde = Buffer.from(
      JSON.stringify({ a: [GYLDIG_ISO], m: null, p: null }),
      'utf8',
    ).toString('base64url')
    expect(dekodeCursor(feilLengde)).toEqual(TOM)
  })

  it('par med tall i stedet for streng → null', () => {
    const tallIPar = Buffer.from(
      JSON.stringify({ a: [123, GYLDIG_UUID], m: null, p: null }),
      'utf8',
    ).toString('base64url')
    expect(dekodeCursor(tallIPar)).toEqual(TOM)
  })

  it('ISO med komma → null (filter-injection-forsøk avvist)', () => {
    // Bruker prøver å injisere ekstra PostgREST-filter via komma
    const injection = Buffer.from(
      JSON.stringify({
        a: [`${GYLDIG_ISO},id.eq.evil`, GYLDIG_UUID],
        m: null,
        p: null,
      }),
      'utf8',
    ).toString('base64url')
    expect(dekodeCursor(injection)).toEqual(TOM)
  })

  it('ISO med parentes → null', () => {
    const med_parens = Buffer.from(
      JSON.stringify({ a: [`${GYLDIG_ISO})or(true`, GYLDIG_UUID], m: null, p: null }),
      'utf8',
    ).toString('base64url')
    expect(dekodeCursor(med_parens)).toEqual(TOM)
  })

  it('ikke-UUID i id-felt → null', () => {
    const ikkeUuid = Buffer.from(
      JSON.stringify({ a: [GYLDIG_ISO, 'bare-noe-tull'], m: null, p: null }),
      'utf8',
    ).toString('base64url')
    expect(dekodeCursor(ikkeUuid)).toEqual(TOM)
  })

  it('UUID med komma → null', () => {
    const injectionUuid = Buffer.from(
      JSON.stringify({
        a: [GYLDIG_ISO, `${GYLDIG_UUID},id.eq.evil`],
        m: null,
        p: null,
      }),
      'utf8',
    ).toString('base64url')
    expect(dekodeCursor(injectionUuid)).toEqual(TOM)
  })

  it('delvis gyldig — gyldige felt beholdes, ugyldige blir null', () => {
    const blandet = Buffer.from(
      JSON.stringify({
        a: [GYLDIG_ISO, GYLDIG_UUID],
        m: ['ikke-iso', GYLDIG_UUID],
        p: [GYLDIG_ISO_MS, 'ikke-uuid'],
      }),
      'utf8',
    ).toString('base64url')
    expect(dekodeCursor(blandet)).toEqual({
      a: [GYLDIG_ISO, GYLDIG_UUID],
      m: null,
      p: null,
    })
  })
})
