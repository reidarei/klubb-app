// Tidsbudsjettet for én bursdagsbilde-generering må ligge minst 10 s under
// maxDuration på rutene som kjører den (#851). Ellers drepes funksjonen midt i
// R2-opplastingen og raden henger i 'paagaar' i stedet for 'feilet'.
// maxDuration leses fra kildeteksten: Next krever en literal der.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  BURSDAGSBILDE_BUDSJETT_HENT_MS,
  BURSDAGSBILDE_BUDSJETT_MODELL_MS,
  BURSDAGSBILDE_BUDSJETT_R2_MS,
} from '@/lib/konstanter'

const MARGIN_MS = 10_000

const RUTER = [
  'app/api/cron/bursdagsbilde/route.ts',
  // genererBursdagsbildeNaa arver rute-segmentets maxDuration.
  'app/(app)/innstillinger/bursdagsbilde/page.tsx',
]

describe('bursdagsbilde-budsjett ↔ maxDuration', () => {
  const sum = BURSDAGSBILDE_BUDSJETT_HENT_MS + BURSDAGSBILDE_BUDSJETT_MODELL_MS + BURSDAGSBILDE_BUDSJETT_R2_MS

  it.each(RUTER)('%s', fil => {
    const kilde = readFileSync(path.resolve(__dirname, '..', fil), 'utf-8')
    const treff = kilde.match(/export const maxDuration\s*=\s*(\d+)/)
    expect(treff, `fant ingen maxDuration i ${fil}`).not.toBeNull()
    const maxDurationMs = Number(treff![1]) * 1000
    expect(sum + MARGIN_MS).toBeLessThanOrEqual(maxDurationMs)
  })
})
