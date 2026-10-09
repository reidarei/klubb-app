// SERVER_WHITELIST (lib/sentry-scrub.ts) filtrerer kun event.extra i Sentry.
// Den kan ikke importere KONTEKST_WHITELIST fra lib/logg.ts (logg.ts importerer
// sentry-scrub, og sentry-scrub kjører også i edge-configen), så kontrakten
// mellom dem holdes her (#851):
//   1. Hver nøkkel koden setter som Sentry-extra står i SERVER_WHITELIST —
//      ellers strippes den stille.
//   2. SERVER_WHITELIST slipper aldri gjennom noe loggens egne whitelists
//      (server og /api/logg-feil) ikke regner som trygt. 'ctx' er unntaket:
//      en beholder hvis innhold er scrubbet før den settes.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { SERVER_WHITELIST } from '@/lib/sentry-scrub'
import { KONTEKST_WHITELIST as SERVER_KONTEKST } from '@/lib/logg'
import { KONTEKST_WHITELIST as KLIENT_KONTEKST } from '@/lib/logg-sanitering'

const ROT = path.resolve(__dirname, '..')

function kildefiler(mappe: string): string[] {
  return readdirSync(mappe).flatMap(navn => {
    const full = path.join(mappe, navn)
    if (statSync(full).isDirectory()) return kildefiler(full)
    return /\.(ts|tsx)$/.test(navn) ? [full] : []
  })
}

const FILER = [
  ...['lib', 'app', 'components'].flatMap(m => kildefiler(path.join(ROT, m))),
  ...readdirSync(ROT).filter(f => /\.ts$/.test(f)).map(f => path.join(ROT, f)),
]

describe('SERVER_WHITELIST ↔ loggens whitelists', () => {
  it('hver setExtra-nøkkel i koden står i SERVER_WHITELIST', () => {
    const brudd: string[] = []
    let antall = 0
    for (const fil of FILER) {
      const kilde = readFileSync(fil, 'utf-8')
      for (const m of kilde.matchAll(/setExtra\(\s*['"`]([^'"`]+)['"`]/g)) {
        antall++
        if (!SERVER_WHITELIST.has(m[1])) brudd.push(`${path.relative(ROT, fil)}: ${m[1]}`)
      }
      // setExtras({ … }) og extra: { … } brukes ikke i dag; dukker de opp,
      // må denne testen lære å lese dem.
      if (/setExtras\(|captureException\([^)]*\{\s*extra\s*:/.test(kilde)) {
        brudd.push(`${path.relative(ROT, fil)}: setExtras/extra-objekt — utvid testen`)
      }
    }
    expect(antall).toBeGreaterThan(0) // lib/logg.ts setter minst 'event'
    expect(brudd).toEqual([])
  })

  it('SERVER_WHITELIST ⊆ KONTEKST_WHITELIST i lib/logg.ts og lib/logg-sanitering.ts', () => {
    const utenfor = [...SERVER_WHITELIST]
      .filter(k => k !== 'ctx')
      .filter(k => !SERVER_KONTEKST.has(k) || !KLIENT_KONTEKST.has(k))
    expect(utenfor).toEqual([])
  })
})
