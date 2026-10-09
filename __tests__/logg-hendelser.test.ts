// Registeret i lib/logg-hendelser.ts holdes i takt med koden fra to kanter:
// typen gir typefeil på et event-navn som mangler i registeret, og denne
// testen feiler på en oppføring ingen kode bruker lenger. (#849)

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROT = path.resolve(__dirname, '..')
const REGISTER = path.join(ROT, 'lib', 'logg-hendelser.ts')
// public/ er med fordi sw.js sender push.klikk-eventene uten typesjekk.
const KILDEMAPPER = ['app', 'lib', 'components', 'public']
const KILDEFILER = ['instrumentation.ts']

function kildefiler(): string[] {
  const ut: string[] = KILDEFILER.map((f) => path.join(ROT, f))
  const gaa = (mappe: string) => {
    for (const d of fs.readdirSync(mappe, { withFileTypes: true })) {
      const p = path.join(mappe, d.name)
      if (d.isDirectory()) gaa(p)
      else if (/\.(ts|tsx|js|mjs)$/.test(d.name) && p !== REGISTER) ut.push(p)
    }
  }
  for (const m of KILDEMAPPER) gaa(path.join(ROT, m))
  return ut
}

function registrerteNavn(): string[] {
  const kilde = fs.readFileSync(REGISTER, 'utf8')
  const blokk = kilde.slice(kilde.indexOf('export interface LoggHendelser'))
  const slutt = blokk.indexOf('\n}')
  return [...blokk.slice(0, slutt).matchAll(/^ {2}'([^']+)': true$/gm)].map((m) => m[1])
}

describe('lib/logg-hendelser.ts', () => {
  const navn = registrerteNavn()

  it('registeret er lest (vakt mot at parsingen stille gir 0 navn)', () => {
    expect(navn.length).toBeGreaterThan(100)
  })

  it('ingen dubletter', () => {
    expect(navn.length).toBe(new Set(navn).size)
  })

  it('hvert registrerte event brukes som streng-literal et sted i koden', () => {
    const alt = kildefiler().map((f) => fs.readFileSync(f, 'utf8')).join('\n')
    const ubrukte = navn.filter(
      (n) => !alt.includes(`'${n}'`) && !alt.includes(`"${n}"`) && !alt.includes(`\`${n}\``),
    )
    expect(ubrukte, 'fjern oppføringene fra lib/logg-hendelser.ts, eller finn kallstedet som forsvant').toEqual([])
  })
})
