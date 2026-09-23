import fs from 'node:fs'
import path from 'node:path'

/**
 * Grensen feil_logg-vakten i sider-laster.spec.ts filtrerer på: høyeste
 * feil_logg.id da KJØRINGEN startet, satt av e2e/global-setup.ts.
 *
 * Hvorfor fil og ikke process.env: globalSetup kjører i runner-prosessen, mens
 * testene kjører i worker-prosesser som forkes fra den. En env-variabel satt i
 * globalSetup ville i praksis arves, men ikke ved en worker-restart etter en
 * krasj — og hele poenget med grepet er at grensen skal være uavhengig av
 * worker-livssyklusen (se begrunnelsen i global-setup.ts).
 *
 * Filen legges i e2e/.auth/ fordi mappen allerede er gitignorert (tokens) og
 * IKKE ryddes av Playwright mellom retries — test-results/ tømmes ved
 * kjøringsstart og er derfor ikke et trygt sted for en grense som skal leve
 * hele kjøringen.
 */
export const GRENSE_FIL = path.resolve(__dirname, '../.auth/feil-logg-grense.json')

export function skrivFeilLoggGrense(maksId: number) {
  fs.mkdirSync(path.dirname(GRENSE_FIL), { recursive: true })
  fs.writeFileSync(GRENSE_FIL, JSON.stringify({ maksId }), 'utf8')
}

/** Rydder bort en grense fra en tidligere kjøring, så ingen vakt kan lese stale tall. */
export function fjernFeilLoggGrense() {
  fs.rmSync(GRENSE_FIL, { force: true })
}

/**
 * Leser grensen. Kaster hvis den mangler eller er ugyldig — en vakt uten grense
 * er en vakt som ikke vet hva den ser på, og skal si det høyt i stedet for å
 * lese hele tabellen (falskt rødt) eller ingenting (falskt grønt).
 */
export function lesFeilLoggGrense(): number {
  if (!fs.existsSync(GRENSE_FIL)) {
    throw new Error(
      `feil_logg-grensen mangler (${GRENSE_FIL}) — e2e/global-setup.ts kjørte ikke. ` +
        'Kjør via `npx playwright test` (ikke en egen runner) og se docs/test-instans.md.',
    )
  }
  const raa = JSON.parse(fs.readFileSync(GRENSE_FIL, 'utf8')) as { maksId?: unknown }
  if (typeof raa.maksId !== 'number' || !Number.isFinite(raa.maksId)) {
    throw new Error(`feil_logg-grensen i ${GRENSE_FIL} er ugyldig: ${JSON.stringify(raa)}`)
  }
  return raa.maksId
}
