// #688: middleware.ts sin config.matcher styrer HVILKE forespørsler som i
// det hele tatt treffer middleware-funksjonen. En path som faller UTENFOR
// matcheren blir aldri sjekket mot auth i det hele tatt (uavhengig av
// unntaks-blokken øverst i middleware() selv) — de to må stemme overens.
//
// Matcheren kompileres av Next (tryToParsePath, path-to-regexp) til en
// faktisk RegExp ved bygg. Vi bruker samme Next-interne funksjon her i
// stedet for å skrive en parallell regex for hånd, som ville drevet fra den
// ekte matcheren uten at noen test så det.

import { describe, it, expect } from 'vitest'
import { tryToParsePath } from 'next/dist/lib/try-to-parse-path'
import { config } from '@/middleware'

function matcher(pathname: string): boolean {
  const [pattern] = config.matcher
  const { regexStr } = tryToParsePath(pattern)
  if (!regexStr) throw new Error('klarte ikke parse matcher-mønsteret')
  return new RegExp(regexStr).test(pathname)
}

describe('middleware.ts — config.matcher (#688)', () => {
  it('ekskluderer /api/logg-feil (anonym feilrapportering skal aldri gjennom auth-porten)', () => {
    expect(matcher('/api/logg-feil')).toBe(false)
  })

  it('ekskluderer /api/ping (uendret av #688)', () => {
    expect(matcher('/api/ping')).toBe(false)
  })

  it('inkluderer vanlige app-sider', () => {
    expect(matcher('/agenda')).toBe(true)
    expect(matcher('/login')).toBe(true)
  })
})
